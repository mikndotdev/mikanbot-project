import type { Client } from "discord.js";
import * as Sentry from "@sentry/bun";
import { getRailwayInfo, RAILWAY_STATUS_NORMAL, sortRailwayInfo } from "@/lib/elesite";
import type { ElesiteRailwayInfoEntry } from "@/lib/elesite";
import { getOperationalDay, secondsUntilOperationalDayEnd } from "@/lib/jst";
import { prisma } from "@/lib/db";
import { ensureRedis } from "@/lib/redis";
import { lineLabel, stripRouteTag } from "@/lib/train-lines";
import { formatRailwayEntry } from "@/lib/train";

const POLL_MS = 60_000;
const MAX_LINES_PER_TICK = 25;
const DM_GAP_MS = 400;
const CANNOT_DM = 50007;

let started = false;

function seenKey(rosenCode: string, selectDate: string): string {
  return `train:alert:seen:${rosenCode}:${selectDate}`;
}

async function markSeen(rosenCode: string, selectDate: string, indexes: number[]) {
  const client = await ensureRedis();
  if (!client || indexes.length === 0) return;
  const key = seenKey(rosenCode, selectDate);
  try {
    await client.sAdd(key, indexes.map(String));
    await client.expire(key, secondsUntilOperationalDayEnd());
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "trainAlertsSeen" }, extra: { rosenCode } });
  }
}

async function filterUnseen(
  rosenCode: string,
  selectDate: string,
  entries: ElesiteRailwayInfoEntry[],
): Promise<{ fresh: ElesiteRailwayInfoEntry[]; firstRun: boolean }> {
  const client = await ensureRedis();
  if (!client) return { fresh: [], firstRun: true };

  const key = seenKey(rosenCode, selectDate);
  try {
    const existing = await client.sCard(key);
    if (existing === 0) return { fresh: [], firstRun: true };
    const fresh: ElesiteRailwayInfoEntry[] = [];
    for (const entry of entries) {
      if (!(await client.sIsMember(key, String(entry.index)))) fresh.push(entry);
    }
    return { fresh, firstRun: false };
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "trainAlertsFilter" }, extra: { rosenCode } });
    return { fresh: [], firstRun: true };
  }
}

async function notify(
  client: Client,
  userId: string,
  rosenCode: string,
  entry: ElesiteRailwayInfoEntry,
  retsuban: string,
  shubetsu: string,
) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({
      content: [
        `⚠️ **${lineLabel(rosenCode)}** で運行情報が発生しました`,
        `-# あなたの列車: ${stripRouteTag(shubetsu)} ${stripRouteTag(retsuban)}`,
        "",
        formatRailwayEntry(entry),
        "-# 利用者投稿による情報です",
      ].join("\n"),
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === CANNOT_DM) {
      Sentry.logger.warn("train alert: user has DMs closed", { userId });
      return;
    }
    Sentry.captureException(error, { tags: { source: "trainAlertDm" }, extra: { userId } });
  }
}

export async function runAlertTick(client: Client) {
  const day = getOperationalDay();

  const assignments = await prisma.trainAssignment.findMany({
    where: { selectDate: day.selectDate },
  });
  if (assignments.length === 0) return;

  const byLine = new Map<string, typeof assignments>();
  for (const row of assignments) {
    const list = byLine.get(row.rosenCode) ?? [];
    list.push(row);
    byLine.set(row.rosenCode, list);
  }

  for (const [rosenCode, rows] of [...byLine].slice(0, MAX_LINES_PER_TICK)) {
    const info = await getRailwayInfo(rosenCode, day.selectDate);
    const entries = sortRailwayInfo(info);
    if (entries.length === 0) continue;

    const { fresh, firstRun } = await filterUnseen(rosenCode, day.selectDate, entries);
    await markSeen(
      rosenCode,
      day.selectDate,
      entries.map((e) => Number(e.index)),
    );
    if (firstRun) continue;

    const actionable = fresh.filter((e) => e.status > RAILWAY_STATUS_NORMAL);
    if (actionable.length === 0) continue;

    const latest = actionable[0];
    if (!latest) continue;

    for (const row of rows) {
      await notify(client, row.id, rosenCode, latest, row.retsuban, row.shubetsu);
      await Bun.sleep(DM_GAP_MS);
    }
  }
}

export function startTrainAlerts(client: Client) {
  if (started) return;
  started = true;

  const run = () => {
    runAlertTick(client).catch((error) => {
      Sentry.captureException(error, { tags: { source: "trainAlerts" } });
    });
  };

  setInterval(run, POLL_MS);
  run();
}
