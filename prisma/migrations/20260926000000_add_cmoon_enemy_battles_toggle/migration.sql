-- Master on/off switch for the cMoon Enemy Battles feature, off by default (see
-- GlobalGameConfig.cMoonEnemyBattlesEnabled's schema comment).
ALTER TABLE "GlobalGameConfig" ADD COLUMN "cMoonEnemyBattlesEnabled" BOOLEAN NOT NULL DEFAULT false;
