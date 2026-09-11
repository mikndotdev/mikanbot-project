import { ApplicationCommandOptionType } from "discord.js";
import { getSlimDiagram, resolveOperationalContext } from "@/lib/elesite";
import type { ElesiteSlimTrain } from "@/lib/elesite";
import { formatHhmm, getOperationalDay } from "@/lib/jst";
import { isKnownLine, searchLines, stripRouteTag } from "@/lib/train-lines";
import type { TrainAssignment } from "@/lib/train-assignment";
import type { AutocompleteChoice, AutocompleteHandlers } from "@/types/command";

export const SENTINEL = "-";
const DIAGRAM_BUDGET_MS = 1200;
const MAX_CHOICES = 25;

export const trainOptions = [
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
    name: "train",
    description: "列車番号・種別・行先で検索できます",
    nameLocalizations: { ja: "列車" },
    descriptionLocalizations: { ja: "列車番号・種別・行先で検索できます" },
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: true,
  },
] as const;

function isRunningNow(train: ElesiteSlimTrain, nowHhmm: number): boolean {
  return train.start <= nowHhmm && nowHhmm <= train.end;
}

function matches(train: ElesiteSlimTrain, query: string): boolean {
  if (!query) return true;
  return (
    train.retsuban.toLowerCase().includes(query) ||
    train.shubetsu.toLowerCase().includes(query) ||
    train.ikisaki.toLowerCase().includes(query)
  );
}

export function trainChoiceLabel(train: ElesiteSlimTrain): string {
  return `${stripRouteTag(train.shubetsu)} ${stripRouteTag(train.retsuban)} ${train.ikisaki}ゆき ${formatHhmm(train.start)}発`;
}

async function suggestTrains(rosenCode: string, query: string): Promise<AutocompleteChoice[]> {
  const context = await resolveOperationalContext(rosenCode);
  if (!context) {
    return [{ name: "この路線のダイヤ情報を取得できませんでした", value: SENTINEL }];
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = getSlimDiagram(rosenCode, context.dayId, context.selectDate);
  const budget = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), DIAGRAM_BUDGET_MS);
  });

  const diagram = await Promise.race([pending, budget]).finally(() => clearTimeout(timer));

  if (diagram === "timeout") {
    return [{ name: "⏳ ダイヤを読み込み中… もう一度入力してください", value: SENTINEL }];
  }
  if (!diagram || diagram.trains.length === 0) {
    return [{ name: "この路線の列車が見つかりませんでした", value: SENTINEL }];
  }

  const day = getOperationalDay();
  const nowHhmm = day.hour * 100 + day.minute;
  const normalized = query.trim().toLowerCase();

  const hits = diagram.trains.filter((train) => matches(train, normalized));
  hits.sort((a, b) => {
    const liveA = isRunningNow(a, nowHhmm) ? 0 : 1;
    const liveB = isRunningNow(b, nowHhmm) ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    return a.start - b.start;
  });

  return hits.slice(0, MAX_CHOICES).map((train) => ({
    name: trainChoiceLabel(train),
    value: String(train.id),
  }));
}

export const trainAutocomplete: AutocompleteHandlers<typeof trainOptions> = {
  line: (_interaction, ctx) => searchLines(ctx.value),
  train: async (_interaction, ctx) => {
    const line = ctx.options.line;
    if (!isKnownLine(line)) {
      return [{ name: "先に路線を選択してください", value: SENTINEL }];
    }
    return suggestTrains(line, ctx.value);
  },
};

export interface ParsedSelection {
  rosenCode: string;
  retsubanId: number;
}

export function parseSelection(line: string, train: string): ParsedSelection | string {
  if (!isKnownLine(line)) return "路線が正しく選択されていません。候補から選んでください。";
  const retsubanId = Number(train);
  if (train === SENTINEL || !Number.isFinite(retsubanId)) {
    return "列車が正しく選択されていません。候補から選んでください。";
  }
  return { rosenCode: line, retsubanId };
}

export async function resolveAssignment(
  rosenCode: string,
  retsubanId: number,
): Promise<TrainAssignment | null> {
  const context = await resolveOperationalContext(rosenCode);
  if (!context) return null;

  const diagram = await getSlimDiagram(rosenCode, context.dayId, context.selectDate);
  const train = diagram?.trains.find((t) => t.id === retsubanId);
  if (!train) return null;

  return {
    rosenCode,
    retsuban: train.retsuban,
    retsubanId,
    shubetsu: train.shubetsu,
    ikisaki: train.ikisaki,
  };
}
