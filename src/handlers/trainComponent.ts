import type { ButtonInteraction } from "discord.js";
import { decodeTrainId, renderTrainView } from "@/lib/train";
import { setAssignment } from "@/lib/train-assignment";
import { lineLabel, stripRouteTag } from "@/lib/train-lines";
import { resolveAssignment } from "@/commands/train/shared";

export async function handleTrainComponent(interaction: ButtonInteraction) {
  const decoded = decodeTrainId(interaction.customId);
  if (!decoded) return;

  const { action, state } = decoded;

  if (action === "set") {
    const assignment = await resolveAssignment(state.rosenCode, state.retsubanId);
    if (!assignment) {
      return interaction.reply({
        content: "❌ 列車が見つかりませんでした。ダイヤが変わった可能性があります。",
        flags: "Ephemeral",
      });
    }

    await setAssignment(interaction.user.id, assignment);

    return interaction.reply({
      content: `✅ ${stripRouteTag(assignment.shubetsu)} ${stripRouteTag(assignment.retsuban)}（${lineLabel(assignment.rosenCode)}・${assignment.ikisaki}ゆき）を設定しました。翌4時に自動解除されます。`,
      flags: "Ephemeral",
    });
  }

  await interaction.deferUpdate();

  const page = action === "prev" ? state.page - 1 : action === "next" ? state.page + 1 : state.page;
  const expanded = action === "expand" ? true : action === "collapse" ? false : state.expanded;
  const message = await renderTrainView({ ...state, page, expanded });

  await interaction.editReply(message);
}
