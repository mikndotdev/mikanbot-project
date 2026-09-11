import { ApplicationCommandOptionType } from "discord.js";
import { getStationTimetable, resolveOperationalContext } from "@/lib/elesite";
import type { ElesiteStationTimetableEntry } from "@/lib/elesite";
import { getOperationalDay } from "@/lib/jst";
import { isKnownLine, lineLabel, searchLines, stripRouteTag } from "@/lib/train-lines";
import { searchStationsOnLine } from "@/lib/train-stations";
import { buildNoticeMessage, lineEmojiPrefix } from "@/lib/train";
import type {
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const MAX_ROWS = 10;

const stationOptions = [
  {
    name: "line",
    description: "路線を選択してください",
    nameLocalizations: { ja: "路線" },
    descriptionLocalizations: { ja: "路線を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
  {
    name: "station",
    description: "駅を選択してください",
    nameLocalizations: { ja: "駅" },
    descriptionLocalizations: { ja: "駅を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
  {
    name: "hour",
    description: "時刻（0〜27、省略時は現在時刻）",
    nameLocalizations: { ja: "時" },
    descriptionLocalizations: { ja: "時刻（0〜27、省略時は現在時刻）" },
    type: ApplicationCommandOptionType.Integer,
    required: false,
    minValue: 0,
    maxValue: 27,
  },
] as const;

export const stationConfig: SubcommandConfig<typeof stationOptions> = {
  name: "station",
  description: "駅の発車時刻表を表示します",
  descriptionLocalizations: { ja: "駅の発車時刻表を表示します" },
  options: stationOptions,
};

export const stationAutocomplete: AutocompleteHandlers<typeof stationOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
  station: (_interaction, ctx) => {
    const line = ctx.options.line;
    if (!isKnownLine(line)) return [{ name: "先に路線を選択してください", value: "-" }];
    const hits = searchStationsOnLine(line, ctx.value);
    return hits.length > 0 ? hits : [{ name: "該当する駅がありません", value: "-" }];
  },
};

function formatRow(entry: ElesiteStationTimetableEntry): string {
  const platform = /^\d+$/.test(entry.bansen ?? "") ? `　${entry.bansen}番線` : "";
  const kind = entry.train_type && entry.train_type !== "発" ? `　-# ${entry.train_type}` : "";
  return `\`${entry.train_time}\` ${stripRouteTag(entry.shubetsu)} ${entry.ikisaki}ゆき　-# ${stripRouteTag(entry.retsuban)}${platform}${kind}`;
}

export function buildStationMessage(
  rosenCode: string,
  station: string,
  hour: number,
  nobori: ElesiteStationTimetableEntry[],
  kudari: ElesiteStationTimetableEntry[],
) {
  const label = lineLabel(rosenCode);
  const head = `## ${lineEmojiPrefix(rosenCode)}${station}　発車時刻表\n**${label}**　${String(hour).padStart(2, "0")}時台`;

  if (nobori.length === 0 && kudari.length === 0) {
    return buildNoticeMessage(`${head}\n\nこの時間帯の列車はありません。`);
  }

  const section = (title: string, list: ElesiteStationTimetableEntry[]) => {
    if (list.length === 0) return "";
    const rows = list.slice(0, MAX_ROWS).map(formatRow).join("\n");
    const more = list.length > MAX_ROWS ? `\n-# 他 ${list.length - MAX_ROWS} 本` : "";
    return `**${title}** (${list.length}本)\n${rows}${more}`;
  };

  return buildNoticeMessage(
    `${head}\n\n${[section("上り", nobori), section("下り", kudari)].filter(Boolean).join("\n\n")}`,
  );
}

export const stationExecute: SubcommandExecuteFunction<typeof stationOptions> = async (
  interaction,
  options,
) => {
  const rosenCode = options.line;
  const station = options.station;

  if (!isKnownLine(rosenCode) || station === "-") {
    return interaction.reply({
      content: "路線と駅を候補から選んでください。",
      flags: "Ephemeral",
    });
  }

  const day = getOperationalDay();
  const hour = options.hour ?? day.hour;

  const context = await resolveOperationalContext(rosenCode);
  if (!context) {
    return interaction.reply(
      buildNoticeMessage(`## 🚆 発車時刻表\nダイヤ情報を取得できませんでした。`),
    );
  }

  const timetable = await getStationTimetable(
    rosenCode,
    station,
    hour,
    context.dayId,
    context.selectDate,
  );

  return interaction.reply(
    buildStationMessage(
      rosenCode,
      station,
      hour,
      timetable?.nobori_timetable ?? [],
      timetable?.kudari_timetable ?? [],
    ),
  );
};
