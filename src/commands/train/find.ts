import { lineLabel } from "@/lib/train-lines";
import { buildLoadingMessage, buildNoticeMessage, renderTrainView } from "@/lib/train";
import { parseSelection, trainAutocomplete, trainOptions } from "@/commands/train/shared";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

export const findConfig: SubcommandConfig<typeof trainOptions> = {
  name: "find",
  description: "列車の現在位置と時刻表を検索します",
  descriptionLocalizations: { ja: "列車の現在位置と時刻表を検索します" },
  options: trainOptions,
};

export const findAutocomplete = trainAutocomplete;

export const findExecute: SubcommandExecuteFunction<typeof trainOptions> = async (
  interaction,
  options,
) => {
  const selection = parseSelection(options.line, options.train);
  if (typeof selection === "string") {
    return interaction.reply({ content: selection, flags: "Ephemeral" });
  }

  await interaction.reply(buildLoadingMessage(lineLabel(selection.rosenCode)));

  try {
    const message = await renderTrainView({ ...selection, page: 0, expanded: false });
    await interaction.editReply(message);
  } catch {
    await interaction.editReply(
      buildNoticeMessage("## 🚆 列車情報\n情報の取得中にエラーが発生しました。"),
    );
  }
};
