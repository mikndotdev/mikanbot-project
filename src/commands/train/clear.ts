import { clearAssignment } from "@/lib/train-assignment";
import { EMOJI } from "@/lib/emojis";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

const clearOptions = [] as const;

export const clearConfig: SubcommandConfig<typeof clearOptions> = {
  name: "clear",
  description: "設定した列車を解除します",
  descriptionLocalizations: { ja: "設定した列車を解除します" },
  options: clearOptions,
};

export const clearExecute: SubcommandExecuteFunction<typeof clearOptions> = async (interaction) => {
  const removed = await clearAssignment(interaction.user.id);

  return interaction.reply({
    content: removed
      ? `${EMOJI.success} 列車の設定を解除しました。`
      : `${EMOJI.error} 列車は設定されていません。`,
    flags: "Ephemeral",
  });
};
