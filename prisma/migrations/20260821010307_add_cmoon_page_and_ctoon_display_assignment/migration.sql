-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "pageDescription" TEXT,
ADD COLUMN     "pageImageHeight" INTEGER,
ADD COLUMN     "pageImagePath" TEXT,
ADD COLUMN     "pageImageWidth" INTEGER;

-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "cMoonId" TEXT;

-- CreateIndex
CREATE INDEX "Ctoon_cMoonId_idx" ON "Ctoon"("cMoonId");

-- AddForeignKey
ALTER TABLE "Ctoon" ADD CONSTRAINT "Ctoon_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
