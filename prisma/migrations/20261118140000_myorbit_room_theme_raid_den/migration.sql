-- AlterTable
ALTER TABLE "MyOrbitRoom" ADD COLUMN     "themeCMoonId" TEXT,
ADD COLUMN     "isRaidDen" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MyOrbitRoom_themeCMoonId_idx" ON "MyOrbitRoom"("themeCMoonId");

-- AddForeignKey
ALTER TABLE "MyOrbitRoom" ADD CONSTRAINT "MyOrbitRoom_themeCMoonId_fkey" FOREIGN KEY ("themeCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
