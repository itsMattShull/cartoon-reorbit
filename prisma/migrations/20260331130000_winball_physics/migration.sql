-- Add Winball physics configuration fields to GameConfig
ALTER TABLE "GameConfig" ADD COLUMN "winballGravity"             DOUBLE PRECISION DEFAULT 15;
ALTER TABLE "GameConfig" ADD COLUMN "winballBallMass"            DOUBLE PRECISION DEFAULT 8;
ALTER TABLE "GameConfig" ADD COLUMN "winballBallLinearDamping"   DOUBLE PRECISION DEFAULT 0.2;
ALTER TABLE "GameConfig" ADD COLUMN "winballBallAngularDamping"  DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "GameConfig" ADD COLUMN "winballBallWallRestitution" DOUBLE PRECISION DEFAULT 1.2;
ALTER TABLE "GameConfig" ADD COLUMN "winballPlungerMaxPull"      DOUBLE PRECISION DEFAULT 0.6;
ALTER TABLE "GameConfig" ADD COLUMN "winballPlungerImpactFactor" DOUBLE PRECISION DEFAULT 0.2;
ALTER TABLE "GameConfig" ADD COLUMN "winballPlungerForce"        DOUBLE PRECISION DEFAULT 500;
