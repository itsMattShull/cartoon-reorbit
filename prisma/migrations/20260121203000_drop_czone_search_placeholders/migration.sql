-- Drop placeholder tables if they do not have the real schema columns yet.
DO $$ BEGIN
  IF to_regclass('"CZoneSearchPrize"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'CZoneSearchPrize'
        AND column_name = 'cZoneSearchId'
    ) THEN
      DROP TABLE "CZoneSearchPrize";
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"CZoneSearchAppearance"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'CZoneSearchAppearance'
        AND column_name = 'cZoneSearchId'
    ) THEN
      DROP TABLE "CZoneSearchAppearance";
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"CZoneSearchCapture"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'CZoneSearchCapture'
        AND column_name = 'cZoneSearchId'
    ) THEN
      DROP TABLE "CZoneSearchCapture";
    END IF;
  END IF;
END $$;
