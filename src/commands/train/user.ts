import { ApplicationCommandOptionType } from "discord.js";
import { getAssignment } from "@/lib/train-assignment";
import { lineLabel } from "@/lib/train-lines";
import { buildLoadingMessage, buildNoticeMessage, renderTrainView } from "@/lib/train";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

const userOptions = [
  {
    name: "user",
    description: "列車を調べたいユーザー",
    nameLocalizations: { ja: "ユーザー" },
    descriptionLocalizations: { ja: "列車を調べたいユーザー" },
    type: ApplicationCommandOptionType.User,
    required: true,
  },
] as const;

export const userConfig: SubcommandConfig<typeof userOptions> = {
  name: "user",
  description: "他のユーザーが設定した列車を表示します",
  descriptionLocalizations: { ja: "他のユーザーが設定した列車を表示します" },
  options: userOptions,
};

export const userExecute: SubcommandExecuteFunction<typeof userOptions> = async (interaction) => {
  const target = interaction.options.getUser("user");

  if (!target) {
    return interaction.reply({
      content: "❌ ユーザーが指定されていません。",
      flags: "Ephemeral",
    });
  }

  const displayName = target.displayName ?? target.username;
  const assignment = await getAssignment(target.id);

  if (!assignment) {
    return interaction.reply({
      content: `❌ ${displayName} さんは列車を設定していません。`,
      flags: "Ephemeral",
    });
  }

  await interaction.reply(buildLoadingMessage(lineLabel(assignment.rosenCode)));

  const owner = { displayName, isSelf: target.id === interaction.user.id };

  try {
    const message = await renderTrainView(
      {
        rosenCode: assignment.rosenCode,
        retsubanId: assignment.retsubanId,
        page: 0,
        expanded: false,
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
