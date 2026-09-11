import { ApplicationCommandOptionType } from "discord.js";
import { getHenseiNameList, getSlimDiagram, resolveOperationalContext } from "@/lib/elesite";
import { formatHhmm, getOperationalDay } from "@/lib/jst";
import { isKnownLine, lineLabel, searchLines, stripRouteTag } from "@/lib/train-lines";
import { buildLoadingMessage, buildNoticeMessage, renderTrainView } from "@/lib/train";
import type {
  AutocompleteChoice,
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const vehicleOptions = [
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
    name: "vehicle",
    description: "編成を選択してください",
    nameLocalizations: { ja: "編成" },
    descriptionLocalizations: { ja: "編成を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
] as const;

export const vehicleConfig: SubcommandConfig<typeof vehicleOptions> = {
  name: "vehicle",
  description: "編成が本日どの列車で運用されているかを調べます",
  descriptionLocalizations: { ja: "編成が本日どの列車で運用されているかを調べます" },
  options: vehicleOptions,
};

export const vehicleAutocomplete: AutocompleteHandlers<typeof vehicleOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
  vehicle: async (_interaction, ctx) => {
    const line = ctx.options.line;
    if (!isKnownLine(line)) return [{ name: "先に路線を選択してください", value: "-" }];

    const day = getOperationalDay();
    const list = (await getHenseiNameList(line, day.selectDate)) ?? [];
    const query = ctx.value.trim().toLowerCase();

    const seen = new Set<string>();
    const hits: AutocompleteChoice[] = [];
    for (const entry of list) {
      const name = `${entry.formation ?? ""}${entry.sharyo ?? ""}`.trim();
      if (!name || seen.has(name)) continue;
      if (query && !name.toLowerCase().includes(query)) continue;
      seen.add(name);
      hits.push({ name, value: name });
      if (hits.length >= 25) break;
    }
    return hits.length > 0 ? hits : [{ name: "編成が見つかりません", value: "-" }];
  },
};

export const vehicleExecute: SubcommandExecuteFunction<typeof vehicleOptions> = async (
  interaction,
  options,
) => {
  const rosenCode = options.line;
  const vehicle = options.vehicle;

  if (!isKnownLine(rosenCode) || vehicle === "-") {
    return interaction.reply({
      content: "路線と編成を候補から選んでください。",
      flags: "Ephemeral",
    });
  }

  await interaction.reply(buildLoadingMessage(vehicle));

  const context = await resolveOperationalContext(rosenCode);
  if (!context) {
    return interaction.editReply(
      buildNoticeMessage("## 🚆 編成検索\nダイヤ情報を取得できませんでした。"),
    );
  }

  const diagram = await getSlimDiagram(rosenCode, context.dayId, context.selectDate);
  const normalized = vehicle.replace(/\s+/g, "").toLowerCase();
  const matches = (diagram?.trains ?? []).filter(
    (t) => t.sharyo.replace(/\s+/g, "").toLowerCase() === normalized,
  );

  if (matches.length === 0) {
    return interaction.editReply(
      buildNoticeMessage(
        `## 🚆 編成検索\n**${vehicle}**（${lineLabel(rosenCode)}）\n本日この路線での運用はありません。`,
      ),
    );
  }

  const day = getOperationalDay();
  const nowHhmm = day.hour * 100 + day.minute;
  const running = matches.find((t) => t.start <= nowHhmm && nowHhmm <= t.end);
  const target = running ?? matches[0]!;

  if (!running) {
    const list = matches
      .slice(0, 10)
      .map(
        (t) =>
          `\`${formatHhmm(t.start)}\` ${stripRouteTag(t.shubetsu)} ${stripRouteTag(t.retsuban)} ${t.ikisaki}ゆき`,
      )
      .join("\n");
    return interaction.editReply(
      buildNoticeMessage(
        `## 🚆 編成検索\n**${vehicle}**（${lineLabel(rosenCode)}）\n現在は運用中ではありません。本日の運用 ${matches.length} 本:\n\n${list}`,
      ),
    );
  }

  const message = await renderTrainView({
    rosenCode,
    retsubanId: target.id,
    page: 0,
    expanded: false,
    map: "off",
  });
  return interaction.editReply(message);
};
