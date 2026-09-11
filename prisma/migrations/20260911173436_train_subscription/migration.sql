-- CreateTable
CREATE TABLE "trainSubscription" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "rosenCode" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainSubscription_pkey" PRIMARY KEY ("id")
);
