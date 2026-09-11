import { ApplicationCommandOptionType, AttachmentBuilder } from "discord.js";
import {
  getMapGeometry,
  getMapTrainPositions,
  getTrainPositions,
  resolveOperationalContext,
} from "@/lib/elesite";
import { getOperationalDay } from "@/lib/jst";
import { isKnownLine, lineLabel, searchLines } from "@/lib/train-lines";
import { renderTrainMap } from "@/lib/train-map";
import { buildLoadingMessage, buildNoticeMessage, lineEmojiPrefix } from "@/lib/train";
import type {
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const mapOptions = [
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

export const mapConfig: SubcommandConfig<typeof mapOptions> = {
  name: "map",
  description: "路線の地図上に走行中の列車を表示します",
  descriptionLocalizations: { ja: "路線の地図上に走行中の列車を表示します" },
  options: mapOptions,
};

export const mapAutocomplete: AutocompleteHandlers<typeof mapOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
};

export const mapExecute: SubcommandExecuteFunction<typeof mapOptions> = async (
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

  const label = lineLabel(rosenCode);
  await interaction.reply(buildLoadingMessage(label));

  const context = await resolveOperationalContext(rosenCode);
  if (!context) {
    return interaction.editReply(
      buildNoticeMessage(`## 🗺️ 路線地図\n**${label}**\nダイヤ情報を取得できませんでした。`),
    );
  }

  const [tracks, trains, allPositions] = await Promise.all([
    getMapGeometry(rosenCode, context.selectDate),
    getMapTrainPositions(rosenCode, context.dayId),
    getTrainPositions(rosenCode, context.dayId),
  ]);

  if (!tracks || tracks.length === 0) {
    return interaction.editReply(
      buildNoticeMessage(
        `## 🗺️ 路線地図\n**${label}**\nこの路線の地図データは提供されていません。\n-# \`/train line\` で走行中の列車を一覧できます。`,
      ),
    );
  }

  const image = await renderTrainMap(tracks, trains ?? []);
  if (!image) {
    return interaction.editReply(
      buildNoticeMessage(`## 🗺️ 路線地図\n**${label}**\n地図の生成に失敗しました。`),
    );
  }

  const day = getOperationalDay();
  const shown = (trains ?? []).filter((t) => typeof t.lat === "number").length;
  const running = allPositions?.train_position?.length ?? shown;
  const partial =
    running > shown
      ? `\n-# 地図データのある区間のみ表示しています（走行中 ${running} 本中 ${shown} 本）`
      : "";

  return interaction.editReply({
    ...buildNoticeMessage(
      `## ${lineEmojiPrefix(rosenCode)}路線地図\n**${label}**　${day.currentTime} 現在　地図上に ${shown} 本${partial}`,
    ),
    files: [new AttachmentBuilder(image, { name: "map.png" })],
  });
};
