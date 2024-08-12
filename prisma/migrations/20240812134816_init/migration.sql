-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "premiumUntil" TIMESTAMP(3),
    "levelCard" TEXT NOT NULL,
    "rankColor" TEXT NOT NULL,
    "mdUID" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guildLvl" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "xp" TEXT NOT NULL,

    CONSTRAINT "guildLvl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "premiumUntil" TIMESTAMP(3),
    "logChhannel" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "autoRole" TEXT NOT NULL,
    "autoRoleChannel" TEXT NOT NULL,
    "verificationRole" TEXT NOT NULL,
    "verificationChannel" TEXT NOT NULL,
    "levelsEnabled" BOOLEAN NOT NULL,
    "levelsMessage" TEXT NOT NULL,

    CONSTRAINT "server_pkey" PRIMARY KEY ("id")
);
