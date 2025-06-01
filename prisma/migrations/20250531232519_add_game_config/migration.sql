-- CreateTable
CREATE TABLE "GameConfig" (
    "id" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "leftCupPoints" INTEGER NOT NULL DEFAULT 0,
    "rightCupPoints" INTEGER NOT NULL DEFAULT 0,
    "goldCupPoints" INTEGER NOT NULL DEFAULT 0,
    "grandPrizeCtoonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameConfig_gameName_key" ON "GameConfig"("gameName");

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_grandPrizeCtoonId_fkey" FOREIGN KEY ("grandPrizeCtoonId") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
