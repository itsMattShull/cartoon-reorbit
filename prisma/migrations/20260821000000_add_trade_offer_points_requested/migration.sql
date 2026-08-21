-- Adds the reverse points direction to a trade offer: pointsOffered already
-- moves points initiator -> recipient, this lets the initiator ask for points
-- recipient -> initiator in the same offer.
--
-- NOT NULL with a default, same as pointsOffered, so every existing row reads
-- as "requesting nothing" for free. No LockedPoints row is ever created for
-- this column (see the schema comment) -- it is intentionally the one amount
-- on a pending trade that is never reserved, so a request can be sent for any
-- amount without ever having to read the recipient's balance.
--
-- Metadata-only on PG 11+ (fixed default, no rewrite), but still needs
-- ACCESS EXCLUSIVE for the catalog update; lock_timeout matches the other
-- single-column adds in this migrations directory so this queues behind (and
-- times out against, rather than stalls behind) a long-running trade accept.
SET LOCAL lock_timeout = '3s';

ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "pointsRequested" INTEGER NOT NULL DEFAULT 0;
