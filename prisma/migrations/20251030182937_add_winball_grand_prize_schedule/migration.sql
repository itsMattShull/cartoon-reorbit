-- CreateTable
CREATE TABLE "WinballGrandPrizeSchedule" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "WinballGrandPrizeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinballGrandPrizeSchedule_startsAt_idx" ON "WinballGrandPrizeSchedule"("startsAt");

-- CreateIndex
CREATE INDEX "WinballGrandPrizeSchedule_ctoonId_startsAt_idx" ON "WinballGrandPrizeSchedule"("ctoonId", "startsAt");

-- AddForeignKey
ALTER TABLE "WinballGrandPrizeSchedule" ADD CONSTRAINT "WinballGrandPrizeSchedule_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinballGrandPrizeSchedule" ADD CONSTRAINT "WinballGrandPrizeSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
