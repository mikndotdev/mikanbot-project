-- CreateTable
CREATE TABLE "trainAssignment" (
    "id" TEXT NOT NULL,
    "rosenCode" TEXT NOT NULL,
    "retsuban" TEXT NOT NULL,
    "retsubanId" INTEGER NOT NULL,
    "shubetsu" TEXT NOT NULL,
    "ikisaki" TEXT NOT NULL,
    "selectDate" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainAssignment_pkey" PRIMARY KEY ("id")
);
