-- AlterTable
ALTER TABLE "User" ADD COLUMN "cMoonOptedOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN "allowOptOutJoin" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN "cMoonOptOutCooldownDays" INTEGER NOT NULL DEFAULT 14;
