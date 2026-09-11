import { ApplicationCommandOptionType } from "discord.js";
import { getTrainPositions, resolveOperationalContext } from "@/lib/elesite";
import type { ElesiteTrainPosition } from "@/lib/elesite";
import { getOperationalDay } from "@/lib/jst";
import { isKnownLine, lineLabel, searchLines, stripRouteTag } from "@/lib/train-lines";
import { buildNoticeMessage, lineEmojiPrefix } from "@/lib/train";
import type {
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const MAX_PER_DIRECTION = 12;

const lineOptions = [
  {
    name: "line",
    description: "路線を選択してください",
    nameLocalizations: { ja: "路線" },
    descriptionLocalizations: { ja: "路線を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
] as const;

export const lineConfig: SubcommandConfig<typeof lineOptions> = {
  name: "line",
  description: "路線を走行中の列車を一覧表示します",
  descriptionLocalizations: { ja: "路線を走行中の列車を一覧表示します" },
  options: lineOptions,
};

export const lineAutocomplete: AutocompleteHandlers<typeof lineOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
};

function formatTrain(train: ElesiteTrainPosition): string {
  const sharyo = train.sharyo_list ? `　-# ${train.sharyo_list}` : "";
  return `\`${stripRouteTag(train.retsuban).padEnd(8)}\` ${stripRouteTag(train.shubetsu)} ${train.ikisaki}ゆき${sharyo}`;
}

function section(title: string, list: ElesiteTrainPosition[]): string {
  if (list.length === 0) return "";
  const shown = list.slice(0, MAX_PER_DIRECTION).map(formatTrain).join("\n");
  const more =
    list.length > MAX_PER_DIRECTION ? `\n-# 他 ${list.length - MAX_PER_DIRECTION} 本` : "";
  return `**${title}** (${list.length}本)\n${shown}${more}`;
}

export function buildLineMessage(
  rosenCode: string,
  trains: ElesiteTrainPosition[],
  now: Date = new Date(),
) {
  const label = lineLabel(rosenCode);
  const day = getOperationalDay(now);

  if (trains.length === 0) {
    return buildNoticeMessage(
      `## 🚆 運行中の列車\n**${label}**\n${day.currentTime} 現在、運行中の列車はありません。`,
    );
  }

  const body = [
    section(
      "上り",
      trains.filter((t) => t.direction === "nobori"),
    ),
    section(
      "下り",
      trains.filter((t) => t.direction === "kudari"),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return buildNoticeMessage(
    `## ${lineEmojiPrefix(rosenCode)}運行中の列車\n**${label}**　${day.currentTime} 現在　計 ${trains.length} 本\n\n${body}`,
  );
}

export const lineExecute: SubcommandExecuteFunction<typeof lineOptions> = async (
  interaction,
  options,
) => {
  const rosenCode = options.line;
  if (!isKnownLine(rosenCode)) {
    return interaction.reply({
      content: "路線が正しく選択されていません。候補から選んでください。",
      flags: "Ephemeral",
    });
  }

  const context = await resolveOperationalContext(rosenCode);
  if (!context) {
    return interaction.reply(
      buildNoticeMessage(
        `## 🚆 運行中の列車\n**${lineLabel(rosenCode)}**\nダイヤ情報を取得できませんでした。`,
      ),
    );
  }

  const positions = await getTrainPositions(rosenCode, context.dayId);
  return interaction.reply(buildLineMessage(rosenCode, positions?.train_position ?? []));
};
