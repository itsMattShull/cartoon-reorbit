-- Operation A.S.T.E.R.O.I.D.: expose the remaining physics/geometry constants as admin
-- settings. Defaults match the values they replace in lib/asteroidSim.js, so applying this
-- migration changes nothing about how the game plays.

ALTER TABLE "GameConfig"
  ADD COLUMN "asteroidShipRadius"         DOUBLE PRECISION NOT NULL DEFAULT 13,
  ADD COLUMN "asteroidBulletSpeed"        DOUBLE PRECISION NOT NULL DEFAULT 6.2,
  ADD COLUMN "asteroidBulletLifeTicks"    INTEGER NOT NULL DEFAULT 66,
  ADD COLUMN "asteroidRespawnInvulnTicks" INTEGER NOT NULL DEFAULT 96,
  ADD COLUMN "asteroidPowerupRadius"      DOUBLE PRECISION NOT NULL DEFAULT 13,
  ADD COLUMN "asteroidPowerupLifeTicks"   INTEGER NOT NULL DEFAULT 600,
  ADD COLUMN "asteroidLargeRadius"        DOUBLE PRECISION NOT NULL DEFAULT 34,
  ADD COLUMN "asteroidMediumRadius"       DOUBLE PRECISION NOT NULL DEFAULT 20,
  ADD COLUMN "asteroidSmallRadius"        DOUBLE PRECISION NOT NULL DEFAULT 11;
