-- Pokemon: Fire, Water, Grass! -- admin on/off switch.
--
-- Defaults to true so an existing install keeps the game exactly as it is; the admin turns it
-- off deliberately. Off hides the Games-page tile and refuses to start a battle, because the
-- route is reachable by URL and a head-to-head win pays points.
ALTER TABLE "GameConfig" ADD COLUMN IF NOT EXISTS "pokemonBattleEnabled" BOOLEAN DEFAULT true;
