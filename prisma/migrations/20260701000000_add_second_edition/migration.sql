-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "isSecondEdition" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "relatedFirstEditionId" TEXT,
ADD COLUMN     "secondEditionOverlayX" DOUBLE PRECISION,
ADD COLUMN     "secondEditionOverlayY" DOUBLE PRECISION,
ADD COLUMN     "secondEditionOverlaySize" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "secondEditionOverlayPath" TEXT,
ADD COLUMN     "secondEditionOverlayWidth" INTEGER,
ADD COLUMN     "secondEditionOverlayHeight" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Ctoon_relatedFirstEditionId_key" ON "Ctoon"("relatedFirstEditionId");

-- CreateIndex
CREATE INDEX "Ctoon_isSecondEdition_idx" ON "Ctoon"("isSecondEdition");

-- CreateIndex
CREATE INDEX "Ctoon_name_idx" ON "Ctoon"("name");

-- AddForeignKey
ALTER TABLE "Ctoon" ADD CONSTRAINT "Ctoon_relatedFirstEditionId_fkey" FOREIGN KEY ("relatedFirstEditionId") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: previously, isFirstEdition was derived from mintNumber <= initialQuantity,
-- which incorrectly excluded unlimited-quantity (null) cToons. Second Edition didn't exist yet,
-- so every existing cToon is (by definition) a First Edition — recompute accordingly.
UPDATE "UserCtoon" SET "isFirstEdition" = true WHERE "isFirstEdition" = false;
