/*
  Warnings:

  - Changed the type of `level` on the `guildLvl` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `xp` on the `guildLvl` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "guildLvl" DROP COLUMN "level",
ADD COLUMN     "level" INTEGER NOT NULL,
DROP COLUMN "xp",
ADD COLUMN     "xp" INTEGER NOT NULL;
