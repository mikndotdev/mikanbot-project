import { WebhookClient, type Client, type EmbedBuilder } from "discord.js";
import { EMOJI } from "@/lib/emojis";
import * as Sentry from "@sentry/bun";
import { getRailwayInfo, RAILWAY_STATUS_NORMAL, sortRailwayInfo } from "@/lib/elesite";
import type { ElesiteRailwayInfoEntry } from "@/lib/elesite";
import { getOperationalDay, secondsUntilOperationalDayEnd } from "@/lib/jst";
import { prisma } from "@/lib/db";
import { ensureRedis } from "@/lib/redis";
import { lineLabel, stripRouteTag } from "@/lib/train-lines";
import { operatorIconUrl } from "@/lib/train-logos";
import { buildRecoveryEmbed, formatRailwayEmbed } from "@/lib/train";
import {
  clearFailures,
  recordFailure,
  setChannelWebhook,
  subscribedLines,
} from "@/lib/train-subscriptions";
import {
  dropSubscriptionWithWebhook,
  ensureChannelWebhook,
  isDeadChannel,
  isDeadWebhook,
} from "@/lib/train-webhooks";
import type { TrainSubscription } from "@/lib/train-subscriptions";

const MAX_LINES_PER_TICK = 25;
const DM_GAP_MS = 400;
const CANNOT_DM = 50007;

let cursor = 0;

function disruptedKey(rosenCode: string, selectDate: string): string {
  return `train:alert:disrupted:${rosenCode}:${selectDate}`;
}

async function setDisrupted(rosenCode: string, selectDate: string, value: boolean) {
  const client = await ensureRedis();
  if (!client) return;
  const key = disruptedKey(rosenCode, selectDate);
  try {
    if (value) {
      await client.set(key, "1", { EX: secondsUntilOperationalDayEnd() });
    } else {
      await client.del(key);
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { source: "trainAlertsDisrupted" },
      extra: { rosenCode },
    });
  }
}

async function isDisrupted(rosenCode: string, selectDate: string): Promise<boolean> {
  const client = await ensureRedis();
  if (!client) return false;
  try {
    return (await client.get(disruptedKey(rosenCode, selectDate))) === "1";
  } catch {
    return false;
  }
}

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
  selectDate: string,
) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({
      content: `${EMOJI.statusWarning} **${lineLabel(rosenCode)}** で新たな運行情報が発表されました（${stripRouteTag(shubetsu)} ${stripRouteTag(retsuban)}）`,
      embeds: [formatRailwayEmbed(entry, rosenCode, selectDate, client.user?.displayAvatarURL())],
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === CANNOT_DM) {
      Sentry.logger.warn("train alert: user has DMs closed", { userId });
      return;
    }
    Sentry.captureException(error, { tags: { source: "trainAlertDm" }, extra: { userId } });
  }
}

async function notifyChannel(
  client: Client,
  sub: TrainSubscription,
  rosenCode: string,
  embed: EmbedBuilder,
) {
  const payload = {
    username: lineLabel(rosenCode),
    avatarURL: operatorIconUrl(rosenCode) ?? undefined,
    embeds: [embed],
  };

  try {
    const credentials =
      sub.webhookId && sub.webhookToken
        ? { id: sub.webhookId, token: sub.webhookToken }
        : await ensureChannelWebhook(client, sub.channelId);

    if (!credentials) {
      const removed = await recordFailure(sub.id);
      Sentry.logger.warn("train subscription: no webhook available", {
        channelId: sub.channelId,
        removed,
      });
      return;
    }

    await new WebhookClient(credentials).send(payload);
    await clearFailures(sub.id);
  } catch (error) {
    if (isDeadWebhook(error)) {
      Sentry.logger.warn("train subscription: webhook gone, recreating", {
        channelId: sub.channelId,
      });
      await setChannelWebhook(sub.channelId, null, null);
      const replacement = await ensureChannelWebhook(client, sub.channelId);
      if (!replacement) {
        await recordFailure(sub.id);
        return;
      }
      try {
        await new WebhookClient(replacement).send(payload);
        await clearFailures(sub.id);
      } catch (retryError) {
        const removed = await recordFailure(sub.id);
        Sentry.captureException(retryError, {
          tags: { source: "trainAlertChannel" },
          extra: { channelId: sub.channelId, rosenCode, removed, retry: true },
        });
      }
      return;
    }
    if (isDeadChannel(error)) {
      await dropSubscriptionWithWebhook(client, sub);
      Sentry.logger.warn("train subscription: channel gone, removed", {
        channelId: sub.channelId,
      });
      return;
    }
    const removed = await recordFailure(sub.id);
    Sentry.captureException(error, {
      tags: { source: "trainAlertChannel" },
      extra: { channelId: sub.channelId, rosenCode, removed },
    });
  }
}

export async function runAlertTick(client: Client) {
  const day = getOperationalDay();

  const assignments = await prisma.trainAssignment.findMany({
    where: { selectDate: day.selectDate },
  });

  const byUser = new Map<string, typeof assignments>();
  for (const row of assignments) {
    const list = byUser.get(row.rosenCode) ?? [];
    list.push(row);
    byUser.set(row.rosenCode, list);
  }

  const byChannel = await subscribedLines();

  const lines = [...new Set([...byUser.keys(), ...byChannel.keys()])].sort();
  if (lines.length === 0) return;

  if (cursor >= lines.length) cursor = 0;
  const slice =
    lines.length <= MAX_LINES_PER_TICK
      ? lines
      : [...lines, ...lines].slice(cursor, cursor + MAX_LINES_PER_TICK);
  cursor = lines.length <= MAX_LINES_PER_TICK ? 0 : (cursor + MAX_LINES_PER_TICK) % lines.length;

  for (const rosenCode of slice) {
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
    if (fresh.length === 0) continue;

    const disruptions = fresh.filter((e) => e.status > RAILWAY_STATUS_NORMAL);
    const latest = disruptions[0];

    for (const row of byUser.get(rosenCode) ?? []) {
      if (!latest) break;
      await notify(client, row.id, rosenCode, latest, row.retsuban, row.shubetsu, day.selectDate);
      await Bun.sleep(DM_GAP_MS);
    }

    const subs = byChannel.get(rosenCode) ?? [];
    if (subs.length === 0) {
      if (latest) await setDisrupted(rosenCode, day.selectDate, true);
      continue;
    }

    const botIcon = client.user?.displayAvatarURL();
    let embed: EmbedBuilder | null = null;
    if (latest) {
      embed = formatRailwayEmbed(latest, rosenCode, day.selectDate, botIcon);
      await setDisrupted(rosenCode, day.selectDate, true);
    } else if (await isDisrupted(rosenCode, day.selectDate)) {
      const normal = fresh.find((e) => e.status === RAILWAY_STATUS_NORMAL);
      if (normal) {
        embed = buildRecoveryEmbed(normal, rosenCode, day.selectDate, botIcon);
        await setDisrupted(rosenCode, day.selectDate, false);
      }
    }

    if (!embed) continue;

    for (const sub of subs) {
      await notifyChannel(client, sub, rosenCode, embed);
      await Bun.sleep(DM_GAP_MS);
    }
  }
}
