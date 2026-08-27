-- Ed, Edd n Eddy RPS: server-authoritative "Play the Eds" AI matches.
--
-- Mirrors the nullable-second-player pattern ClashGame and MonsterBattle already use for their
-- AI opponents (player2UserId String? / player2IsAi Boolean), rather than a CHECK constraint —
-- no other table with an AI opponent in this schema enforces the invariant at the DB level, and
-- the single write path (server/utils/edRpsAiMatch.js) is where it belongs instead.
--
-- winnerUserId already goes null when the bot wins (no FK to satisfy), same as a real loss;
-- winnerIsAi exists only so the admin log can tell "the bot won" apart from "abandoned."

ALTER TABLE "EdRpsMatch" ALTER COLUMN "player2UserId" DROP NOT NULL;
ALTER TABLE "EdRpsMatch" ADD COLUMN IF NOT EXISTS "player2IsAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EdRpsMatch" ADD COLUMN IF NOT EXISTS "winnerIsAi"  BOOLEAN NOT NULL DEFAULT false;

-- Device-cluster daily cap for AI matches. PvP already suppresses payout on a same-IP/same-
-- visitorId MATCH (two colluding accounts playing each other); an AI opponent has no second
-- device to compare against, so that check cannot apply here. Instead server/utils/edRpsAiMatch.js
-- sums points already paid to AI matches from this same IP/visitorId within the daily window and
-- clamps this award to what's left of ONE player's normal daily cap — so a cluster of alts can
-- never out-earn a single honest player against the bot. These partial indexes are what keep
-- that sum cheap; Prisma cannot express a partial index, so it lives here only.
CREATE INDEX IF NOT EXISTS "EdRpsMatch_ai_ip_paid_idx"
  ON "EdRpsMatch" ("player1Ip", "pointsAwardedAt")
  WHERE "player2IsAi" = true AND "pointsAwardedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EdRpsMatch_ai_visitor_paid_idx"
  ON "EdRpsMatch" ("player1VisitorId", "pointsAwardedAt")
  WHERE "player2IsAi" = true AND "pointsAwardedAt" IS NOT NULL;
