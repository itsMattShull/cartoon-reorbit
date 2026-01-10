-- AlterTable
ALTER TABLE "BarcodeGameConfig" ADD COLUMN     "monsterInactivityDecayHours" INTEGER NOT NULL DEFAULT 48;

-- AlterTable
ALTER TABLE "UserMonster" ADD COLUMN     "lastInteractionAt" TIMESTAMP(3);
