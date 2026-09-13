import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { EMOJI } from "@/lib/emojis";
import { getAssignment, setDestination } from "@/lib/train-assignment";
import { stripRouteTag } from "@/lib/train-lines";
import { buildStopPicker, decodePickId, loadStops, pickerPrompt } from "@/lib/train-stop-picker";

export async function handleTrainStopComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const decoded = decodePickId(interaction.customId);
  if (!decoded) return;

  const assignment = await getAssignment(interaction.user.id);
  if (!assignment || assignment.retsubanId !== decoded.retsubanId) {
    return interaction.update({
      content: `${EMOJI.error} この列車は設定されていません。`,
      components: [],
    });
  }

  const label = `${stripRouteTag(assignment.shubetsu)} ${stripRouteTag(assignment.retsuban)}`;

  if (decoded.action === "prev" || decoded.action === "next") {
    const stops = await loadStops(decoded.retsubanId);
    return interaction.update({
      content: pickerPrompt(label),
      components: buildStopPicker(decoded.retsubanId, stops, decoded.page),
    });
  }

  if (decoded.action === "skip") {
    await setDestination(interaction.user.id, null);
    return interaction.update({
      content: `${EMOJI.success} **${label}** を設定しました。全線の進行状況を表示します。`,
      components: [],
    });
  }

  const station = interaction.isStringSelectMenu() ? interaction.values[0] : null;
  if (!station) return;

  await setDestination(interaction.user.id, station);
  return interaction.update({
    content: `${EMOJI.success} **${label}** の降車駅を **${station}** に設定しました。`,
    components: [],
  });
}
