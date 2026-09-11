import { prisma } from "@/lib/db";

export const MAX_LINES_PER_GUILD = 10;
export const MAX_FAILURES = 3;

export interface TrainSubscription {
  id: string;
  guildId: string;
  channelId: string;
  rosenCode: string;
  createdBy: string;
  failures: number;
}

export type AddResult = "ok" | "exists" | "limit";

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

export async function removeSubscription(channelId: string, rosenCode: string): Promise<boolean> {
  const id = subscriptionId(channelId, rosenCode);
  const existing = await prisma.trainSubscription.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.trainSubscription.delete({ where: { id } });
  return true;
}

export async function listSubscriptions(guildId: string): Promise<TrainSubscription[]> {
  const rows = await prisma.trainSubscription.findMany({ where: { guildId } });
  return rows
    .map((row) => ({
      id: row.id,
      guildId: row.guildId,
      channelId: row.channelId,
      rosenCode: row.rosenCode,
      createdBy: row.createdBy,
      failures: row.failures,
    }))
    .sort(
      (a, b) => a.channelId.localeCompare(b.channelId) || a.rosenCode.localeCompare(b.rosenCode),
    );
}

export async function subscribedLines(): Promise<Map<string, TrainSubscription[]>> {
  const rows = await prisma.trainSubscription.findMany();
  const byLine = new Map<string, TrainSubscription[]>();
  for (const row of rows) {
    const list = byLine.get(row.rosenCode) ?? [];
    list.push({
      id: row.id,
      guildId: row.guildId,
      channelId: row.channelId,
      rosenCode: row.rosenCode,
      createdBy: row.createdBy,
      failures: row.failures,
    });
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
