-- Operation A.S.T.E.R.O.I.D.: three selectable ships, each with its own weapon profile.
--
-- Firing is now resolved from the ship the player picked at /start rather than from the single
-- global weapon config, so "asteroidBulletSpeed" and "asteroidBulletLifeTicks" are no longer
-- read. They are left in place rather than dropped: removing them would be destructive for no
-- benefit, and they are no longer exposed in the admin panel.
--
-- Defaults mirror the `weapon` blocks in lib/asteroidSim.js, so applying this migration
-- produces exactly the intended feel for each ship with no further configuration.

-- M.O.S.Q.U.I.T.T.O.H. — long range, slow rate
ALTER TABLE "GameConfig"
  ADD COLUMN "asteroidMosqFireInterval" INTEGER NOT NULL DEFAULT 26,
  ADD COLUMN "asteroidMosqBulletSpeed"  DOUBLE PRECISION NOT NULL DEFAULT 7.6,
  ADD COLUMN "asteroidMosqBulletLife"   INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "asteroidMosqPellets"      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "asteroidMosqSpread"       INTEGER NOT NULL DEFAULT 0,
-- S.C.A.M.P.E.R. — shotgun spray, very short range
  ADD COLUMN "asteroidScamFireInterval" INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "asteroidScamBulletSpeed"  DOUBLE PRECISION NOT NULL DEFAULT 5.6,
  ADD COLUMN "asteroidScamBulletLife"   INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "asteroidScamPellets"      INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "asteroidScamSpread"       INTEGER NOT NULL DEFAULT 96,
-- C.A.S.U.A.L. — medium range, medium rate
  ADD COLUMN "asteroidCasFireInterval"  INTEGER NOT NULL DEFAULT 13,
  ADD COLUMN "asteroidCasBulletSpeed"   DOUBLE PRECISION NOT NULL DEFAULT 6.2,
  ADD COLUMN "asteroidCasBulletLife"    INTEGER NOT NULL DEFAULT 66,
  ADD COLUMN "asteroidCasPellets"       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "asteroidCasSpread"        INTEGER NOT NULL DEFAULT 0;

-- Which ship flew each run, for balance analysis. Existing rows predate ship selection and
-- were all flown with what is now the C.A.S.U.A.L. profile, which is the old default weapon.
ALTER TABLE "AsteroidScore"
  ADD COLUMN "shipId" TEXT NOT NULL DEFAULT 'casual';
