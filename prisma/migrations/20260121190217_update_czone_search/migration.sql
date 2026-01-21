-- DropForeignKey (tolerate missing tables/constraints)
DO $$ BEGIN
  IF to_regclass('"CZoneSearchAppearance"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'CZoneSearchAppearance_ctoonId_fkey'
        AND conrelid = '"CZoneSearchAppearance"'::regclass
    ) THEN
      ALTER TABLE "CZoneSearchAppearance" DROP CONSTRAINT "CZoneSearchAppearance_ctoonId_fkey";
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"CZoneSearchCapture"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'CZoneSearchCapture_ctoonId_fkey'
        AND conrelid = '"CZoneSearchCapture"'::regclass
    ) THEN
      ALTER TABLE "CZoneSearchCapture" DROP CONSTRAINT "CZoneSearchCapture_ctoonId_fkey";
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"CZoneSearchPrize"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'CZoneSearchPrize_ctoonId_fkey'
        AND conrelid = '"CZoneSearchPrize"'::regclass
    ) THEN
      ALTER TABLE "CZoneSearchPrize" DROP CONSTRAINT "CZoneSearchPrize_ctoonId_fkey";
    END IF;
  END IF;
END $$;

-- AddForeignKey (tolerate missing tables/constraints)
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
