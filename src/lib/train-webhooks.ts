import { PermissionFlagsBits, type Client } from "discord.js";
import * as Sentry from "@sentry/bun";
import {
  dropSubscription,
  recordFailure,
  setChannelWebhook,
  subscriptionsForChannel,
  allSubscriptions,
} from "@/lib/train-subscriptions";
import type { TrainSubscription } from "@/lib/train-subscriptions";

export const WEBHOOK_NAME = "MikanBot 運行情報";

export const UNKNOWN_WEBHOOK = 10015;
export const INVALID_WEBHOOK_TOKEN = 50027;
export const UNKNOWN_CHANNEL = 10003;
export const MISSING_ACCESS = 50001;
export const MISSING_PERMISSIONS = 50013;

const DEAD_WEBHOOK = new Set([UNKNOWN_WEBHOOK, INVALID_WEBHOOK_TOKEN]);
const DEAD_CHANNEL = new Set([UNKNOWN_CHANNEL, MISSING_ACCESS, MISSING_PERMISSIONS]);

export interface WebhookCredentials {
  id: string;
  token: string;
}

export function isDeadWebhook(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" && DEAD_WEBHOOK.has(code);
}

export function isDeadChannel(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" && DEAD_CHANNEL.has(code);
}

export async function ensureChannelWebhook(
  client: Client,
  channelId: string,
): Promise<WebhookCredentials | null> {
  const siblings = await subscriptionsForChannel(channelId);
  const stored = siblings.find((s) => s.webhookId && s.webhookToken);
  if (stored?.webhookId && stored.webhookToken) {
    return { id: stored.webhookId, token: stored.webhookToken };
  }

  const created = await createChannelWebhook(client, channelId);
  if (created) await setChannelWebhook(channelId, created.id, created.token);
  return created;
}

export async function createChannelWebhook(
  client: Client,
  channelId: string,
): Promise<WebhookCredentials | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("createWebhook" in channel) || !("fetchWebhooks" in channel)) return null;

    const me = channel.guild?.members.me ?? (await channel.guild?.members.fetchMe());
    if (!me) return null;
    if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageWebhooks)) {
      Sentry.logger.warn("train webhook: missing ManageWebhooks", { channelId });
      return null;
    }

    const existing = await channel.fetchWebhooks();
    const mine = existing.find((w) => w.owner?.id === client.user?.id && Boolean(w.token));
    if (mine?.token) return { id: mine.id, token: mine.token };

    const webhook = await channel.createWebhook({
      name: WEBHOOK_NAME,
      reason: "列車運行情報の配信",
    });
    if (!webhook.token) return null;
    return { id: webhook.id, token: webhook.token };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { source: "trainWebhookCreate" },
      extra: { channelId },
    });
    return null;
  }
}

export async function deleteWebhookIfUnused(client: Client, sub: TrainSubscription): Promise<void> {
  if (!sub.webhookId) return;
  const remaining = await subscriptionsForChannel(sub.channelId);
  if (remaining.length > 0) return;

  try {
    const webhook = await client.fetchWebhook(sub.webhookId, sub.webhookToken ?? undefined);
    await webhook.delete("列車運行情報の購読が解除されました");
  } catch (error) {
    if (isDeadWebhook(error)) return;
    Sentry.logger.warn("train webhook: cleanup failed", { channelId: sub.channelId });
  }
}

export async function validateSubscriptions(client: Client): Promise<void> {
  const subs = await allSubscriptions();
  if (subs.length === 0) return;

  const byChannel = new Map<string, TrainSubscription[]>();
  for (const sub of subs) {
    const list = byChannel.get(sub.channelId) ?? [];
    list.push(sub);
    byChannel.set(sub.channelId, list);
  }

  let checked = 0;
  let repaired = 0;
  let removed = 0;

  for (const [channelId, rows] of byChannel) {
    checked++;
    const first = rows[0];
    if (!first) continue;

    if (first.webhookId && first.webhookToken) {
      try {
        await client.fetchWebhook(first.webhookId, first.webhookToken);
        continue;
      } catch (error) {
        if (!isDeadWebhook(error)) {
          Sentry.captureException(error, {
            tags: { source: "trainWebhookValidate" },
            extra: { channelId },
          });
          continue;
        }
        await setChannelWebhook(channelId, null, null);
      }
    }

    const recreated = await createChannelWebhook(client, channelId);
    if (recreated) {
      await setChannelWebhook(channelId, recreated.id, recreated.token);
      repaired++;
      continue;
    }

    for (const row of rows) {
      const gone = await recordFailure(row.id);
      if (gone) removed++;
    }
  }

  Sentry.logger.info("train webhook validation complete", { checked, repaired, removed });
}

export async function dropSubscriptionWithWebhook(
  client: Client,
  sub: TrainSubscription,
): Promise<void> {
  await dropSubscription(sub.id);
  await deleteWebhookIfUnused(client, sub);
}
