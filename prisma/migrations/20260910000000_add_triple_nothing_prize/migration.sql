-- Triple Nothing Prize: bonus cToon granted when a player lands on "nothing"
-- 3 spins in a row (in one day) on the Win Wheel.

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN "tripleNothingCtoonId" TEXT;

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_tripleNothingCtoonId_fkey" FOREIGN KEY ("tripleNothingCtoonId") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- sliceIndex nominally means "which of the 6 wheel wedges was landed on" — a
-- 'tripleNothing' bonus-grant row isn't tied to a wedge, so it must be nullable
-- rather than reusing the triggering spin's wedge index (which would double-count
-- that wedge in per-wedge analytics).
ALTER TABLE "WheelSpinLog" ALTER COLUMN "sliceIndex" DROP NOT NULL;
