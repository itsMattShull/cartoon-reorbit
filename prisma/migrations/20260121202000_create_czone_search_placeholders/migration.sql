-- Create placeholder tables so the FK migration can run on a fresh shadow DB.
CREATE TABLE IF NOT EXISTS "CZoneSearchPrize" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    CONSTRAINT "CZoneSearchPrize_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CZoneSearchAppearance" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    CONSTRAINT "CZoneSearchAppearance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CZoneSearchCapture" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    CONSTRAINT "CZoneSearchCapture_pkey" PRIMARY KEY ("id")
);

-- Add placeholder FK constraints if they do not already exist.
DO $$ BEGIN
  IF to_regclass('"CZoneSearchPrize"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'CZoneSearchPrize_ctoonId_fkey'
        AND conrelid = '"CZoneSearchPrize"'::regclass
    ) THEN
      ALTER TABLE "CZoneSearchPrize"
        ADD CONSTRAINT "CZoneSearchPrize_ctoonId_fkey"
        FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"CZoneSearchAppearance"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'CZoneSearchAppearance_ctoonId_fkey'
        AND conrelid = '"CZoneSearchAppearance"'::regclass
    ) THEN
      ALTER TABLE "CZoneSearchAppearance"
        ADD CONSTRAINT "CZoneSearchAppearance_ctoonId_fkey"
        FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"CZoneSearchCapture"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'CZoneSearchCapture_ctoonId_fkey'
        AND conrelid = '"CZoneSearchCapture"'::regclass
    ) THEN
      ALTER TABLE "CZoneSearchCapture"
        ADD CONSTRAINT "CZoneSearchCapture_ctoonId_fkey"
        FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
