import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { EMOJI } from "@/lib/emojis";
import { getRetsubanTimeById } from "@/lib/elesite";
import { getOperationalDay } from "@/lib/jst";
import { mergeTimetables, normalizeStops } from "@/lib/train";
import type { NormalizedStop } from "@/lib/train";

export const STOPS_PER_MENU = 25;

export function encodePickId(
  action: "pick" | "skip" | "prev" | "next",
  retsubanId: number,
  page: number,
) {
  return `trainstop:${action}:${retsubanId}:${page}`;
}

export function decodePickId(
  customId: string,
): { action: "pick" | "skip" | "prev" | "next"; retsubanId: number; page: number } | null {
  const parts = customId.split(":");
  if (parts.length !== 4 || parts[0] !== "trainstop") return null;
  const action = parts[1] as "pick" | "skip" | "prev" | "next";
  if (!["pick", "skip", "prev", "next"].includes(action)) return null;
  const retsubanId = Number(parts[2]);
  const page = Number(parts[3]);
  if (!Number.isFinite(retsubanId) || !Number.isFinite(page)) return null;
  return { action, retsubanId, page };
}

export async function loadStops(
  retsubanId: number,
  now: Date = new Date(),
): Promise<NormalizedStop[]> {
  const day = getOperationalDay(now);
  const detail = await getRetsubanTimeById(retsubanId, day.selectDate);
  if (!detail) return [];
  return normalizeStops(mergeTimetables(detail.timetable_list)).filter((s) => !s.isPass);
}

export function buildStopPicker(retsubanId: number, stops: NormalizedStop[], page = 0) {
  const selectable = stops.slice(1);
  const totalPages = Math.max(1, Math.ceil(selectable.length / STOPS_PER_MENU));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const slice = selectable.slice(
    current * STOPS_PER_MENU,
    current * STOPS_PER_MENU + STOPS_PER_MENU,
  );

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (slice.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(encodePickId("pick", retsubanId, current))
          .setPlaceholder(
            totalPages > 1 ? `降車駅を選択 (${current + 1}/${totalPages})` : "降車駅を選択",
          )
          .addOptions(
            slice.map((stop) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(stop.station.slice(0, 100))
                .setValue(stop.station.slice(0, 100))
                .setDescription(
                  [stop.arrText && `${stop.arrText} 着`, stop.depText && `${stop.depText} 発`]
                    .filter(Boolean)
                    .join(" / ")
                    .slice(0, 100) || "　",
                ),
            ),
          ),
      ),
    );
  }

  const buttons: ButtonBuilder[] = [];
  if (totalPages > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(encodePickId("prev", retsubanId, current - 1))
        .setLabel("前")
        .setEmoji(EMOJI.buttonPrev)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current <= 0),
      new ButtonBuilder()
        .setCustomId(encodePickId("next", retsubanId, current + 1))
        .setLabel("次")
        .setEmoji(EMOJI.buttonNext)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current >= totalPages - 1),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(encodePickId("skip", retsubanId, current))
      .setLabel("指定しない（全線表示）")
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

  return rows;
}

export function pickerPrompt(label: string): string {
  return `${EMOJI.destination} **${label}** の降車駅を選択してください。\n-# 指定しない場合は全線の進行状況を表示します。`;
}
