-- OG gToons tournaments can pay sealed packs, and have a participation prize.
--
-- * PackSource.OG_GTOONS_TOURNAMENT tags packs paid by a tournament prize grant, so purchase limits and
--   purchase analytics (which count PURCHASE rows only) never see them.
-- * OgGtoonTournamentPrizeTier.PARTICIPANT is the tier for entrants who played but won no place prize.
-- * OgGtoonTournament.participantPrizeJson is that tier's reward bundle (null = no participation prize, which
--   is every existing tournament, so nothing changes for them). Packs themselves live inside the existing
--   firstPrizeJson / top8PrizeJson / participantPrizeJson bundles as "packs": [{ packId, quantity }] — no column.
--
-- The two new enum values are not referenced anywhere else in this migration.

-- AlterEnum
ALTER TYPE "PackSource" ADD VALUE 'OG_GTOONS_TOURNAMENT';
ALTER TYPE "OgGtoonTournamentPrizeTier" ADD VALUE 'PARTICIPANT';

-- AlterTable
ALTER TABLE "OgGtoonTournament" ADD COLUMN "participantPrizeJson" JSONB;
