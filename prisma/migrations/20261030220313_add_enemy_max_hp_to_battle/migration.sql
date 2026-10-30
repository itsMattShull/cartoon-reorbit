-- AlterTable
ALTER TABLE "CMoonEnemyBattle" ADD COLUMN     "enemyMaxHp" INTEGER NOT NULL DEFAULT 0;

-- Backfill every existing row from its enemy's CURRENT maxHp -- the best available approximation
-- of what it was at the time, since no per-battle snapshot existed before this column. Safe for
-- every row: CMoonEnemyBattle.enemyMemberId is onDelete: Restrict, so the join can never miss.
UPDATE "CMoonEnemyBattle" b
SET "enemyMaxHp" = m."maxHp"
FROM "CMoonEnemyMember" m
WHERE m."id" = b."enemyMemberId";
