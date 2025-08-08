-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "maxDailySpins" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "pointsWon" INTEGER NOT NULL DEFAULT 250,
ADD COLUMN     "spinCost" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "WinWheelOption" (
    "id" TEXT NOT NULL,
    "gameConfigId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,

    CONSTRAINT "WinWheelOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinWheelOption_ctoonId_idx" ON "WinWheelOption"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "WinWheelOption_gameConfigId_ctoonId_key" ON "WinWheelOption"("gameConfigId", "ctoonId");

-- AddForeignKey
ALTER TABLE "WinWheelOption" ADD CONSTRAINT "WinWheelOption_gameConfigId_fkey" FOREIGN KEY ("gameConfigId") REFERENCES "GameConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinWheelOption" ADD CONSTRAINT "WinWheelOption_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
