// server/api/leaderboard/cmoon-enemies.get.js
// Three boards for the Leaderboards page's cMoons tab:
//   - players.allTime / players.weekly: top 10 individual players by total enemy HP defeated,
//     all-time and over a rolling trailing 7 days (same "weekly" window convention the per-game
//     leaderboards already use, e.g. server/api/game/tower/leaderboard.get.js's own
//     `NOW() - INTERVAL '7 days'`) — NOT season-scoped, unlike the enemiesDefeatedGoal bar on the
//     nav page (see server/utils/cmoonSeason.js's own comment on why THAT one resets)
//   - cmoons: every unlocked cMoon's all-time total (parallels leaderboard/cmoons.get.js's own
//     "unlocked only" filter) — still a plain kill count, see below for why that's fine here
// Every CMoonEnemyBattle row with outcome = 'WIN' is one credited defeat — including a raid
// boss's synthetic per-participant rows (one per credited player, see that column's own schema
// comment) — split into "regular enemy" vs "raid boss" by raidId being null vs set, rather than
// joining to CMoonEnemyMember.isRaidBoss: a raid-synthetic row's raidId is set precisely because
// it came from a raid, so it's already the correct discriminator with no join needed.
//
// Deliberately NOT a combined "total" ranking/headline: a raid win mints one credited row PER
// PARTICIPANT (so one shared kill from an 8-person raid outcounts 8 real solo kills if folded
// into the same number), and a "Top Enemy Slayers"/"Enemies Defeated" board that let raid
// participation inflate the rank would stop measuring what it says it measures. Every board ranks
// and headlines on the solo-only metric alone; raidBossesDefeated is its own fully independent
// count, shown but never folded into the rank.
//
// The PLAYERS boards rank by SUM(enemyMaxHp), NOT a plain win COUNT — a raw kill count rewards
// "goon farming" (repeatedly beating the cheapest, lowest-HP enemy available) exactly as much as
// taking on a cMoon's toughest fights, which defeats the point of a "Top Enemy Slayers" ranking.
// See CMoonEnemyBattle.enemyMaxHp's own schema comment. enemiesDefeated (the plain win count) is
// still returned for display context, just no longer what decides placement. The CMOONS (team)
// board is deliberately left as a plain count: it measures team participation/activity, not an
// individual's placement on a competitive ranking, so there's nothing here for a player to "farm"
// their way to the top of by picking easy fights over hard ones.
import { defineEventHandler } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const TOP_PLAYERS_LIMIT = 10

// Same named-individuals filter server/api/cmoon/[id].get.js's "Top Point Contributors" uses — a
// public leaderboard of named players, unlike a team average's denominator, so a banned/inactive/
// system account dropping off is the correct behavior here. `windowClause` is a Prisma.sql
// fragment (Prisma.empty for all-time, or a rolling-window bound for weekly) spliced into the
// WHERE clause — see server/utils/economyFilters.js's own Prisma.sql/Prisma.empty convention.
function topEnemySlayers(windowClause) {
  return db.$queryRaw`
    SELECT
      b."userId", u."username", u."avatar",
      COUNT(*) FILTER (WHERE b."raidId" IS NULL)::int AS "enemiesDefeated",
      COALESCE(SUM(b."enemyMaxHp") FILTER (WHERE b."raidId" IS NULL), 0)::int AS "enemyHpDefeated",
      COUNT(*) FILTER (WHERE b."raidId" IS NOT NULL)::int AS "raidBossesDefeated"
    FROM "CMoonEnemyBattle" b
    JOIN "User" u ON u."id" = b."userId"
    WHERE b."outcome" = 'WIN'
      AND u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
      ${windowClause}
    GROUP BY b."userId", u."username", u."avatar"
    HAVING COALESCE(SUM(b."enemyMaxHp") FILTER (WHERE b."raidId" IS NULL), 0) > 0
    ORDER BY "enemyHpDefeated" DESC, u."username" ASC
    LIMIT ${TOP_PLAYERS_LIMIT}
  `
}

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { players: { allTime: [], weekly: [] }, cmoons: [] }

  const [allTimeRows, weeklyRows, cmoonRows] = await Promise.all([
    topEnemySlayers(Prisma.empty),
    // Rolling trailing 7 days, same convention as the per-game "This Week" boards.
    topEnemySlayers(Prisma.sql`AND b."endedAt" >= NOW() - INTERVAL '7 days'`),
    // LEFT JOIN, not INNER — an unlocked cMoon with zero wins still belongs on this board, at 0,
    // same as it still gets a row on the team-standings leaderboard.
    db.$queryRaw`
      SELECT
        c."id", c."name", c."color",
        COUNT(b."id") FILTER (WHERE b."raidId" IS NULL)::int AS "enemiesDefeated",
        COUNT(b."id") FILTER (WHERE b."raidId" IS NOT NULL)::int AS "raidBossesDefeated"
      FROM "CMoon" c
      LEFT JOIN "CMoonEnemyBattle" b ON b."cMoonId" = c."id" AND b."outcome" = 'WIN'
      WHERE c."joinLocked" = false
      GROUP BY c."id", c."name", c."color"
      ORDER BY "enemiesDefeated" DESC, c."name" ASC
    `,
  ])

  return {
    players: {
      allTime: allTimeRows.map((r, i) => ({ ...r, rank: i + 1 })),
      weekly: weeklyRows.map((r, i) => ({ ...r, rank: i + 1 })),
    },
    cmoons: cmoonRows.map((r, i) => ({ ...r, rank: i + 1 })),
  }
})
