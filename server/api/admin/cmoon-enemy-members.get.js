// server/api/admin/cmoon-enemy-members.get.js
// Flat list of every enemy member across all factions (filtered client-side), matching
// czone-effects.get.js's flat style rather than nesting under a faction id — members get their
// own list/filter view instead of being edited from inside a faction-specific subpage.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const members = await db.cMoonEnemyMember.findMany({
    orderBy: [{ factionId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      faction: { select: { id: true, name: true } },
      _count: { select: { rewards: true, battles: true } },
      // Each member's reward rows are included (not just counted) because the only way to remove
      // one is DELETE /cmoon-enemy-rewards/:rewardId — the admin UI needs the row ids, plus a
      // display name for whatever each row awards.
      rewards: {
        orderBy: { createdAt: 'asc' },
        include: {
          ctoon: { select: { id: true, name: true, assetPath: true } },
          avatar: { select: { id: true, label: true, imagePath: true } },
          background: { select: { id: true, label: true, imagePath: true } },
        },
      },
    },
  })

  return {
    members: members.map(m => ({
      id: m.id,
      factionId: m.factionId,
      faction: m.faction,
      name: m.name,
      imagePath: m.imagePath,
      maxHp: m.maxHp,
      battleMode: m.battleMode,
      currentHp: m.currentHp,
      cMoonPointsReward: m.cMoonPointsReward,
      active: m.active,
      defeatedAt: m.defeatedAt,
      sortOrder: m.sortOrder,
      rewardCount: m._count?.rewards ?? 0,
      battleCount: m._count?.battles ?? 0,
      // Mirrors the two server-side rules keyed off battle history (battle mode is locked, and
      // DELETE is refused in favour of deactivating), so the admin form can disable those
      // controls up front instead of waiting for the 400/409.
      hasBattles: (m._count?.battles ?? 0) > 0,
      rewards: m.rewards.map(r => ({
        id: r.id,
        rewardType: r.rewardType,
        ctoonId: r.ctoonId,
        avatarId: r.avatarId,
        backgroundId: r.backgroundId,
        dropChancePercent: r.dropChancePercent,
        quantity: r.quantity,
        ctoon: r.ctoon,
        avatar: r.avatar,
        background: r.background,
      })),
    })),
  }
})
