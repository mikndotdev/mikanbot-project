-- CreateEnum
CREATE TYPE "XFixType" AS ENUM ('fxtwitter', 'vxtwitter');

-- AlterTable
ALTER TABLE "server" ADD COLUMN     "xfixType" "XFixType" NOT NULL DEFAULT 'fxtwitter';
