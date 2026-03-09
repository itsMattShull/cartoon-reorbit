-- Add Triangle 3 geometry fields and update peg radius defaults

ALTER TABLE "GameConfig"
  ADD COLUMN IF NOT EXISTS "winballTriangle3Radius" DOUBLE PRECISION DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "winballTriangle3Depth"  DOUBLE PRECISION DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "winballTriangle3X"      DOUBLE PRECISION DEFAULT 13,
  ADD COLUMN IF NOT EXISTS "winballTriangle3Z"      DOUBLE PRECISION DEFAULT -2;

-- Update peg radius column defaults from 1.5 to 0.5
ALTER TABLE "GameConfig"
  ALTER COLUMN "winballPeg1Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg2Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg3Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg4Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg5Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg6Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg7Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg8Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg9Radius"  SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg10Radius" SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg11Radius" SET DEFAULT 0.5,
  ALTER COLUMN "winballPeg12Radius" SET DEFAULT 0.5;

-- Update existing rows so pegs use the new radius
UPDATE "GameConfig"
SET
  "winballPeg1Radius"  = 0.5,
  "winballPeg2Radius"  = 0.5,
  "winballPeg3Radius"  = 0.5,
  "winballPeg4Radius"  = 0.5,
  "winballPeg5Radius"  = 0.5,
  "winballPeg6Radius"  = 0.5,
  "winballPeg7Radius"  = 0.5,
  "winballPeg8Radius"  = 0.5,
  "winballPeg9Radius"  = 0.5,
  "winballPeg10Radius" = 0.5,
  "winballPeg11Radius" = 0.5,
  "winballPeg12Radius" = 0.5
WHERE "gameName" = 'Winball';
