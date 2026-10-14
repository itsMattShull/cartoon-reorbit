-- CreateEnum
CREATE TYPE "CMoonEnemyTauntTrigger" AS ENUM ('APPEAR', 'CRIT');

-- CreateTable
CREATE TABLE "CMoonEnemyTaunt" (
    "id" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "trigger" "CMoonEnemyTauntTrigger" NOT NULL,
    "text" TEXT NOT NULL,
    "soundPath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyTaunt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyTaunt_factionId_trigger_active_idx" ON "CMoonEnemyTaunt"("factionId", "trigger", "active");

-- AddForeignKey
ALTER TABLE "CMoonEnemyTaunt" ADD CONSTRAINT "CMoonEnemyTaunt_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "CMoonEnemyFaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
