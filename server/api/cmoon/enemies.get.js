// server/api/cmoon/enemies.get.js
// Backs the player-facing enemy roster/compendium page (pages/newsite/cmoon-enemies.vue) — a
// browsable "who's out there" list grouped by faction, gated per-viewer by the same
// minPriorDefeats lock consider.post.js's own candidate query already enforces (see that column's
// own schema comment), so this never reveals more than the ordinary popup roll would eventually
// offer anyway. A locked member's name/art/stats are withheld entirely, not just hidden
// client-side — only its rank tier and the unlock requirement are sent — so there's nothing to
// spoil by poking the network tab before it's actually unlocked.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Same lifetime-win-count gate consider.post.js reads minPriorDefeats against — see that
  // column's own schema comment for why this is global, not per-faction/per-member.
  const personalWinCount = await db.cMoonEnemyBattle.count({ where: { userId, outcome: 'WIN' } })

  const factions = await db.cMoonEnemyFaction.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      members: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  // One grouped query for every member's personal win tally, not a per-member count() loop — same
  // "single grouped query" discipline server/api/admin/cmoons.get.js's own _count usage follows.
  const winTallies = await db.cMoonEnemyBattle.groupBy({
    by: ['enemyMemberId'],
    where: { userId, outcome: 'WIN' },
    _count: { _all: true },
  })
  const winsByMember = new Map(winTallies.map(t => [t.enemyMemberId, t._count._all]))

  return {
    personalWinCount,
    factions: factions.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      bannerImagePath: f.bannerImagePath,
      members: f.members.map(m => {
        const locked = personalWinCount < m.minPriorDefeats
        if (locked) {
          const remaining = m.minPriorDefeats - personalWinCount
          return {
            id: m.id,
            locked: true,
            rank: m.rank,
            unlockRequirement: `Defeat ${remaining} more enem${remaining === 1 ? 'y' : 'ies'} to unlock`,
          }
        }
        // "defeated" means two different things depending on battleMode, both worth surfacing as
        // a single checkmark: for a SHARED_POOL member it's server-wide ("is this community boss
        // currently down right now", mirroring defeatedAt's own schema comment) — for a
        // PER_PLAYER member there's no shared state to read, so it falls back to "has this VIEWER
        // personally ever beaten it at least once".
        const defeated = m.battleMode === 'SHARED_POOL' ? !!m.defeatedAt : (winsByMember.get(m.id) || 0) > 0
        return {
          id: m.id,
          locked: false,
          name: m.name,
          imagePath: m.imagePath,
          rank: m.rank,
          isRaidBoss: m.isRaidBoss,
          battleMode: m.battleMode,
          maxHp: m.maxHp,
          cMoonPointsReward: m.cMoonPointsReward,
          timesDefeated: winsByMember.get(m.id) || 0,
          defeated,
        }
      }),
    })),
  }
})
