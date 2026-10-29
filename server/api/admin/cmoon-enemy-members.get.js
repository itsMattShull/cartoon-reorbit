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
      // Each member's wind-up/telegraph moves — same "include the full rows, not just a count"
      // shape as rewards above, since the only way to remove one is its own DELETE endpoint and
      // the admin UI needs the row ids.
      windUpMoves: { orderBy: { createdAt: 'asc' } },
      // This member's own unique taunts (CMoonEnemyMemberTaunt) — same shape as the faction's own
      // shared taunt pool (factions.get.js's own `taunts` include), just scoped to one member.
      taunts: { orderBy: [{ trigger: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
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
      rank: m.rank,
      minPriorDefeats: m.minPriorDefeats,
      occurrencePercent: m.occurrencePercent,
      currentHp: m.currentHp,
      cMoonPointsReward: m.cMoonPointsReward,
      critChanceAgainstPercent: m.critChanceAgainstPercent,
      critChanceFromPercent: m.critChanceFromPercent,
      attackChancePercent: m.attackChancePercent,
      pityThreshold: m.pityThreshold,
      firstWinBonusPoints: m.firstWinBonusPoints,
      appearSoundPath: m.appearSoundPath,
      damageTakenSoundPath: m.damageTakenSoundPath,
      damageAvoidedSoundPath: m.damageAvoidedSoundPath,
      attackingSoundPath: m.attackingSoundPath,
      victorySoundPath: m.victorySoundPath,
      defeatSoundPath: m.defeatSoundPath,
      active: m.active,
      isRaidBoss: m.isRaidBoss,
      raidAnnouncementText: m.raidAnnouncementText,
      raidOneTime: m.raidOneTime,
      raidCooldownMinutes: m.raidCooldownMinutes,
      maxParticipants: m.maxParticipants,
      windUpEnabled: m.windUpEnabled,
      raidDefeatedAt: m.raidDefeatedAt,
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
      windUpMoves: m.windUpMoves.map(w => ({
        id: w.id,
        telegraphMessage: w.telegraphMessage,
        direction: w.direction,
        occurrencePercent: w.occurrencePercent,
        bonusType: w.bonusType,
        bonusAmount: w.bonusAmount,
      })),
      taunts: m.taunts.map(t => ({
        id: t.id, trigger: t.trigger, text: t.text, soundPath: t.soundPath, active: t.active, sortOrder: t.sortOrder,
      })),
    })),
  }
})
