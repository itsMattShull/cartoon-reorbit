/*
  Warnings:

  - You are about to drop the column `dailyPointLimit` on the `GameConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GameConfig" DROP COLUMN "dailyPointLimit";

-- CreateTable
CREATE TABLE "GlobalGameConfig" (
    "id" TEXT NOT NULL,
    "dailyPointLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalGameConfig_pkey" PRIMARY KEY ("id")
);
