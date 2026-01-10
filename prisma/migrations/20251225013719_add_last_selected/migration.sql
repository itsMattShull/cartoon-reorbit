-- AlterTable
ALTER TABLE "SpeciesBaseStats" ADD COLUMN     "jumpingImagePath" TEXT,
ADD COLUMN     "standingStillImagePath" TEXT,
ADD COLUMN     "walkingImagePath" TEXT;

-- AlterTable
ALTER TABLE "UserMonster" ADD COLUMN     "lastSelected" BOOLEAN NOT NULL DEFAULT false;
