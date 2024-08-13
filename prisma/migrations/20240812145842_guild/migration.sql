/*
  Warnings:

  - You are about to drop the column `logChhannel` on the `server` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "server" DROP COLUMN "logChhannel",
ADD COLUMN     "logChannel" TEXT NOT NULL DEFAULT 'none',
ALTER COLUMN "prefix" SET DEFAULT 'm?',
ALTER COLUMN "autoRole" SET DEFAULT 'none',
ALTER COLUMN "autoRoleChannel" SET DEFAULT 'none',
ALTER COLUMN "verificationRole" SET DEFAULT 'none',
ALTER COLUMN "verificationChannel" SET DEFAULT 'none',
ALTER COLUMN "levelsEnabled" SET DEFAULT false,
ALTER COLUMN "levelsMessage" SET DEFAULT 'Congratulations, {user}! You''ve leveled up to level {level}!';
