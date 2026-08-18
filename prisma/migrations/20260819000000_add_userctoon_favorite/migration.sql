-- Favorite cToons: an owner-set "keep this one" marker on a single copy.
--
-- Stores WHO favorited the copy rather than a bare boolean. A copy is favorited only
-- when "favoritedByUserId" = "userId", so a change of owner invalidates the marker for
-- free -- no transfer site has to remember to clear it, and a missed one degrades to
-- "not favorited" instead of poisoning the row for its new owner.
--
-- Nullable with no default, so this is a metadata-only catalog change on PG 11+: no
-- table rewrite. It still needs ACCESS EXCLUSIVE for the catalog update, and it would
-- otherwise queue behind (and then block) every reader while a long trade-accept
-- transaction finishes -- accept.post.js runs with a 20s budget and moves up to 500
-- rows. lock_timeout turns that worst case into a migration you retry rather than a
-- site-wide stall on the busiest table in the schema.
--
-- No index: every query that filters on this column also filters on "userId", which is
-- already indexed, and indexing it would block HOT updates for every favorite toggle.
SET LOCAL lock_timeout = '3s';

ALTER TABLE "UserCtoon" ADD COLUMN IF NOT EXISTS "favoritedByUserId" TEXT;
