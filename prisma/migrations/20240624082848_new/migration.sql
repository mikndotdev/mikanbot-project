/*
  Warnings:

  - Added the required column `levelCard` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "levelCard" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "guildLvl" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL,

    CONSTRAINT "guildLvl_pkey" PRIMARY KEY ("id")
);
