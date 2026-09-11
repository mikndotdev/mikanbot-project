import { getAssignment } from "@/lib/train-assignment";
import { lineLabel } from "@/lib/train-lines";
import { buildLoadingMessage, buildNoticeMessage, renderTrainView } from "@/lib/train";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

const meOptions = [] as const;

export const meConfig: SubcommandConfig<typeof meOptions> = {
  name: "me",
  description: "設定した列車の現在位置を表示します",
  descriptionLocalizations: { ja: "設定した列車の現在位置を表示します" },
  options: meOptions,
};

export const meExecute: SubcommandExecuteFunction<typeof meOptions> = async (interaction) => {
  const assignment = await getAssignment(interaction.user.id);

  if (!assignment) {
    return interaction.reply({
      content: "❌ 列車が設定されていません。`/train set` で設定できます。",
      flags: "Ephemeral",
    });
  }

  await interaction.reply(buildLoadingMessage(lineLabel(assignment.rosenCode)));

  const owner = {
    displayName: interaction.user.displayName ?? interaction.user.username,
    isSelf: true,
  };

  try {
    const message = await renderTrainView(
      {
        rosenCode: assignment.rosenCode,
        retsubanId: assignment.retsubanId,
        page: 0,
        expanded: false,
        map: "off",
      },
      owner,
    );
    await interaction.editReply(message);
  } catch {
    await interaction.editReply(
      buildNoticeMessage("## 🚆 列車情報\n情報の取得中にエラーが発生しました。"),
    );
  }
};
