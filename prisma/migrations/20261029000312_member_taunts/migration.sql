-- CreateTable
CREATE TABLE "CMoonEnemyMemberTaunt" (
    "id" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "trigger" "CMoonEnemyTauntTrigger" NOT NULL,
    "text" TEXT NOT NULL,
    "soundPath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonEnemyMemberTaunt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyMemberTaunt_enemyMemberId_trigger_active_idx" ON "CMoonEnemyMemberTaunt"("enemyMemberId", "trigger", "active");

-- AddForeignKey
ALTER TABLE "CMoonEnemyMemberTaunt" ADD CONSTRAINT "CMoonEnemyMemberTaunt_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
