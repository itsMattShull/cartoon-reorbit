-- Dissolve queue: admin-set starting bids for the rarities with no rarity floor (Auction Only,
-- Prize Only, Code Only, Crazy Rare). Nullable with no default: a metadata-only change, no table
-- rewrite. NULL = that rarity is held in the queue until a bid is set.

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "dissolveStartBidAuctionOnly" INTEGER,
ADD COLUMN     "dissolveStartBidPrizeOnly" INTEGER,
ADD COLUMN     "dissolveStartBidCodeOnly" INTEGER,
ADD COLUMN     "dissolveStartBidCrazyRare" INTEGER;
