-- CreateTable
CREATE TABLE "CMoonEnemyMemberSpecialAttack" (
    "id" TEXT NOT NULL,
    "enemyMemberId" TEXT NOT NULL,
    "specialAttackId" TEXT NOT NULL,
    "usePercent" INTEGER NOT NULL DEFAULT 100,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonEnemyMemberSpecialAttack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonEnemyMemberSpecialAttack_enemyMemberId_specialAttackId_key" ON "CMoonEnemyMemberSpecialAttack"("enemyMemberId", "specialAttackId");

-- CreateIndex
CREATE INDEX "CMoonEnemyMemberSpecialAttack_enemyMemberId_sortOrder_idx" ON "CMoonEnemyMemberSpecialAttack"("enemyMemberId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CMoonEnemyMemberSpecialAttack" ADD CONSTRAINT "CMoonEnemyMemberSpecialAttack_enemyMemberId_fkey" FOREIGN KEY ("enemyMemberId") REFERENCES "CMoonEnemyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyMemberSpecialAttack" ADD CONSTRAINT "CMoonEnemyMemberSpecialAttack_specialAttackId_fkey" FOREIGN KEY ("specialAttackId") REFERENCES "CMoonSpecialAttack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
