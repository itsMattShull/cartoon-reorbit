-- gToons Clash -- admin "hide from players" switch.
--
-- Defaults to true: Clash starts out hidden from the Games page and its pages/APIs are closed
-- until an admin turns the switch off in Manage Games > gToons Clash.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "clashHidden" BOOLEAN DEFAULT true;
