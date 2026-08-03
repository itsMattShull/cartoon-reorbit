-- One cToon cannot be up for auction twice at the same time.
--
-- POST /api/auctions checked for an existing ACTIVE auction and then created
-- the new one in a separate statement, with no transaction and nothing in the
-- database to serialise them. Two concurrent requests for the same UserCtoon
-- both passed the check and both inserted. The four other creation paths
-- (auctionOnlyActivate, the dissolve-launch worker, remove-cheating, the guild
-- sync cron) do their reads inside a transaction, but READ COMMITTED does not
-- take a lock on a row that does not exist yet, so they are open to the same
-- race. A database constraint is the only thing that closes it for all five.
--
-- The payoff is not just a duplicate listing: both auctions close, both winners
-- are debited, the seller is credited twice, and the second close reassigns the
-- cToon away from the first winner. That mints points against a single item.

-- Step 1. Resolve the duplicates that can be resolved without a judgement call.
--
-- For each cToon, keep the auction that has bids; failing that, the earliest.
-- Close the losers, but only where they have no bids of their own — a bidless
-- listing has nobody's points committed to it and has not moved the cToon, so
-- retiring it costs no one anything.
--
-- isTradeable is deliberately left alone: the surviving auction still needs the
-- cToon locked. The orphaned BullMQ close job is harmless, because
-- performAuctionClose returns early on any auction that is no longer ACTIVE.
WITH ranked AS (
  SELECT a.id,
         row_number() OVER (
           PARTITION BY a."userCtoonId"
           ORDER BY (EXISTS (SELECT 1 FROM "Bid" b WHERE b."auctionId" = a.id)) DESC,
                    a."createdAt" ASC,
                    a.id ASC
         ) AS rank,
         EXISTS (SELECT 1 FROM "Bid" b WHERE b."auctionId" = a.id) AS has_bids
    FROM "Auction" a
   WHERE a.status = 'ACTIVE'
)
UPDATE "Auction" a
   SET status = 'CLOSED',
       "winnerAt" = NOW()
  FROM ranked r
 WHERE a.id = r.id
   AND r.rank > 1
   AND NOT r.has_bids;

-- Step 2. Anything left over needs a human: more than one live auction for the
-- same cToon, each with real bids against it. Someone has to decide which sale
-- stands and who gets refunded. Report it precisely — a bare unique-violation
-- from the index below would not say which cToons are at fault.
DO $$
DECLARE
  conflicting text;
BEGIN
  SELECT string_agg(t."userCtoonId", ', ')
    INTO conflicting
    FROM (
      SELECT "userCtoonId"
        FROM "Auction"
       WHERE status = 'ACTIVE'
       GROUP BY "userCtoonId"
      HAVING count(*) > 1
    ) t;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add the unique-active-auction constraint: these UserCtoon ids still have more than one ACTIVE auction with bids (%). Each needs a decision about which sale stands and who gets refunded; resolve them, then re-run this migration.',
      conflicting;
  END IF;
END $$;

-- Step 3. Partial unique index: only ACTIVE rows participate, so a cToon can be
-- auctioned any number of times in sequence, just not concurrently.
--
-- This has no equivalent in the Prisma schema language (partial indexes are not
-- expressible there), so it lives only in this migration. `prisma migrate dev`
-- will report it as drift and offer to drop it — keep it.
CREATE UNIQUE INDEX "Auction_active_userCtoonId_key"
    ON "Auction"("userCtoonId")
 WHERE status = 'ACTIVE';
