-- OG gToons: remember HOW a finished game was decided (more cards of the goal colours combined, or
-- higher total points), for the leaderboard's "wins by color / by points" breakdown.
--
-- Both columns are nullable with no default, so adding them is a metadata-only change: no table
-- rewrite and no long lock on OgGtoonMatch (written on every game). Existing rows stay NULL — the
-- reason can't be rebuilt reliably after the fact (a Silver card's chosen colour isn't stored) — so
-- the breakdown only counts games finished after this ships.

-- CreateEnum
CREATE TYPE "OgGtoonWinReason" AS ENUM ('COLOR', 'POINTS');

-- AlterTable
ALTER TABLE "OgGtoonMatch" ADD COLUMN     "winReason" "OgGtoonWinReason";

-- AlterTable
ALTER TABLE "OgGtoonPracticeMatch" ADD COLUMN     "winReason" "OgGtoonWinReason";
