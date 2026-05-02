-- AlterTable: make optional TkoMatch fields nullable
ALTER TABLE "TkoMatch" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "TkoMatch" ALTER COLUMN "battleCode" DROP NOT NULL;
ALTER TABLE "TkoMatch" ALTER COLUMN "startedAt" DROP NOT NULL;

-- AlterTable: make optional TkoRound fields nullable
ALTER TABLE "TkoRound" ALTER COLUMN "durationMs" DROP NOT NULL;
ALTER TABLE "TkoRound" ALTER COLUMN "winnerReorbitId" DROP NOT NULL;
ALTER TABLE "TkoRound" ALTER COLUMN "winnerRemainingHealth" DROP NOT NULL;
ALTER TABLE "TkoRound" ALTER COLUMN "loserReorbitId" DROP NOT NULL;
ALTER TABLE "TkoRound" ALTER COLUMN "loserRemainingHealth" DROP NOT NULL;
