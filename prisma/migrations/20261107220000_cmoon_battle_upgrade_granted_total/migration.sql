-- AlterTable
-- grantedTotal starts at a correct value for any PRE-EXISTING purchase row: `amount` (the
-- upgrade's value as of right now, the only value any existing row's purchases have ever used,
-- since this column didn't exist before this migration) times timesPurchased. Every purchase
-- made from this point forward stamps its own grantedTotal increment instead (see
-- cmoonBattleUpgradeOps.js), so this backfill only ever applies once, to history.
ALTER TABLE "UserCMoonBattleUpgrade" ADD COLUMN "grantedTotal" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserCMoonBattleUpgrade" u
SET "grantedTotal" = u."timesPurchased" * c."amount"
FROM "CMoonBattleUpgrade" c
WHERE c.id = u."upgradeId";
