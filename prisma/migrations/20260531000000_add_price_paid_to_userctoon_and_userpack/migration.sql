-- Add pricePaid to UserCtoon: records exact points charged for direct cmart purchases.
-- NULL for pack-acquired, trade-received, lottery-won, etc.
ALTER TABLE "UserCtoon" ADD COLUMN "pricePaid" INTEGER;

-- Add pricePaid to UserPack: records effective pack price at time of purchase.
-- NULL for legacy records purchased before this tracking was added.
ALTER TABLE "UserPack" ADD COLUMN "pricePaid" INTEGER;
