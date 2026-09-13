import { lineLabel, stripRouteTag } from "@/lib/train-lines";
import { EMOJI } from "@/lib/emojis";
import { setAssignment } from "@/lib/train-assignment";
import { buildStopPicker, loadStops, pickerPrompt } from "@/lib/train-stop-picker";
import {
  parseSelection,
  resolveAssignment,
  trainAutocomplete,
  trainOptions,
} from "@/commands/train/shared";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

export const setConfig: SubcommandConfig<typeof trainOptions> = {
  name: "set",
  description: "乗車中の列車を設定します（翌4時に自動解除）",
  descriptionLocalizations: { ja: "乗車中の列車を設定します（翌4時に自動解除）" },
  options: trainOptions,
};

export const setAutocomplete = trainAutocomplete;

export const setExecute: SubcommandExecuteFunction<typeof trainOptions> = async (
  interaction,
  options,
) => {
  const selection = parseSelection(options.line, options.train);
  if (typeof selection === "string") {
    return interaction.reply({ content: selection, flags: "Ephemeral" });
  }

  const assignment = await resolveAssignment(selection.rosenCode, selection.retsubanId);
  if (!assignment) {
    return interaction.reply({
      content: `${EMOJI.error} 列車が見つかりませんでした。候補から選び直してください。`,
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
};
