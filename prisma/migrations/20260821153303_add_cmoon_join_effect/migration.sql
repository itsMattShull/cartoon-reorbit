-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "joinEffectDurationMs" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "joinEffectMessage" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cMoonJoinEffectShown" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather in existing cMoon members so the new effect doesn't ambush
-- everyone who already joined before this feature shipped.
UPDATE "User" SET "cMoonJoinEffectShown" = true WHERE "cMoonId" IS NOT NULL;

-- CreateTable
CREATE TABLE "CMoonJoinEffectImage" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonJoinEffectImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonJoinEffectImage_cMoonId_order_idx" ON "CMoonJoinEffectImage"("cMoonId", "order");

-- AddForeignKey
ALTER TABLE "CMoonJoinEffectImage" ADD CONSTRAINT "CMoonJoinEffectImage_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
