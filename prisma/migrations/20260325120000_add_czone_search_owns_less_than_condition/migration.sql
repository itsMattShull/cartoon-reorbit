ALTER TABLE "CZoneSearchPrize"
ADD COLUMN "conditionOwnsLessThanEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "conditionOwnsLessThanCount" INTEGER;
