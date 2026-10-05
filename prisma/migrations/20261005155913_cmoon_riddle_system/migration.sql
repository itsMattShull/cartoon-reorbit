-- CreateEnum
CREATE TYPE "CMoonRiddleKind" AS ENUM ('WEEKLY', 'BOSS_LORE');

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonRiddlePoints" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "CMoonRiddle" (
    "id" TEXT NOT NULL,
    "kind" "CMoonRiddleKind" NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "enemyMemberId" TEXT,
    "encyclopediaEntryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3),
    "solvedAt" TIMESTAMP(3),
    "solvedByUserId" TEXT,
    "solvedByCMoonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonRiddle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonRiddle_kind_active_idx" ON "CMoonRiddle"("kind", "active");

-- CreateIndex
CREATE INDEX "CMoonRiddle_enemyMemberId_idx" ON "CMoonRiddle"("enemyMemberId");

-- AddForeignKey
ALTER TABLE "CMoonRiddle" ADD CONSTRAINT "CMoonRiddle_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonRiddle" ADD CONSTRAINT "CMoonRiddle_encyclopediaEntryId_fkey" FOREIGN KEY ("encyclopediaEntryId") REFERENCES "EncyclopediaEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
