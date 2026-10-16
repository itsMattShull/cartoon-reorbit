-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "isSwf" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "swfPath" TEXT;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "gameTileFlashArcadeImagePath" TEXT;

-- CreateTable
CREATE TABLE "FlashGame" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailPath" TEXT,
    "swfPath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlashGame_active_sortOrder_idx" ON "FlashGame"("active", "sortOrder");
