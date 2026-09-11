import { getTrainCross, resolveOperationalContext } from "@/lib/elesite";
import type { ElesiteCrossEntry } from "@/lib/elesite";
import { lineLabel, stripRouteTag } from "@/lib/train-lines";
import { buildNoticeMessage, lineEmojiPrefix } from "@/lib/train";
import { parseSelection, trainAutocomplete, trainOptions } from "@/commands/train/shared";
import type { SubcommandConfig, SubcommandExecuteFunction } from "@/types/command";

const MAX_ROWS = 12;

export const crossConfig: SubcommandConfig<typeof trainOptions> = {
  name: "cross",
  description: "列車がすれ違う列車を表示します",
  descriptionLocalizations: { ja: "列車がすれ違う列車を表示します" },
  options: trainOptions,
};

export const crossAutocomplete = trainAutocomplete;

function formatCross(entry: ElesiteCrossEntry): string | null {
  const other = entry.info?.[0];
  if (!other) return null;
  const points = entry.cross_points ?? {};
  const time = (points.cross_time1 ?? "").slice(0, 5);
  const where =
    points.station_1 && points.station_2 && points.station_1 !== points.station_2
      ? `${points.station_1}〜${points.station_2}`
      : (points.station_1 ?? "");
  const raw = other.train?.sharyo ?? "";
  const sharyo = raw && raw !== "?" ? `　-# ${raw}` : "";
  return `\`${time || "--:--"}\` ${stripRouteTag(other.shubetsu ?? "")} ${stripRouteTag(other.retsuban ?? "")} ${other.ikisaki ?? ""}ゆき　-# ${where}${sharyo}`;
}

export function buildCrossMessage(rosenCode: string, title: string, entries: ElesiteCrossEntry[]) {
  const head = `## ${lineEmojiPrefix(rosenCode)}すれ違う列車\n**${title}**　${lineLabel(rosenCode)}`;
  const rows = entries.map(formatCross).filter((x): x is string => Boolean(x));

  if (rows.length === 0) {
    return buildNoticeMessage(`${head}\n\nすれ違う列車の情報がありません。`);
  }

  const shown = rows.slice(0, MAX_ROWS).join("\n");
  const more = rows.length > MAX_ROWS ? `\n-# 他 ${rows.length - MAX_ROWS} 本` : "";
  return buildNoticeMessage(`${head}　計 ${rows.length} 本\n\n${shown}${more}`);
}

export const crossExecute: SubcommandExecuteFunction<typeof trainOptions> = async (
  interaction,
  options,
) => {
  const selection = parseSelection(options.line, options.train);
  if (typeof selection === "string") {
    return interaction.reply({ content: selection, flags: "Ephemeral" });
  }

  const context = await resolveOperationalContext(selection.rosenCode);
  if (!context) {
    return interaction.reply(
      buildNoticeMessage("## 🚆 すれ違う列車\nダイヤ情報を取得できませんでした。"),
    );
  }

  const entries = await getTrainCross(
    selection.rosenCode,
    selection.retsubanId,
    context.dayId,
    context.selectDate,
  );

  return interaction.reply(
    buildCrossMessage(selection.rosenCode, String(options.train), entries ?? []),
  );
};
