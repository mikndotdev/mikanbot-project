import { ApplicationCommandOptionType } from "discord.js";
import { getFormationList, getHenseiTable } from "@/lib/elesite";
import type { ElesiteCarEntry } from "@/lib/elesite";
import { isKnownLine, lineLabel, searchLines } from "@/lib/train-lines";
import { buildNoticeMessage, lineEmojiPrefix } from "@/lib/train";
import type {
  AutocompleteChoice,
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const MAX_CARS = 20;

const formationOptions = [
  {
    name: "line",
    description: "路線を選択してください",
    nameLocalizations: { ja: "路線" },
    descriptionLocalizations: { ja: "路線を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
  {
    name: "formation",
    description: "形式を選択してください",
    nameLocalizations: { ja: "形式" },
    descriptionLocalizations: { ja: "形式を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
] as const;

export const formationConfig: SubcommandConfig<typeof formationOptions> = {
  name: "formation",
  description: "形式の編成表を表示します",
  descriptionLocalizations: { ja: "形式の編成表を表示します" },
  options: formationOptions,
};

export const formationAutocomplete: AutocompleteHandlers<typeof formationOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
  formation: async (_interaction, ctx) => {
    const line = ctx.options.line;
    if (!isKnownLine(line)) return [{ name: "先に路線を選択してください", value: "-" }];
    const list = (await getFormationList(line)) ?? [];
    const query = ctx.value.trim().toLowerCase();
    const hits = list.filter((f) => !query || f.toLowerCase().includes(query));
    if (hits.length === 0) return [{ name: "形式が見つかりません", value: "-" }];
    return hits.slice(0, 25).map((f): AutocompleteChoice => ({ name: f, value: f }));
  },
};

function carLabel(car: ElesiteCarEntry): string {
  const motor = car.motor_type === "motor" ? "M" : "T";
  const panta =
    car.left_panta_type && car.left_panta_type !== "無し"
      ? "▲"
      : car.right_panta_type && car.right_panta_type !== "無し"
        ? "▲"
        : "　";
  const cab = car.controller && car.controller !== "none" ? "運" : "　";
  return `${motor}${panta}${cab}`;
}

export function buildFormationMessage(
  rosenCode: string,
  formation: string,
  sets: Array<{ sharyo?: string; shaban_list?: ElesiteCarEntry[] }>,
) {
  const head = `## ${lineEmojiPrefix(rosenCode)}${formation} 編成表\n**${lineLabel(rosenCode)}**`;
  const set = sets[0];
  const cars = set?.shaban_list ?? [];

  if (cars.length === 0) {
    return buildNoticeMessage(`${head}\n\n編成表の情報がありません。`);
  }

  const rows = cars
    .slice(0, MAX_CARS)
    .map(
      (car, i) => `\`${String(i + 1).padStart(2, " ")}\` \`${carLabel(car)}\` ${car.shaban ?? ""}`,
    )
    .join("\n");
  const more = cars.length > MAX_CARS ? `\n-# 他 ${cars.length - MAX_CARS} 両` : "";
  const others = sets.length > 1 ? `\n-# 他 ${sets.length - 1} 編成` : "";

  return buildNoticeMessage(
    `${head}　${set?.sharyo ?? ""}編成 (${cars.length}両)\n\n\`号車\` \`M/T\` 車番\n${rows}${more}\n-# M=電動車 T=付随車 ▲=パンタグラフ 運=運転台${others}`,
  );
}

export const formationExecute: SubcommandExecuteFunction<typeof formationOptions> = async (
  interaction,
  options,
) => {
  const rosenCode = options.line;
  if (!isKnownLine(rosenCode) || options.formation === "-") {
    return interaction.reply({
      content: "路線と形式を候補から選んでください。",
      flags: "Ephemeral",
    });
  }

  const table = await getHenseiTable(rosenCode, options.formation);
  return interaction.reply(
    buildFormationMessage(rosenCode, options.formation, table?.hensei_table ?? []),
  );
};
