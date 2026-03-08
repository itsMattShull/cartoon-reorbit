-- Add Winball board color transform settings to GameConfig
ALTER TABLE "GameConfig" ADD COLUMN "winballColorTransform" TEXT DEFAULT '#ffffff';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorTransformIntensity" DOUBLE PRECISION DEFAULT 0;
