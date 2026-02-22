ALTER TABLE "CZoneSearchPrize"
ADD COLUMN "conditionSetUniqueCountEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "conditionSetUniqueCountMin" INTEGER,
ADD COLUMN "conditionSetUniqueCountSet" TEXT,
ADD COLUMN "conditionSetTotalCountEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "conditionSetTotalCountMin" INTEGER,
ADD COLUMN "conditionSetTotalCountSet" TEXT;
