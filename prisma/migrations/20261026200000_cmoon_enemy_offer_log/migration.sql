-- cMoon Enemy Analytics: log every popup offer (and whether the player engaged it) so the admin
-- page can report the offer -> start rate. New table only; no existing data is touched.

-- CreateTable
CREATE TABLE "CMoonEnemyOffer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "isRaidBoss" BOOLEAN NOT NULL DEFAULT false,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "CMoonEnemyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyOffer_offeredAt_idx" ON "CMoonEnemyOffer"("offeredAt");

-- CreateIndex
CREATE INDEX "CMoonEnemyOffer_userId_enemyMemberId_offeredAt_idx" ON "CMoonEnemyOffer"("userId", "enemyMemberId", "offeredAt");
