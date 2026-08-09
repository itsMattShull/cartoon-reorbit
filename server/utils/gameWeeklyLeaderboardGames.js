// Games eligible for the Game Weekly Leaderboard prize admin feature, and the query each one
// needs to find its single #1 player for an explicit [weekStart, weekEnd) window (not "now
// minus 7 days" — the cron fires at a fixed scheduled instant, so the window must be pinned to
// that instant, not to whenever the query happens to run).
//
// gToons Clash is deliberately not supported here: its leaderboard isn't a single ranked score
// (server/api/game/clash/leaderboard.get.js ranks by wins/win%/stake-earned across several
// separate boards with no single "#1"), so it doesn't fit the "one weekly winner" shape this
// feature assumes.
import { prisma } from '@/server/prisma'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

// Standard shape: MAX or MIN of a numeric column on a per-run score table, best player wins.
function standardWinnerQuery(table, scoreColumn, direction) {
  const agg = direction === 'asc' ? 'MIN' : 'MAX'
  const order = direction === 'asc' ? 'ASC' : 'DESC'
  return (weekStart, weekEnd) => prisma.$queryRawUnsafe(
    `
    SELECT u."id" AS "userId", u."username", ${agg}(s."${scoreColumn}")::float AS "score"
    FROM "${table}" s
    JOIN "User" u ON u."id" = s."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND s."userId" <> $1
      AND s."createdAt" >= $2 AND s."createdAt" < $3
    GROUP BY u."id", u."username"
    ORDER BY ${agg}(s."${scoreColumn}") ${order}, u."username" ASC
    LIMIT 1;
    `,
    EXCLUDED_SYSTEM_USER_ID, weekStart, weekEnd
  )
}

// Guess that cToon!: best streak per user (first-reached tiebreak), only counted/non-suspicious runs.
function guessCtoonWinnerQuery(weekStart, weekEnd) {
  return prisma.$queryRaw`
    WITH best AS (
      SELECT DISTINCT ON (s."userId")
             s."userId", s."streak", s."createdAt"
      FROM "GuessCtoonScore" s
      WHERE s."suspicious" = false
        AND s."counted" = true
        AND s."createdAt" >= ${weekStart} AND s."createdAt" < ${weekEnd}
      ORDER BY s."userId", s."streak" DESC, s."createdAt" ASC
    )
    SELECT u."id" AS "userId", u."username", b."streak"::float AS "score"
    FROM best b
    JOIN "User" u ON u."id" = b."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND b."userId" <> ${EXCLUDED_SYSTEM_USER_ID}
    ORDER BY b."streak" DESC, b."createdAt" ASC
    LIMIT 1;
  `
}

// Ed, Edd n Eddy RPS: ranked by match wins (not a per-run score table), only naturally-ended matches.
function edRpsWinnerQuery(weekStart, weekEnd) {
  return prisma.$queryRaw`
    WITH participants AS (
      SELECT m."player1UserId" AS uid, (m."winnerUserId" = m."player1UserId") AS won
        FROM "EdRpsMatch" m
       WHERE m."endedAt" IS NOT NULL
         AND m."endReason" = 'natural'
         AND m."player1UserId" <> m."player2UserId"
         AND m."endedAt" >= ${weekStart} AND m."endedAt" < ${weekEnd}
      UNION ALL
      SELECT m."player2UserId" AS uid, (m."winnerUserId" = m."player2UserId") AS won
        FROM "EdRpsMatch" m
       WHERE m."endedAt" IS NOT NULL
         AND m."endReason" = 'natural'
         AND m."player1UserId" <> m."player2UserId"
         AND m."endedAt" >= ${weekStart} AND m."endedAt" < ${weekEnd}
    ),
    agg AS (
      SELECT uid, COUNT(*) FILTER (WHERE won)::int AS wins
      FROM participants
      WHERE uid <> ${EXCLUDED_SYSTEM_USER_ID}
      GROUP BY uid
      HAVING COUNT(*) FILTER (WHERE won) > 0
    )
    SELECT u."id" AS "userId", u."username", a.wins::float AS "score"
    FROM agg a
    JOIN "User" u ON u."id" = a.uid
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
    ORDER BY a.wins DESC, u."username" ASC
    LIMIT 1;
  `
}

export const GAME_WEEKLY_LEADERBOARD_GAMES = {
  tower: {
    label: 'Tower Stack',
    findWinner: standardWinnerQuery('TowerStackScore', 'score', 'desc')
  },
  reorbitmemory: {
    label: 'ReOrbit Memory',
    findWinner: standardWinnerQuery('ReOrbitMemoryScore', 'moves', 'asc')
  },
  reorbitmatch: {
    label: 'ReOrbit Match',
    findWinner: standardWinnerQuery('ReOrbitMatchScore', 'score', 'desc')
  },
  flappypowerpuff: {
    label: 'Flappy Powerpuff',
    findWinner: standardWinnerQuery('FlappyPowerpuffScore', 'score', 'desc')
  },
  asteroid: {
    label: 'Operation A.S.T.E.R.O.I.D.',
    findWinner: standardWinnerQuery('AsteroidScore', 'score', 'desc')
  },
  guessctoon: {
    label: 'Guess that cToon!',
    findWinner: guessCtoonWinnerQuery
  },
  edrps: {
    label: 'Ed, Edd n Eddy RPS',
    findWinner: edRpsWinnerQuery
  }
}

export function isSupportedGame(game) {
  return Object.prototype.hasOwnProperty.call(GAME_WEEKLY_LEADERBOARD_GAMES, game)
}

// Returns { userId, username, score } for the top player in [weekStart, weekEnd), or null.
export async function findWeeklyWinner(game, weekStart, weekEnd) {
  const cfg = GAME_WEEKLY_LEADERBOARD_GAMES[game]
  if (!cfg) throw new Error(`Unsupported game: ${game}`)
  const rows = await cfg.findWinner(weekStart, weekEnd)
  const row = rows?.[0]
  if (!row || row.score === null || row.score === undefined) return null
  return { userId: row.userId, username: row.username, score: Number(row.score) }
}
