import type { ButtonInteraction } from "discord.js";
import { EMOJI } from "@/lib/emojis";
import { decodeTrainId, renderTrainView } from "@/lib/train";
import type { MapMode, TrainOwner } from "@/lib/train";
import { getAssignment } from "@/lib/train-assignment";
import { setAssignment } from "@/lib/train-assignment";
import { lineLabel, stripRouteTag } from "@/lib/train-lines";
import { buildStopPicker, loadStops, pickerPrompt } from "@/lib/train-stop-picker";
import { resolveAssignment } from "@/commands/train/shared";

export async function handleTrainComponent(interaction: ButtonInteraction) {
  const decoded = decodeTrainId(interaction.customId);
  if (!decoded) return;

  const { action, state } = decoded;

  if (action === "set") {
    const assignment = await resolveAssignment(state.rosenCode, state.retsubanId);
    if (!assignment) {
      return interaction.reply({
        content: `${EMOJI.error} 列車が見つかりませんでした。ダイヤが変わった可能性があります。`,
        flags: "Ephemeral",
      });
    }

    await setAssignment(interaction.user.id, assignment);

    const label = `${stripRouteTag(assignment.shubetsu)} ${stripRouteTag(assignment.retsuban)}`;
    const stops = await loadStops(assignment.retsubanId);

    return interaction.reply({
      content: `${EMOJI.success} ${label}（${lineLabel(assignment.rosenCode)}・${assignment.ikisaki}ゆき）を設定しました。翌4時に自動解除されます。\n\n${pickerPrompt(label)}`,
      components: stops.length > 1 ? buildStopPicker(assignment.retsubanId, stops) : [],
      flags: "Ephemeral",
    });
  }

  await interaction.deferUpdate();

  const page = action === "prev" ? state.page - 1 : action === "next" ? state.page + 1 : state.page;
  const expanded = action === "expand" ? true : action === "collapse" ? false : state.expanded;
  const map =
    action === "maptrain"
      ? "train"
      : action === "mapline"
        ? "line"
        : action === "mapoff" || action === "collapse"
          ? "off"
          : state.map;
  let owner: TrainOwner | undefined;
  let destination: string | null = null;

  if (state.ownerId) {
    const assignment = await getAssignment(state.ownerId);
    if (assignment && assignment.retsubanId === state.retsubanId) {
      destination = assignment.destination;
    }
    const user = await interaction.client.users.fetch(state.ownerId).catch(() => null);
    if (user) {
      owner = {
        displayName: user.displayName ?? user.username,
        isSelf: state.ownerId === interaction.user.id,
      };
    }
  }

  const message = await renderTrainView(
    { ...state, page, expanded, map: map as MapMode },
    owner,
    undefined,
    destination,
  );

  await interaction.editReply(message);
}
