import { ApplicationCommandOptionType } from "discord.js";
import { getRailwayInfo, RAILWAY_STATUS_NORMAL, sortRailwayInfo } from "@/lib/elesite";
import { getOperationalDay } from "@/lib/jst";
import { isKnownLine, lineLabel, searchLines } from "@/lib/train-lines";
import { buildNoticeMessage, formatRailwayEntry, statusEmoji } from "@/lib/train";
import type {
  AutocompleteHandlers,
  SubcommandConfig,
  SubcommandExecuteFunction,
} from "@/types/command";

const MAX_ENTRIES = 6;

const delaysOptions = [
  {
    name: "line",
    description: "路線を選択してください",
    nameLocalizations: { ja: "路線" },
    descriptionLocalizations: { ja: "路線を選択してください" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
] as const;

export const delaysConfig: SubcommandConfig<typeof delaysOptions> = {
  name: "delays",
  description: "路線の運行情報を表示します",
  descriptionLocalizations: { ja: "路線の運行情報を表示します" },
  options: delaysOptions,
};

export const delaysAutocomplete: AutocompleteHandlers<typeof delaysOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
};

export const delaysExecute: SubcommandExecuteFunction<typeof delaysOptions> = async (
  interaction,
  options,
) => {
  const rosenCode = options.line;
  if (!isKnownLine(rosenCode)) {
    return interaction.reply({
      content: "路線が正しく選択されていません。候補から選んでください。",
      flags: "Ephemeral",
    });
  }

  const day = getOperationalDay();
  const info = await getRailwayInfo(rosenCode, day.selectDate);
  const entries = sortRailwayInfo(info);
  const label = lineLabel(rosenCode);

  if (entries.length === 0) {
    return interaction.reply(
      buildNoticeMessage(`## 🚆 運行情報\n**${label}**\n本日の運行情報の投稿はありません。`),
    );
  }

  const latest = entries[0]!;
  const header =
    latest.status <= RAILWAY_STATUS_NORMAL
      ? `${statusEmoji(latest.status)} 現在は平常運転です`
      : `${statusEmoji(latest.status)} 現在 **${latest.info ?? "運行情報あり"}**`;

  const body = entries
    .slice(0, MAX_ENTRIES)
    .map((entry) => formatRailwayEntry(entry))
    .join("\n\n");
  const more = entries.length > MAX_ENTRIES ? `\n\n-# 他 ${entries.length - MAX_ENTRIES} 件` : "";

  return interaction.reply(
    buildNoticeMessage(
      `## 🚆 運行情報\n**${label}**　${day.selectDate}\n${header}\n\n${body}${more}\n-# 利用者投稿による情報です`,
    ),
  );
};
