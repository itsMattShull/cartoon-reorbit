-- AddField: configurable combo cooldown (ms) for ReOrbit Match
ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "reorbitComboMs" INTEGER NOT NULL DEFAULT 3500;
