import * as Sentry from "@sentry/bun";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import {
  getDailyUnyou,
  getMapGeometry,
  getMapTrainPositions,
  getRailwayInfo,
  getRetsubanTimeById,
  getTrainPositions,
  latestRailwayInfo,
  RAILWAY_STATUS_NORMAL,
  resolveOperationalContext,
  sortRailwayInfo,
} from "@/lib/elesite";
import type {
  ElesitePositions,
  ElesiteUnyouLeg,
  ElesiteRailwayInfo,
  ElesiteRailwayInfoEntry,
  ElesiteRetsubanTime,
  ElesiteTimetableEntry,
  ElesiteTimetableGroup,
} from "@/lib/elesite";
import { formatHhmm, getOperationalDay, parseClockToMinutes } from "@/lib/jst";
import { lineEmoji } from "@/lib/train-logos";
import { renderTrainMap } from "@/lib/train-map";
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

export type TrainAction =
  | "refresh"
  | "prev"
  | "next"
  | "set"
  | "expand"
  | "collapse"
  | "maptrain"
  | "mapline"
  | "mapoff";

export type MapMode = "off" | "train" | "line";

export interface TrainState {
  rosenCode: string;
  retsubanId: number;
  page: number;
  expanded: boolean;
  map: MapMode;
}

const MAP_CODES: Record<MapMode, string> = { off: "0", train: "1", line: "2" };
const MAP_FROM_CODE: Record<string, MapMode> = { "0": "off", "1": "train", "2": "line" };

export function encodeTrainId(action: TrainAction, state: TrainState): string {
  return `train:${action}:${state.rosenCode}:${state.retsubanId}:${state.page}:${state.expanded ? 1 : 0}:${MAP_CODES[state.map]}`;
}

export function decodeTrainId(customId: string): { action: TrainAction; state: TrainState } | null {
  const parts = customId.split(":");
  if (parts.length !== 7 || parts[0] !== "train") return null;
  const action = parts[1] as TrainAction;
  const known: TrainAction[] = [
    "refresh",
    "prev",
    "next",
    "set",
    "expand",
    "collapse",
    "maptrain",
    "mapline",
    "mapoff",
  ];
  if (!known.includes(action)) return null;
  const retsubanId = Number(parts[3]);
  const page = Number(parts[4]);
  if (!Number.isFinite(retsubanId) || !Number.isFinite(page)) return null;
  return {
    action,
    state: {
      rosenCode: parts[2] ?? "",
      retsubanId,
      page,
      expanded: parts[5] === "1",
      map: MAP_FROM_CODE[parts[6] ?? "0"] ?? "off",
    },
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

export function statusEmoji(status: number): string {
  if (status >= 3) return "🔴";
  if (status === 2) return "🟠";
  if (status === 1) return "🟡";
  return "🔵";
}

export function formatRailwayEntry(entry: ElesiteRailwayInfoEntry): string {
  const head = [
    `${statusEmoji(entry.status)} **${entry.info ?? "運行情報"}**`,
    entry.reason ? `・${entry.reason}` : "",
    entry.direction ? `・${entry.direction}` : "",
    entry.toukou_time ? `　-# ${entry.toukou_time}` : "",
  ].join("");
  const detail = (entry.detail ?? "").trim();
  return detail ? `${head}\n${detail.split("\n").join("\n")}` : head;
}

export function buildDisruptionBlock(railwayInfo: ElesiteRailwayInfo | null): string | null {
  const latest = latestRailwayInfo(railwayInfo);
  if (!latest || latest.status <= RAILWAY_STATUS_NORMAL) return null;
  const others = sortRailwayInfo(railwayInfo).filter(
    (e) => e.index !== latest.index && e.status > RAILWAY_STATUS_NORMAL,
  );
  const tail = others.length > 0 ? `\n-# 他 ${others.length} 件の運行情報` : "";
  return `${formatRailwayEntry(latest)}${tail}\n-# 利用者投稿による情報です`;
}

const MAX_UNYOU_LEGS = 7;

export function buildUnyouBlock(legs: ElesiteUnyouLeg[] | null, currentId: number): string | null {
  const runs = (legs ?? []).filter((leg) => Number(leg.retsuban_id) > 0);
  if (runs.length <= 1) return null;

  const index = runs.findIndex((leg) => Number(leg.retsuban_id) === currentId);
  const start = Math.max(0, Math.min(index - 2, runs.length - MAX_UNYOU_LEGS));
  const window = runs.slice(start, start + MAX_UNYOU_LEGS);

  const rows = window.map((leg) => {
    const isCurrent = Number(leg.retsuban_id) === currentId;
    const marker = isCurrent ? "▶" : "　";
    const times =
      typeof leg.start_time === "number" && leg.start_time >= 0
        ? `\`${formatHhmm(leg.start_time)}\``
        : "`--:--`";
    const from = leg.start_st && leg.start_st !== "データ無し" ? leg.start_st : "";
    const to = leg.ikisaki && leg.ikisaki !== "データ無し" ? leg.ikisaki : "";
    const route = from || to ? `${from}→${to}` : "";
    const name = `${stripRouteTag(leg.shubetsu ?? "")} ${stripRouteTag(leg.retsuban ?? "")}`.trim();
    const line = `${marker} ${times} ${name}　-# ${route}`;
    return isCurrent ? `**${line}**` : line;
  });

  const hidden = runs.length - window.length;
  const more = hidden > 0 ? `\n-# 他 ${hidden} 運用` : "";
  return `**本日の運用** (${runs.length}本)\n${rows.join("\n")}${more}`;
}

function parseAccent(color: string | undefined): number {
  if (!color) return ACCENT;
  const hex = color.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return ACCENT;
  return Number.parseInt(hex, 16);
}

export function lineEmojiPrefix(rosenCode: string): string {
  const logo = lineEmoji(rosenCode);
  return logo ? `${logo} ` : "";
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

export interface TrainMapResult {
  image: Buffer | null;
  located: boolean;
}

export interface BuildTrainArgs {
  state: TrainState;
  owner?: TrainOwner;
  unyou?: ElesiteUnyouLeg[] | null;
  map?: TrainMapResult | null;
  detail: ElesiteRetsubanTime;
  positions: ElesitePositions | null;
  railwayInfo: ElesiteRailwayInfo | null;
  icon: TrainIcon | null;
  now?: Date;
}

export function buildTrainMessage(args: BuildTrainArgs) {
  const { state, detail, positions, railwayInfo, icon, owner, unyou, map } = args;
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
  const disruption = buildDisruptionBlock(railwayInfo);
  const severe = (latestRailwayInfo(railwayInfo)?.status ?? 0) >= 2;
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

    if (disruption) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      );
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(disruption));
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

    const unyouBlock = buildUnyouBlock(unyou ?? null, state.retsubanId);
    if (unyouBlock) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      );
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(unyouBlock));
    }
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [statusLine, window, severe && disruption ? disruption : ""].filter(Boolean).join("\n"),
      ),
    );
  }

  if (expanded && map?.image) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://map.png").setDescription("路線地図"),
      ),
    );
    if (!map.located) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "-# この列車は地図データのある区間の外にいます（路線のみ表示）",
        ),
      );
    }
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

  if (expanded) {
    const mapRow: ButtonBuilder[] = [];
    if (state.map === "off") {
      mapRow.push(
        new ButtonBuilder()
          .setCustomId(encodeTrainId("maptrain", pagedState))
          .setLabel("地図を表示")
          .setEmoji("🗺️")
          .setStyle(ButtonStyle.Secondary),
      );
    } else {
      mapRow.push(
        state.map === "train"
          ? new ButtonBuilder()
              .setCustomId(encodeTrainId("mapline", pagedState))
              .setLabel("全線表示")
              .setEmoji("🗺️")
              .setStyle(ButtonStyle.Secondary)
          : new ButtonBuilder()
              .setCustomId(encodeTrainId("maptrain", pagedState))
              .setLabel("列車に寄る")
              .setEmoji("🔍")
              .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(encodeTrainId("mapoff", pagedState))
          .setLabel("地図を閉じる")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      );
    }
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...mapRow),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# データ: えれサイト４ ・ ${day.currentTime} 時点 (${day.selectDate} ダイヤ)`,
    ),
  );

  const files = icon ? [new AttachmentBuilder(icon.buffer, { name: icon.name })] : [];
  if (expanded && map?.image) {
    files.push(new AttachmentBuilder(map.image, { name: "map.png" }));
  }

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

  const wantsMap = state.expanded && state.map !== "off";

  const [detail, positions, railwayInfo, unyou, tracks, mapTrains] = await Promise.all([
    getRetsubanTimeById(state.retsubanId, context.selectDate),
    getTrainPositions(state.rosenCode, context.dayId, now),
    getRailwayInfo(state.rosenCode, context.selectDate),
    state.expanded ? getDailyUnyou(state.retsubanId, context.selectDate) : Promise.resolve(null),
    wantsMap ? getMapGeometry(state.rosenCode, context.selectDate) : Promise.resolve(null),
    wantsMap ? getMapTrainPositions(state.rosenCode, context.dayId, now) : Promise.resolve(null),
  ]);

  if (!detail || !detail.retsuban) {
    return buildNoticeMessage(
      "## 🚆 列車情報\n指定された列車が見つかりませんでした。ダイヤが改正された可能性があります。",
    );
  }

  const icon = await fetchTrainIcon(
    resolveTrainIconUrl(state.rosenCode, detail, positions, state.retsubanId),
  );

  let map: TrainMapResult | null = null;
  if (wantsMap && tracks && tracks.length > 0) {
    const here = (mapTrains ?? []).find(
      (t) => t.retsuban === detail.retsuban && typeof t.lat === "number",
    );
    const target = here ? { lat: here.lat as number, lng: here.lng as number } : null;
    const image = await renderTrainMap(
      tracks,
      mapTrains ?? [],
      target,
      target && state.map === "train" ? "train" : "line",
    );
    map = { image, located: Boolean(target) };
  }

  return buildTrainMessage({
    state,
    owner,
    detail,
    positions,
    railwayInfo,
    icon,
    unyou,
    map,
    now,
  });
}
