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
  // column's own schema comment for why this is global, not per-faction/per-member. A raid boss
  // member is gated on personalSoloWinCount instead (see the `locked` check below) — same reason
  // loadEligibility/consider.post.js scope a raid boss's own gate to solo wins: a shared raid win
  // (one synthetic row per participant off a single kill) must not unlock a harder raid boss
  // faster than someone's own solo record would. Every other (non-raid-boss) member keeps this
  // combined count.
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

  // Personal summary strip at the top of the page — every number here is read off data this
  // endpoint (or a sibling query shaped exactly like its own existing ones) already touches, no
  // new tables and nothing cached between requests. favoriteEnemyId is just winTallies' own max
  // entry; the matching name is filled in below once the faction/member list is built, since
  // that's the one place this handler already has every member's name in hand.
  //
  // The headline Wins/Losses tiles are solo-only (raidId: null), with raid wins/losses shown as
  // their own fully independent tiles — NOT folded into one number. A raid credits one synthetic
  // row per PARTICIPANT for a single shared kill (see CMoonEnemyBattle.raidId's own schema
  // comment), so blending it into "your personal win count" would let how many raids you joined,
  // not how many fights you actually won, dominate your own stat strip.
  const [personalSoloWinCount, personalSoloLossCount, personalRaidWinCount, personalRaidLossCount] = await Promise.all([
    db.cMoonEnemyBattle.count({ where: { userId, outcome: 'WIN', raidId: null } }),
    db.cMoonEnemyBattle.count({ where: { userId, outcome: 'LOSS', raidId: null } }),
    db.cMoonEnemyBattle.count({ where: { userId, outcome: 'WIN', raidId: { not: null } } }),
    db.cMoonEnemyBattle.count({ where: { userId, outcome: 'LOSS', raidId: { not: null } } }),
  ])
  const favoriteTally = winTallies.length
    ? winTallies.reduce((best, t) => (t._count._all > best._count._all ? t : best))
    : null
  // Resolved against the active member list already being built below — a favorite from history
  // whose member an admin has since deactivated simply has no name to show, same "member list is
  // active-only" scope the rest of this endpoint already follows.
  const allMembers = factions.flatMap(f => f.members)
  const favoriteEnemyName = favoriteTally
    ? allMembers.find(m => m.id === favoriteTally.enemyMemberId)?.name || null
    : null

  // A short "hype feed" of recently-defeated SHARED_POOL community bosses, server-wide (not
  // scoped to this viewer) — reuses the exact same permanent CMoonEnemyBattle log the admin
  // battle-logs page already reads, just a tiny LIMIT 5 slice of it; nothing new is written or
  // cached anywhere for this.
  const recentCommunityKills = await db.cMoonEnemyBattle.findMany({
    where: { outcome: 'WIN', enemyMember: { battleMode: 'SHARED_POOL' } },
    orderBy: { endedAt: 'desc' },
    take: 5,
    select: { endedAt: true, user: { select: { username: true } }, enemyMember: { select: { name: true } } },
  })

  return {
    personalWinCount: personalSoloWinCount,
    personalLossCount: personalSoloLossCount,
    personalRaidWinCount,
    personalRaidLossCount,
    favoriteEnemy: favoriteEnemyName ? { name: favoriteEnemyName, wins: favoriteTally._count._all } : null,
    recentCommunityKills: recentCommunityKills.map(k => ({
      username: k.user?.username || 'Someone',
      enemyName: k.enemyMember?.name || '(deleted)',
      endedAt: k.endedAt,
    })),
    factions: factions.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      bannerImagePath: f.bannerImagePath,
      members: f.members.map(m => {
        // A raid boss's own gate is solo-only (see personalWinCount's own comment above) — every
        // other member keeps the combined count.
        const myWinCount = m.isRaidBoss ? personalSoloWinCount : personalWinCount
        const locked = myWinCount < m.minPriorDefeats
        if (locked) {
          const remaining = m.minPriorDefeats - myWinCount
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
          // Only meaningful for a SHARED_POOL member (a PER_PLAYER one has no server-wide "current"
          // HP to speak of — every player's own fight starts fresh). Already in hand from the same
          // faction/members query above (no `select` on it, so every column rides along) — nothing
          // extra queried for this. Drives the roster page's own "nearly defeated" enrage tag.
          currentHp: m.battleMode === 'SHARED_POOL' ? m.currentHp : null,
        }
      }),
    })),
  }
})
