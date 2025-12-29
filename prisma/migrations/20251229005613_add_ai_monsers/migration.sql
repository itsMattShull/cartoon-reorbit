-- CreateEnum
CREATE TYPE "MonsterBattleEndReason" AS ENUM ('KO', 'RETREAT', 'TIMEOUT', 'DISCONNECT');

-- AlterEnum
ALTER TYPE "ScanOutcome" ADD VALUE 'BATTLE';

-- AlterTable
ALTER TABLE "BarcodeGameConfig" ADD COLUMN     "oddsBattle" DOUBLE PRECISION NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "MonsterBattle" (
    "id" TEXT NOT NULL,
    "player1UserId" TEXT NOT NULL,
    "player2UserId" TEXT,
    "player2IsAi" BOOLEAN NOT NULL DEFAULT false,
    "player1MonsterId" TEXT NOT NULL,
    "player2MonsterId" TEXT,
    "player1StartStats" JSONB NOT NULL,
    "player2StartStats" JSONB NOT NULL,
    "player1FinalHp" INTEGER,
    "player2FinalHp" INTEGER,
    "winnerUserId" TEXT,
    "winnerIsAi" BOOLEAN NOT NULL DEFAULT false,
    "endReason" "MonsterBattleEndReason",
    "turnLog" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "MonsterBattle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMonster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rarity" "MonsterRarity" NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "baseAtk" INTEGER NOT NULL,
    "baseDef" INTEGER NOT NULL,
    "walkingImagePath" TEXT,
    "standingStillImagePath" TEXT,
    "jumpingImagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMonster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonsterBattle_player1UserId_idx" ON "MonsterBattle"("player1UserId");

-- CreateIndex
CREATE INDEX "MonsterBattle_player2UserId_idx" ON "MonsterBattle"("player2UserId");

-- CreateIndex
CREATE INDEX "MonsterBattle_player1MonsterId_idx" ON "MonsterBattle"("player1MonsterId");

-- CreateIndex
CREATE INDEX "MonsterBattle_player2MonsterId_idx" ON "MonsterBattle"("player2MonsterId");

-- CreateIndex
CREATE INDEX "AiMonster_rarity_idx" ON "AiMonster"("rarity");

-- CreateIndex
CREATE INDEX "AiMonster_createdAt_idx" ON "AiMonster"("createdAt");

-- AddForeignKey
ALTER TABLE "MonsterBattle" ADD CONSTRAINT "MonsterBattle_player1UserId_fkey" FOREIGN KEY ("player1UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterBattle" ADD CONSTRAINT "MonsterBattle_player2UserId_fkey" FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterBattle" ADD CONSTRAINT "MonsterBattle_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterBattle" ADD CONSTRAINT "MonsterBattle_player1MonsterId_fkey" FOREIGN KEY ("player1MonsterId") REFERENCES "UserMonster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonsterBattle" ADD CONSTRAINT "MonsterBattle_player2MonsterId_fkey" FOREIGN KEY ("player2MonsterId") REFERENCES "UserMonster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
