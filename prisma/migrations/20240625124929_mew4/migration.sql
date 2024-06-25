/*
  Warnings:

  - Added the required column `levelsEnabled` to the `server` table without a default value. This is not possible if the table is not empty.
  - Added the required column `levelsMessage` to the `server` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "server" ADD COLUMN     "levelsEnabled" BOOLEAN NOT NULL,
ADD COLUMN     "levelsMessage" TEXT NOT NULL;
