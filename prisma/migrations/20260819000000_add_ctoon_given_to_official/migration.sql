-- "Give to Official" admin action: mints 5 more copies of a fully-minted cToon
-- and gives them to the Official system account. One-time-ever per cToon —
-- this timestamp is both the audit marker and the DB-level guard preventing a
-- second use (see the WHERE clause in the give-to-official endpoint).
ALTER TABLE "Ctoon" ADD COLUMN IF NOT EXISTS "givenToOfficialAt" TIMESTAMP(3);
