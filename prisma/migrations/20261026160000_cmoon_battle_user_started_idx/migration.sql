-- cMoon spawn cap now counts real CMoonEnemyBattle rows per player within a time window
-- (countRecentSoloStarts in server/utils/cmoonEnemy.js) instead of CMoonEnemyPopupLog, so give
-- that lookup an index. Index-only change; no data is modified.

-- CreateIndex
CREATE INDEX "CMoonEnemyBattle_userId_startedAt_idx" ON "CMoonEnemyBattle"("userId", "startedAt");
