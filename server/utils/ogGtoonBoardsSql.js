// server/utils/ogGtoonBoardsSql.js
//
// The database half of the OG gToons Leaderboard + Meta tabs (the rules and response shaping are in
// ogGtoonBoards.js). Everything aggregates INSIDE Postgres and hands back counts only: a Meta scan
// touches two deck-snapshot JSON blobs per game, which would be hundreds of MB if pulled into Node
// (and would stall the event loop that also runs live-game timers).
//
// The per-player modal (loadPlayerStats) also splits wins by HOW they were decided (winsByColor /
// winsByPoints, from the stored winReason); forfeits and games finished before the reason was
// recorded are in `wins` but in neither split.
// "Finished game" means the same thing everywhere (see FINISHED): INCOMPLETE rows — stale sweeps and
// admin-voided tournament games, which keep their old winnerUserId — are out, and so is a timed-out
// game saved as a 0-0 tie. Winners are read from `outcome`, never from winnerUserId.
import { Prisma } from '@prisma/client'
import { prisma as db } from '../prisma.js'
import { timeframeStart, META_MIN_DECK_GAMES } from './ogGtoonBoards.js'
import { powerDescriptionFor, describeEffects } from './ogGtoonPowerCatalog.js'

const FINISHED = Prisma.sql`m.outcome IN ('PLAYER1', 'PLAYER2', 'TIE')
  AND NOT (m.outcome = 'TIE' AND m."player1Score" = 0 AND m."player2Score" = 0)`

function tournamentClause(filter) {
  if (filter === 'tournament') return Prisma.sql`m."tournamentMatchId" IS NOT NULL`
  if (filter === 'non_tournament') return Prisma.sql`m."tournamentMatchId" IS NULL`
  return Prisma.sql`TRUE`
}

const toNumber = (v) => Number(v) || 0

/** The card's power as plain text (what the Decks tab shows), from the effect saved in the deck snapshot; null = no power. */
function powerTextOf(effectJson) {
  if (!effectJson) return null
  try {
    const effect = JSON.parse(effectJson)
    if (!Array.isArray(effect) || effect.length === 0) return null
    return powerDescriptionFor(effect) || describeEffects(effect) || null
  } catch {
    return null
  }
}

const recordOf = (r) => ({
  ...r,
  played: toNumber(r.played), wins: toNumber(r.wins), losses: toNumber(r.losses), ties: toNumber(r.ties)
})

/**
 * One scan over human-vs-human games: a row per player with their record and the stake points they
 * won from opponents (a win pays out the loser's stake; a tie refunds each side, so it earns nothing).
 */
export async function loadHumanLeaderboardRows({ timeframe, filter }) {
  const start = timeframeStart(timeframe)
  const since = start ? Prisma.sql`m."startedAt" >= ${start}` : Prisma.sql`TRUE`
  const rows = await db.$queryRaw`
    SELECT s.uid AS uid, u.username AS username,
      COUNT(*)::int AS played,
      COUNT(*) FILTER (WHERE (s.side = 1 AND m.outcome = 'PLAYER1') OR (s.side = 2 AND m.outcome = 'PLAYER2'))::int AS wins,
      COUNT(*) FILTER (WHERE (s.side = 1 AND m.outcome = 'PLAYER2') OR (s.side = 2 AND m.outcome = 'PLAYER1'))::int AS losses,
      COUNT(*) FILTER (WHERE m.outcome = 'TIE')::int AS ties,
      COALESCE(SUM(CASE WHEN (s.side = 1 AND m.outcome = 'PLAYER1') OR (s.side = 2 AND m.outcome = 'PLAYER2')
                        THEN s.opp_stake ELSE 0 END), 0)::bigint AS earned
    FROM "OgGtoonMatch" m
    CROSS JOIN LATERAL (VALUES
      (m."player1UserId", 1, m."player2Points"),
      (m."player2UserId", 2, m."player1Points")
    ) AS s(uid, side, opp_stake)
    LEFT JOIN "User" u ON u.id = s.uid
    WHERE ${since} AND ${FINISHED} AND ${tournamentClause(filter)}
    GROUP BY s.uid, u.username
  `
  return rows.map(r => ({ ...recordOf(r), earned: toNumber(r.earned) }))
}

/** A row per player over finished practice matches (the player vs. the bot), optionally one difficulty. */
export async function loadPracticeLeaderboardRows({ timeframe, difficulty }) {
  const start = timeframeStart(timeframe)
  const since = start ? Prisma.sql`p."endedAt" >= ${start}` : Prisma.sql`TRUE`
  const level = difficulty && difficulty !== 'all'
    ? Prisma.sql`p.difficulty = ${difficulty}::"OgGtoonPracticeDifficulty"`
    : Prisma.sql`TRUE`
  const rows = await db.$queryRaw`
    SELECT p."userId" AS uid, u.username AS username,
      COUNT(*)::int AS played,
      COUNT(*) FILTER (WHERE p.outcome = 'PLAYER_WIN')::int AS wins,
      COUNT(*) FILTER (WHERE p.outcome = 'BOT_WIN')::int AS losses,
      COUNT(*) FILTER (WHERE p.outcome = 'TIE')::int AS ties
    FROM "OgGtoonPracticeMatch" p
    LEFT JOIN "User" u ON u.id = p."userId"
    WHERE ${since} AND ${level}
    GROUP BY p."userId", u.username
  `
  return rows.map(r => ({ ...recordOf(r), earned: 0 }))
}

/**
 * The Meta aggregate for one (days, filter): human matches only — practice is never in this table —
 * and a forfeit (whoLeftUserId set) is skipped since the decks never really played. A deck is its 12
 * ctoonIds sorted, so card order doesn't matter; its goal card is the one usually in position 11.
 * See buildMetaResponse for how mirror matches are counted.
 */
export async function loadMetaAggregate({ days, filter }) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const base = Prisma.sql`m."startedAt" >= ${since}
    AND ${FINISHED}
    AND m."whoLeftUserId" IS NULL
    AND ${tournamentClause(filter)}`
  const isArrays = Prisma.sql`jsonb_typeof(m."player1DeckSnapshot") = 'array' AND jsonb_typeof(m."player2DeckSnapshot") = 'array'`

  const [totals] = await db.$queryRaw`
    SELECT COUNT(*)::int AS "totalGames", COUNT(*) FILTER (WHERE m.outcome <> 'TIE')::int AS "decidedGames"
    FROM "OgGtoonMatch" m
    WHERE ${base}
  `

  const decks = await db.$queryRaw`
    WITH g AS (
      SELECT m.outcome,
        (SELECT string_agg(e->>'ctoonId', ',' ORDER BY e->>'ctoonId') FROM jsonb_array_elements(m."player1DeckSnapshot") e) AS k1,
        (SELECT string_agg(e->>'ctoonId', ',' ORDER BY e->>'ctoonId') FROM jsonb_array_elements(m."player2DeckSnapshot") e) AS k2,
        m."player1DeckSnapshot" -> 11 ->> 'ctoonId' AS goal1,
        m."player2DeckSnapshot" -> 11 ->> 'ctoonId' AS goal2
      FROM "OgGtoonMatch" m
      WHERE ${base} AND ${isArrays}
    ),
    sides AS (
      SELECT 1 AS side, outcome, k1 AS k, k2 AS other, goal1 AS goal FROM g
      UNION ALL
      SELECT 2 AS side, outcome, k2 AS k, k1 AS other, goal2 AS goal FROM g
    )
    SELECT md5(k) AS "deckId", k AS "deckKey",
      (COUNT(*) FILTER (WHERE k <> other) + COUNT(*) FILTER (WHERE k = other) / 2)::int AS games,
      COUNT(*) FILTER (WHERE k <> other AND ((side = 1 AND outcome = 'PLAYER1') OR (side = 2 AND outcome = 'PLAYER2')))::int AS wins,
      COUNT(*) FILTER (WHERE k <> other AND ((side = 1 AND outcome = 'PLAYER2') OR (side = 2 AND outcome = 'PLAYER1')))::int AS losses,
      COUNT(*) FILTER (WHERE k <> other AND outcome = 'TIE')::int AS ties,
      (COUNT(*) FILTER (WHERE k = other) / 2)::int AS mirrors,
      MODE() WITHIN GROUP (ORDER BY goal) AS "goalCtoonId"
    FROM sides
    WHERE k IS NOT NULL
    GROUP BY k
    HAVING (COUNT(*) FILTER (WHERE k <> other) + COUNT(*) FILTER (WHERE k = other) / 2) >= ${META_MIN_DECK_GAMES}
  `

  const cards = await db.$queryRaw`
    WITH g AS (
      SELECT m.outcome, m."player1DeckSnapshot" AS p1, m."player2DeckSnapshot" AS p2
      FROM "OgGtoonMatch" m
      WHERE ${base} AND ${isArrays}
    ),
    sides AS (
      SELECT 1 AS side, outcome, p1 AS snap FROM g
      UNION ALL
      SELECT 2 AS side, outcome, p2 AS snap FROM g
    )
    SELECT e->>'ctoonId' AS "ctoonId",
      MAX(e->>'name') AS name,
      MAX(e->>'assetPath') AS "assetPath",
      MAX(e->>'color') AS color,
      MAX(e->>'value') AS value,
      MAX((e->'effect')::text) AS effect,
      bool_or(COALESCE((e->>'isSlam')::boolean, false)) AS "isSlam",
      COUNT(*)::int AS appearances,
      COUNT(*) FILTER (WHERE (side = 1 AND outcome = 'PLAYER1') OR (side = 2 AND outcome = 'PLAYER2'))::int AS wins,
      COUNT(*) FILTER (WHERE (side = 1 AND outcome = 'PLAYER2') OR (side = 2 AND outcome = 'PLAYER1'))::int AS losses,
      COUNT(*) FILTER (WHERE outcome = 'TIE')::int AS ties
    FROM sides s
    CROSS JOIN LATERAL jsonb_array_elements(s.snap) e
    WHERE e->>'ctoonId' IS NOT NULL
    GROUP BY e->>'ctoonId'
  `

  return {
    generatedAt: new Date().toISOString(),
    totalGames: toNumber(totals?.totalGames),
    decidedGames: toNumber(totals?.decidedGames),
    decks: decks.map(d => ({ ...d, games: toNumber(d.games), wins: toNumber(d.wins), losses: toNumber(d.losses), ties: toNumber(d.ties), mirrors: toNumber(d.mirrors) })),
    cards: cards.map(({ effect, ...c }) => ({ ...c, power: powerTextOf(effect), appearances: toNumber(c.appearances), wins: toNumber(c.wins), losses: toNumber(c.losses), ties: toNumber(c.ties) }))
  }
}

/* ── One player's deeper stats (the modal opened from a leaderboard row) ─────────────────── */

const SIDE = (userId) => Prisma.sql`(CASE WHEN m."player1UserId" = ${userId} THEN 1 ELSE 2 END)`
const MY_WIN = Prisma.sql`((s.side = 1 AND m.outcome = 'PLAYER1') OR (s.side = 2 AND m.outcome = 'PLAYER2'))`
const MY_LOSS = Prisma.sql`((s.side = 1 AND m.outcome = 'PLAYER2') OR (s.side = 2 AND m.outcome = 'PLAYER1'))`

/**
 * Raw rows for ogGtoonBoards.buildPlayerStats: the player's finished human games (split into
 * tournament / not), their most-played decks, their last ten results, and their practice record by
 * difficulty. Every query starts from the player's own rows (the (player1UserId, startedAt) and
 * (player2UserId, startedAt) indexes), so the cost follows their history, not the table.
 */
export async function loadPlayerStats(userId, timeframe) {
  const start = timeframeStart(timeframe)
  const since = start ? Prisma.sql`m."startedAt" >= ${start}` : Prisma.sql`TRUE`
  const mine = Prisma.sql`(m."player1UserId" = ${userId} OR m."player2UserId" = ${userId})`

  const human = await db.$queryRaw`
    SELECT (m."tournamentMatchId" IS NOT NULL) AS tournament,
      COUNT(*)::int AS played,
      COUNT(*) FILTER (WHERE ${MY_WIN})::int AS wins,
      COUNT(*) FILTER (WHERE ${MY_LOSS})::int AS losses,
      COUNT(*) FILTER (WHERE m.outcome = 'TIE')::int AS ties,
      COUNT(*) FILTER (WHERE ${MY_WIN} AND m."winReason" = 'COLOR')::int AS "winsByColor",
      COUNT(*) FILTER (WHERE ${MY_WIN} AND m."winReason" = 'POINTS')::int AS "winsByPoints",
      COUNT(*) FILTER (WHERE m."whoLeftUserId" = ${userId})::int AS "gamesLeft",
      COALESCE(SUM(CASE WHEN ${MY_WIN} THEN (CASE WHEN s.side = 1 THEN m."player2Points" ELSE m."player1Points" END) ELSE 0 END), 0)::bigint AS earned
    FROM "OgGtoonMatch" m
    CROSS JOIN LATERAL (SELECT ${SIDE(userId)} AS side) s
    WHERE ${mine} AND ${since} AND ${FINISHED}
    GROUP BY 1
  `

  const topDecks = await db.$queryRaw`
    WITH played AS (
      SELECT m.outcome, s.side,
        CASE WHEN s.side = 1 THEN m."player1DeckSnapshot" ELSE m."player2DeckSnapshot" END AS snap
      FROM "OgGtoonMatch" m
      CROSS JOIN LATERAL (SELECT ${SIDE(userId)} AS side) s
      WHERE ${mine} AND ${since} AND ${FINISHED} AND m."whoLeftUserId" IS NULL
    ),
    keyed AS (
      SELECT outcome, side, snap,
        (SELECT string_agg(e->>'ctoonId', ',' ORDER BY e->>'ctoonId') FROM jsonb_array_elements(snap) e) AS k
      FROM played
      WHERE jsonb_typeof(snap) = 'array'
    )
    SELECT md5(k) AS "deckId",
      COUNT(*)::int AS games,
      COUNT(*) FILTER (WHERE (side = 1 AND outcome = 'PLAYER1') OR (side = 2 AND outcome = 'PLAYER2'))::int AS wins,
      COUNT(*) FILTER (WHERE (side = 1 AND outcome = 'PLAYER2') OR (side = 2 AND outcome = 'PLAYER1'))::int AS losses,
      COUNT(*) FILTER (WHERE outcome = 'TIE')::int AS ties,
      MODE() WITHIN GROUP (ORDER BY snap -> 11 ->> 'name') AS "goalName"
    FROM keyed
    WHERE k IS NOT NULL
    GROUP BY k
    ORDER BY games DESC, wins DESC
    LIMIT 3
  `

  // The last ten results, whatever the timeframe: "recent form" is about now.
  const recent = await db.$queryRaw`
    SELECT (CASE WHEN ${MY_WIN} THEN 'W' WHEN m.outcome = 'TIE' THEN 'T' ELSE 'L' END) AS result,
      (m."tournamentMatchId" IS NOT NULL) AS tournament
    FROM "OgGtoonMatch" m
    CROSS JOIN LATERAL (SELECT ${SIDE(userId)} AS side) s
    WHERE ${mine} AND ${FINISHED}
    ORDER BY m."startedAt" DESC
    LIMIT 10
  `

  const practiceSince = start ? Prisma.sql`p."endedAt" >= ${start}` : Prisma.sql`TRUE`
  const practice = await db.$queryRaw`
    SELECT p.difficulty::text AS difficulty,
      COUNT(*)::int AS played,
      COUNT(*) FILTER (WHERE p.outcome = 'PLAYER_WIN')::int AS wins,
      COUNT(*) FILTER (WHERE p.outcome = 'BOT_WIN')::int AS losses,
      COUNT(*) FILTER (WHERE p.outcome = 'TIE')::int AS ties,
      COUNT(*) FILTER (WHERE p.outcome = 'PLAYER_WIN' AND p."winReason" = 'COLOR')::int AS "winsByColor",
      COUNT(*) FILTER (WHERE p.outcome = 'PLAYER_WIN' AND p."winReason" = 'POINTS')::int AS "winsByPoints"
    FROM "OgGtoonPracticeMatch" p
    WHERE p."userId" = ${userId} AND ${practiceSince}
    GROUP BY p.difficulty
  `

  const counted = (r) => ({
    played: toNumber(r.played), wins: toNumber(r.wins), losses: toNumber(r.losses), ties: toNumber(r.ties),
    winsByColor: toNumber(r.winsByColor), winsByPoints: toNumber(r.winsByPoints)
  })
  return {
    human: human.map(r => ({ ...counted(r), tournament: !!r.tournament, gamesLeft: toNumber(r.gamesLeft), earned: toNumber(r.earned) })),
    topDecks: topDecks.map(d => ({ ...d, games: toNumber(d.games), wins: toNumber(d.wins), losses: toNumber(d.losses), ties: toNumber(d.ties) })),
    recent: recent.map(r => ({ result: r.result, tournament: !!r.tournament })),
    practice: practice.map(r => ({ ...counted(r), difficulty: r.difficulty }))
  }
}
