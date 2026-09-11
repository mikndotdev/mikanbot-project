import { prisma } from "@/lib/db";
import { getOperationalDay } from "@/lib/jst";

export interface TrainAssignment {
  rosenCode: string;
  retsuban: string;
  retsubanId: number;
  shubetsu: string;
  ikisaki: string;
}

export async function setAssignment(
  userId: string,
  assignment: TrainAssignment,
  now: Date = new Date(),
): Promise<void> {
  const selectDate = getOperationalDay(now).selectDate;
  const existing = await prisma.trainAssignment.findUnique({ where: { id: userId } });

  if (!existing) {
    await prisma.trainAssignment.create({
      data: { id: userId, ...assignment, selectDate },
    });
    return;
  }

  await prisma.trainAssignment.update({
    where: { id: userId },
    data: { ...assignment, selectDate, setAt: new Date() },
  });
}

export async function clearAssignment(userId: string): Promise<boolean> {
  const existing = await prisma.trainAssignment.findUnique({ where: { id: userId } });
  if (!existing) return false;
  await prisma.trainAssignment.delete({ where: { id: userId } });
  return true;
}

export async function getAssignment(
  userId: string,
  now: Date = new Date(),
): Promise<TrainAssignment | null> {
  const row = await prisma.trainAssignment.findUnique({ where: { id: userId } });
  if (!row) return null;

  if (row.selectDate !== getOperationalDay(now).selectDate) {
    await prisma.trainAssignment.delete({ where: { id: userId } }).catch(() => undefined);
    return null;
  }

  return {
    rosenCode: row.rosenCode,
    retsuban: row.retsuban,
    retsubanId: row.retsubanId,
    shubetsu: row.shubetsu,
    ikisaki: row.ikisaki,
  };
}
