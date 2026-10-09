import { prisma } from "@/lib/db";
import { isKnownLine, lineLabel } from "@/lib/train-lines";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error(
    "usage: bun run scripts/move-subscription-line.ts <old-rosen-code> <new-rosen-code>",
  );
  process.exit(1);
}
if (!isKnownLine(to)) {
  console.error(`${to} is not in the current catalogue`);
  process.exit(1);
}

const rows = await prisma.trainSubscription.findMany({ where: { rosenCode: from } });
console.log(`rows on ${from}: ${rows.length}`);

for (const row of rows) {
  const newId = `${row.channelId}-${to}`;
  if (await prisma.trainSubscription.findUnique({ where: { id: newId } })) {
    await prisma.trainSubscription.delete({ where: { id: row.id } });
    console.log(`${row.id}: ${newId} already existed, dropped the stale row`);
    continue;
  }
  await prisma.$transaction([
    prisma.trainSubscription.create({
      data: {
        id: newId,
        guildId: row.guildId,
        channelId: row.channelId,
        rosenCode: to,
        createdBy: row.createdBy,
        webhookId: row.webhookId,
        webhookToken: row.webhookToken,
        failures: row.failures,
        createdAt: row.createdAt,
      },
    }),
    prisma.trainSubscription.delete({ where: { id: row.id } }),
  ]);
  console.log(`moved ${row.id} -> ${newId} (webhook ${row.webhookId ? "carried over" : "none"})`);
}

const after = await prisma.trainSubscription.findMany();
console.log(`\nsubscriptions: ${after.length}`);
for (const sub of after) {
  const state = isKnownLine(sub.rosenCode) ? `✓ ${lineLabel(sub.rosenCode)}` : "✗ DEAD";
  console.log(`  ${sub.rosenCode.padEnd(22)} ${state}  webhook=${sub.webhookId ? "yes" : "no"}`);
}
process.exit(0);
