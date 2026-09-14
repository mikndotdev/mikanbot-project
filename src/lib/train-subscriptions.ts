import { prisma } from "@/lib/db";

export const MAX_LINES_PER_GUILD = 10;
export const MAX_FAILURES = 3;

export interface TrainSubscription {
  id: string;
  guildId: string;
  channelId: string;
  rosenCode: string;
  createdBy: string;
  webhookId: string | null;
  webhookToken: string | null;
  failures: number;
}

export type AddResult = "ok" | "exists" | "limit";

type SubscriptionRow = {
  id: string;
  guildId: string;
  channelId: string;
  rosenCode: string;
  createdBy: string;
  webhookId: string | null;
  webhookToken: string | null;
  failures: number;
};

function toSubscription(row: SubscriptionRow): TrainSubscription {
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    rosenCode: row.rosenCode,
    createdBy: row.createdBy,
    webhookId: row.webhookId,
    webhookToken: row.webhookToken,
    failures: row.failures,
  };
}

export function subscriptionId(channelId: string, rosenCode: string): string {
  return `${channelId}-${rosenCode}`;
}

export async function addSubscription(
  guildId: string,
  channelId: string,
  rosenCode: string,
  userId: string,
): Promise<AddResult> {
  const id = subscriptionId(channelId, rosenCode);
  const existing = await prisma.trainSubscription.findUnique({ where: { id } });
  if (existing) return "exists";

  const guildRows = await prisma.trainSubscription.findMany({ where: { guildId } });
  const lines = new Set(guildRows.map((row) => row.rosenCode));
  if (!lines.has(rosenCode) && lines.size >= MAX_LINES_PER_GUILD) return "limit";

  await prisma.trainSubscription.create({
    data: { id, guildId, channelId, rosenCode, createdBy: userId },
  });
  return "ok";
}

export async function removeSubscription(
  channelId: string,
  rosenCode: string,
): Promise<TrainSubscription | null> {
  const id = subscriptionId(channelId, rosenCode);
  const existing = await prisma.trainSubscription.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.trainSubscription.delete({ where: { id } });
  return toSubscription(existing);
}

export async function listSubscriptions(guildId: string): Promise<TrainSubscription[]> {
  const rows = await prisma.trainSubscription.findMany({ where: { guildId } });
  return rows
    .map(toSubscription)
    .sort(
      (a, b) => a.channelId.localeCompare(b.channelId) || a.rosenCode.localeCompare(b.rosenCode),
    );
}

export async function subscribedLines(): Promise<Map<string, TrainSubscription[]>> {
  const rows = await prisma.trainSubscription.findMany();
  const byLine = new Map<string, TrainSubscription[]>();
  for (const row of rows) {
    const list = byLine.get(row.rosenCode) ?? [];
    list.push(toSubscription(row));
    byLine.set(row.rosenCode, list);
  }
  return byLine;
}

export async function dropSubscription(id: string): Promise<void> {
  await prisma.trainSubscription.delete({ where: { id } }).catch(() => undefined);
}

export async function recordFailure(id: string): Promise<boolean> {
  const existing = await prisma.trainSubscription.findUnique({ where: { id } });
  if (!existing) return false;
  const failures = existing.failures + 1;
  if (failures >= MAX_FAILURES) {
    await prisma.trainSubscription.delete({ where: { id } }).catch(() => undefined);
    return true;
  }
  await prisma.trainSubscription.update({ where: { id }, data: { failures } });
  return false;
}

export async function clearFailures(id: string): Promise<void> {
  const existing = await prisma.trainSubscription.findUnique({ where: { id } });
  if (!existing || existing.failures === 0) return;
  await prisma.trainSubscription.update({ where: { id }, data: { failures: 0 } });
}

export async function subscriptionsForChannel(channelId: string): Promise<TrainSubscription[]> {
  const rows = await prisma.trainSubscription.findMany({ where: { channelId } });
  return rows.map(toSubscription);
}

export async function setChannelWebhook(
  channelId: string,
  webhookId: string | null,
  webhookToken: string | null,
): Promise<void> {
  await prisma.trainSubscription.updateMany({
    where: { channelId },
    data: { webhookId, webhookToken },
  });
}

export async function allSubscriptions(): Promise<TrainSubscription[]> {
  const rows = await prisma.trainSubscription.findMany();
  return rows.map(toSubscription);
}
