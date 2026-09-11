import * as Sentry from "@sentry/bun";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import {
  getRailwayInfo,
  getRetsubanTimeById,
  getTrainPositions,
  resolveOperationalContext,
} from "@/lib/elesite";
import type {
  ElesitePositions,
  ElesiteRailwayInfo,
  ElesiteRetsubanTime,
  ElesiteTimetableEntry,
  ElesiteTimetableGroup,
} from "@/lib/elesite";
import { getOperationalDay, parseClockToMinutes } from "@/lib/jst";
import { lineEmoji } from "@/lib/train-logos";
import {
  iconUrlFromPath,
  isShinkansen,
  lineLabel,
  lookupIconByFormation,
  PLACEHOLDER_ICON,
  stripRouteTag,
} from "@/lib/train-lines";

const ACCENT = 0xff7700;
const LOADING_EMOJI = "<a:loading:1272805571585642506>";
const BAR_CELLS = 14;
export const STOPS_PER_PAGE = 12;

export type TrainAction = "refresh" | "prev" | "next" | "set" | "expand" | "collapse";

export interface TrainState {
  rosenCode: string;
  retsubanId: number;
  page: number;
  expanded: boolean;
}

export function encodeTrainId(action: TrainAction, state: TrainState): string {
  return `train:${action}:${state.rosenCode}:${state.retsubanId}:${state.page}:${state.expanded ? 1 : 0}`;
}

export function decodeTrainId(customId: string): { action: TrainAction; state: TrainState } | null {
  const parts = customId.split(":");
  if (parts.length !== 6 || parts[0] !== "train") return null;
  const action = parts[1] as TrainAction;
  const known: TrainAction[] = ["refresh", "prev", "next", "set", "expand", "collapse"];
  if (!known.includes(action)) return null;
  const retsubanId = Number(parts[3]);
  const page = Number(parts[4]);
  if (!Number.isFinite(retsubanId) || !Number.isFinite(page)) return null;
  return {
    action,
    state: { rosenCode: parts[2] ?? "", retsubanId, page, expanded: parts[5] === "1" },
  };
}

export interface NormalizedStop {
  station: string;
  arrive: number | null;
  depart: number | null;
  arrText: string;
  depText: string;
  bansen: string;
  isPass: boolean;
}

export function mergeTimetables(
  groups: ElesiteTimetableGroup[] | undefined,
): ElesiteTimetableEntry[] {
  const merged: ElesiteTimetableEntry[] = [];
  for (const group of groups ?? []) {
    for (const entry of group.timetable ?? []) {
      const last = merged[merged.length - 1];
      if (last && last.station === entry.station) {
        merged[merged.length - 1] = {
          ...last,
          dep_time: entry.dep_time || last.dep_time,
          bansen: last.bansen || entry.bansen,
          train_type: last.train_type === "通過" ? entry.train_type : last.train_type,
        };
        continue;
      }
      merged.push(entry);
    }
  }
  return merged;
}

export function normalizeStops(entries: ElesiteTimetableEntry[]): NormalizedStop[] {
  const stops: NormalizedStop[] = [];
  let offset = 0;
  let previous = -1;

  for (const entry of entries) {
    const rawArr = parseClockToMinutes(entry.arr_time);
    const rawDep = parseClockToMinutes(entry.dep_time);

    const shift = (value: number | null): number | null => {
      if (value === null) return null;
      let shifted = value + offset;
      if (previous >= 0 && shifted < previous) {
        offset += 1440;
        shifted = value + offset;
      }
      previous = shifted;
      return shifted;
    };

    const arrive = shift(rawArr);
    const depart = shift(rawDep);

    stops.push({
      station: String(entry.station ?? ""),
      arrive,
      depart,
      arrText: entry.arr_time ?? "",
      depText: entry.dep_time ?? "",
      bansen: /^\d+$/.test(entry.bansen ?? "") ? (entry.bansen ?? "") : "",
      isPass: entry.train_type === "通過",
    });
  }

  return stops;
}

export function runsOnDate(detail: ElesiteRetsubanTime, selectDate: string): boolean {
  const days = detail.operating_days;
  if (!Array.isArray(days) || days.length === 0) return detail.is_running_today !== false;
  const dayOfMonth = Number(selectDate.slice(-2));
  if (!Number.isFinite(dayOfMonth)) return detail.is_running_today !== false;
  return days.includes(dayOfMonth);
}

export type ProgressStatus = "before" | "stopped" | "moving" | "arrived" | "unknown";

export interface TrainProgress {
  status: ProgressStatus;
  text: string;
  currentIndex: number;
  fraction: number;
}

export function deriveProgress(stops: NormalizedStop[], nowMinutes: number): TrainProgress {
  if (stops.length === 0) {
    return { status: "unknown", text: "不明", currentIndex: 0, fraction: 0 };
  }

  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  const origin = first.depart ?? first.arrive;
  const terminus = last.arrive ?? last.depart;

  const span = origin !== null && terminus !== null && terminus > origin ? terminus - origin : 0;
  const fractionAt = (minutes: number) =>
    span === 0 || origin === null ? 0 : Math.min(1, Math.max(0, (minutes - origin) / span));

  if (origin !== null && nowMinutes < origin) {
    return {
      status: "before",
      text: `${first.station} 発車前（${first.depText || first.arrText} 発）`,
      currentIndex: 0,
      fraction: 0,
    };
  }

  if (terminus !== null && nowMinutes > terminus) {
    return {
      status: "arrived",
      text: `${last.station} 到着済み（${last.arrText || last.depText} 着）`,
      currentIndex: stops.length - 1,
      fraction: 1,
    };
  }

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!;
    const arrive = stop.arrive ?? stop.depart;
    const depart = stop.depart ?? stop.arrive;
    if (arrive === null || depart === null) continue;
    if (nowMinutes >= arrive && nowMinutes <= depart) {
      return {
        status: "stopped",
        text: `${stop.station} 停車中`,
        currentIndex: i,
        fraction: fractionAt(nowMinutes),
      };
    }
    const next = stops[i + 1];
    if (!next) continue;
    const nextArrive = next.arrive ?? next.depart;
    if (nextArrive === null) continue;
    if (nowMinutes > depart && nowMinutes < nextArrive) {
      return {
        status: "moving",
        text: `${stop.station} → ${next.station} 走行中`,
        currentIndex: i,
        fraction: fractionAt(nowMinutes),
      };
    }
  }

  return { status: "unknown", text: "位置不明", currentIndex: 0, fraction: 0 };
}

const WINDOW_SIZE = 4;

export const SHINKANSEN_MARKER = "<:shinkansen_icon:1548009167980204062>";
export const TRAIN_MARKER = "🚃";

export function buildStationWindow(
  stops: NormalizedStop[],
  progress: TrainProgress,
  marker: string = TRAIN_MARKER,
): string {
  if (stops.length === 0) return "";

  const size = Math.min(WINDOW_SIZE, stops.length);
  const start = Math.max(0, Math.min(progress.currentIndex - 1, stops.length - size));
  const win = stops.slice(start, start + size);
  const atStation = progress.status !== "moving";

  const parts: string[] = [];
  win.forEach((stop, index) => {
    const global = start + index;
    const isCurrent = global === progress.currentIndex;
    parts.push(isCurrent && atStation ? `${marker}${stop.station}` : stop.station);
    if (index < win.length - 1) {
      parts.push(isCurrent && !atStation ? ` ${marker} ` : " ━━ ");
    }
  });

  return parts.join("");
}

export function progressBar(stops: NormalizedStop[], progress: TrainProgress): string {
  if (stops.length < 2) return "";
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  const marker = Math.min(BAR_CELLS - 1, Math.round(progress.fraction * (BAR_CELLS - 1)));
  const bar = Array.from({ length: BAR_CELLS }, (_, i) => (i === marker ? "◉" : "━")).join("");
  return `\`${first.station} ${bar} ${last.station}\``;
}

interface TrainIcon {
  buffer: Buffer;
  name: string;
}

const iconCache = new Map<string, TrainIcon | null>();

function detectImage(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a")
    return "png";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString("ascii") === "GIF") return "gif";
  return null;
}

export async function fetchTrainIcon(url: string | null): Promise<TrainIcon | null> {
  if (!url) return null;
  const cachedIcon = iconCache.get(url);
  if (cachedIcon !== undefined) return cachedIcon;

  let result: TrainIcon | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const format = detectImage(buffer);
      if (format) result = { buffer, name: `train.${format}` };
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "trainIcon" }, extra: { url } });
  }

  iconCache.set(url, result);
  return result;
}

export function resolveTrainIconUrl(
  rosenCode: string,
  detail: ElesiteRetsubanTime | null,
  positions: ElesitePositions | null,
  retsubanId: number,
): string | null {
  const fromDetail = iconUrlFromPath(detail?.icon_path_list?.[0]);
  if (fromDetail) return fromDetail;

  const live = positions?.train_position?.find((t) => Number(t.retsuban_id) === retsubanId);
  const fromLive = iconUrlFromPath(live?.sharyo_icon_path_list?.[0]);
  if (fromLive) return fromLive;

  const fallback = lookupIconByFormation(
    rosenCode,
    detail?.formation_list?.[0],
    detail?.hensei_list?.[0],
  );
  return fallback ?? PLACEHOLDER_ICON;
}

function parseAccent(color: string | undefined): number {
  if (!color) return ACCENT;
  const hex = color.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return ACCENT;
  return Number.parseInt(hex, 16);
}

function noticeContainer(text: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

export function buildLoadingMessage(label: string) {
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [noticeContainer(`## 🚆 \`${label}\`\n${LOADING_EMOJI} 情報を取得しています…`)],
  };
}

export function buildNoticeMessage(text: string) {
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [noticeContainer(text)],
    files: [],
    attachments: [],
  };
}

function formatStop(stop: NormalizedStop, isCurrent: boolean): string {
  const marker = isCurrent ? "▶ " : "　";
  if (stop.isPass) {
    return `-# ${marker}${stop.station}　${stop.arrText || stop.depText} 通過`;
  }
  const times: string[] = [];
  if (stop.arrText) times.push(`${stop.arrText} 着`);
  if (stop.depText) times.push(`${stop.depText} 発`);
  const platform = stop.bansen ? `　${stop.bansen}番線` : "";
  return `${marker}**${stop.station}**　${times.join(" / ") || "－"}${platform}`;
}

export function pageCount(stops: NormalizedStop[]): number {
  return Math.max(1, Math.ceil(stops.length / STOPS_PER_PAGE));
}

export function clampPage(page: number, stops: NormalizedStop[]): number {
  const total = pageCount(stops);
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(0, Math.trunc(page)), total - 1);
}

export interface TrainOwner {
  displayName: string;
  isSelf: boolean;
}

export interface BuildTrainArgs {
  state: TrainState;
  owner?: TrainOwner;
  detail: ElesiteRetsubanTime;
  positions: ElesitePositions | null;
  railwayInfo: ElesiteRailwayInfo | null;
  icon: TrainIcon | null;
  now?: Date;
}

export function buildTrainMessage(args: BuildTrainArgs) {
  const { state, detail, positions, railwayInfo, icon, owner } = args;
  const now = args.now ?? new Date();
  const day = getOperationalDay(now);

  const stops = normalizeStops(mergeTimetables(detail.timetable_list));
  const progress = deriveProgress(stops, day.minutes);
  const page = clampPage(state.page, stops);
  const totalPages = pageCount(stops);

  const isLive = Boolean(
    positions?.train_position?.some((t) => Number(t.retsuban_id) === state.retsubanId),
  );
  const runningToday = runsOnDate(detail, day.selectDate);

  let statusBadge: string;
  if (!runningToday) statusBadge = "⚫ 本日運休";
  else if (isLive) statusBadge = "🟢 運行中";
  else if (progress.status === "before") statusBadge = "🕐 発車前";
  else if (progress.status === "arrived") statusBadge = "🏁 運行終了";
  else statusBadge = "🔵 予定";

  const container = new ContainerBuilder().setAccentColor(parseAccent(positions?.rosen_color));

  const logo = lineEmoji(state.rosenCode);
  const title = `## ${logo ? `${logo} ` : ""}${stripRouteTag(detail.shubetsu)} ${stripRouteTag(detail.retsuban)}`;
  const subtitle = `${lineLabel(state.rosenCode)} ・ ${detail.ikisaki}ゆき`;
  const ownerLine = owner ? `-# 👤 ${owner.displayName} の列車\n` : "";
  const header = `${ownerLine}${title}\n${subtitle}`;

  if (icon) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(`attachment://${icon.name}`)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const expanded = state.expanded;
  const marker = isShinkansen(state.rosenCode, detail.shubetsu) ? SHINKANSEN_MARKER : TRAIN_MARKER;
  const window = runningToday ? buildStationWindow(stops, progress, marker) : "";
  const statusLine = `**現在地**　${runningToday ? progress.text : "－"}　${statusBadge}`;

  if (expanded) {
    const formation = detail.hensei_list?.length
      ? `${detail.formation_list?.[0] ?? ""}${detail.hensei_list.join("+")}`
      : (detail.formation_list?.[0] ?? "－");
    const bar = progressBar(stops, progress);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [statusLine, bar, window, `**編成**　　${formation || "－"}`].filter(Boolean).join("\n"),
      ),
    );

    const disruptions = railwayInfo?.railway_info_list ?? [];
    if (disruptions.length > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      );
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `⚠️ **運行情報**　この路線に ${disruptions.length} 件の運行情報があります。`,
        ),
      );
    }

    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    const offset = page * STOPS_PER_PAGE;
    const slice = stops.slice(offset, offset + STOPS_PER_PAGE);
    const stopLines = slice.map((stop, i) =>
      formatStop(stop, offset + i === progress.currentIndex && progress.status !== "before"),
    );
    const stopCount = stops.filter((stop) => !stop.isPass).length;
    const stopsHeading = `**停車駅** (${page + 1}/${totalPages}・全${stopCount}駅)`;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([stopsHeading, stopLines.join("\n") || "－"].join("\n")),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([statusLine, window].filter(Boolean).join("\n")),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  const pagedState = { ...state, page, expanded };
  const buttons: ButtonBuilder[] = [];

  if (expanded) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(encodeTrainId("prev", pagedState))
        .setLabel("前")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(encodeTrainId("refresh", pagedState))
      .setLabel("更新")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
  );

  if (expanded) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(encodeTrainId("next", pagedState))
        .setLabel("次")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(encodeTrainId("collapse", pagedState))
        .setLabel("折りたたむ")
        .setEmoji("🔼")
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(encodeTrainId("expand", pagedState))
        .setLabel("詳細")
        .setEmoji("🔽")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (!owner?.isSelf) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(encodeTrainId("set", pagedState))
        .setLabel("この列車に設定")
        .setEmoji("🚆")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# データ: えれサイト４ ・ ${day.currentTime} 時点 (${day.selectDate} ダイヤ)`,
    ),
  );

  const files = icon ? [new AttachmentBuilder(icon.buffer, { name: icon.name })] : [];

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container],
    files,
    attachments: [],
  };
}

export async function renderTrainView(
  state: TrainState,
  owner?: TrainOwner,
  now: Date = new Date(),
) {
  const context = await resolveOperationalContext(state.rosenCode, now);
  if (!context) {
    return buildNoticeMessage("## 🚆 列車情報\n路線のダイヤ情報を取得できませんでした。");
  }

  const [detail, positions, railwayInfo] = await Promise.all([
    getRetsubanTimeById(state.retsubanId, context.selectDate),
    getTrainPositions(state.rosenCode, context.dayId, now),
    getRailwayInfo(state.rosenCode, context.selectDate),
  ]);

  if (!detail || !detail.retsuban) {
    return buildNoticeMessage(
      "## 🚆 列車情報\n指定された列車が見つかりませんでした。ダイヤが改正された可能性があります。",
    );
  }

  const icon = await fetchTrainIcon(
    resolveTrainIconUrl(state.rosenCode, detail, positions, state.retsubanId),
  );

  return buildTrainMessage({ state, owner, detail, positions, railwayInfo, icon, now });
}
