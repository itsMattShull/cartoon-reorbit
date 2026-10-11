// server/api/leaderboard/cmoon-enemies.get.js
// Two all-time (not season-scoped — unlike the enemiesDefeatedGoal bar on the nav page, see
// server/utils/cmoonSeason.js's own comment on why THAT one resets) "enemies defeated" boards
// for the Leaderboards page's cMoons tab:
//   - players: top 10 individual players by total enemies defeated
//   - cmoons: every unlocked cMoon's all-time total (parallels leaderboard/cmoons.get.js's own
//     "unlocked only" filter)
// Every CMoonEnemyBattle row with outcome = 'WIN' is one credited defeat — including a raid
// boss's synthetic per-participant rows (one per credited player, see that column's own schema
// comment) — split into "regular enemy" vs "raid boss" by raidId being null vs set, rather than
// joining to CMoonEnemyMember.isRaidBoss: a raid-synthetic row's raidId is set precisely because
// it came from a raid, so it's already the correct discriminator with no join needed.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const TOP_PLAYERS_LIMIT = 10

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { players: [], cmoons: [] }

  const [playerRows, cmoonRows] = await Promise.all([
    // Same named-individuals filter server/api/cmoon/[id].get.js's "Top Point Contributors"
    // uses — a public leaderboard of named players, unlike a team average's denominator, so a
    // banned/inactive/system account dropping off is the correct behavior here.
    db.$queryRaw`
      SELECT
        b."userId", u."username", u."avatar",
        COUNT(*) FILTER (WHERE b."raidId" IS NULL)::int AS "enemiesDefeated",
        COUNT(*) FILTER (WHERE b."raidId" IS NOT NULL)::int AS "raidBossesDefeated",
        COUNT(*)::int AS "total"
      FROM "CMoonEnemyBattle" b
      JOIN "User" u ON u."id" = b."userId"
      WHERE b."outcome" = 'WIN'
        AND u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
      GROUP BY b."userId", u."username", u."avatar"
      ORDER BY "total" DESC, u."username" ASC
      LIMIT ${TOP_PLAYERS_LIMIT}
    `,
    // LEFT JOIN, not INNER — an unlocked cMoon with zero wins still belongs on this board, at 0,
    // same as it still gets a row on the team-standings leaderboard.
    db.$queryRaw`
      SELECT
        c."id", c."name", c."color",
        COUNT(b."id") FILTER (WHERE b."raidId" IS NULL)::int AS "enemiesDefeated",
        COUNT(b."id") FILTER (WHERE b."raidId" IS NOT NULL)::int AS "raidBossesDefeated",
        COUNT(b."id")::int AS "total"
      FROM "CMoon" c
      LEFT JOIN "CMoonEnemyBattle" b ON b."cMoonId" = c."id" AND b."outcome" = 'WIN'
      WHERE c."joinLocked" = false
      GROUP BY c."id", c."name", c."color"
      ORDER BY "total" DESC, c."name" ASC
    `,
  ])

  return {
    players: playerRows.map((r, i) => ({ ...r, rank: i + 1 })),
    cmoons: cmoonRows.map((r, i) => ({ ...r, rank: i + 1 })),
  }
})
