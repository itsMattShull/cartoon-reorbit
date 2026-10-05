// server/api/admin/cmoon-riddles.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

// solvedByUserId/solvedByCMoonId are plain scalar columns with no Prisma relation (same "loose
// FK" convention as CMoonScoreLog.userId — see that model's own schema comment), so resolving
// them to a display name is an explicit batched lookup here rather than an `include`. The riddle
// list is always small (a handful of rows, ever), so two extra findMany calls beat raw SQL.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [riddles, enemyMembers, entries] = await Promise.all([
    db.cMoonRiddle.findMany({ orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }] }),
    // Only raid bosses can be BOSS_LORE-gated (see CMoonEnemyMember.isRaidBoss) — a non-raid-boss
    // member is never offered in the picker.
    db.cMoonEnemyMember.findMany({ where: { isRaidBoss: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.encyclopediaEntry.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
  ])

  const userIds = [...new Set(riddles.map(r => r.solvedByUserId).filter(Boolean))]
  const cMoonIds = [...new Set(riddles.map(r => r.solvedByCMoonId).filter(Boolean))]
  const [users, cmoons] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } }) : [],
    cMoonIds.length ? db.cMoon.findMany({ where: { id: { in: cMoonIds } }, select: { id: true, name: true } }) : [],
  ])
  const usernameById = new Map(users.map(u => [u.id, u.username]))
  const cMoonNameById = new Map(cmoons.map(c => [c.id, c.name]))
  const enemyNameById = new Map(enemyMembers.map(m => [m.id, m.name]))

  return {
    riddles: riddles.map(r => ({
      id: r.id,
      kind: r.kind,
      question: r.question,
      answer: r.answer,
      enemyMemberId: r.enemyMemberId,
      enemyMemberName: r.enemyMemberId ? (enemyNameById.get(r.enemyMemberId) || null) : null,
      encyclopediaEntryId: r.encyclopediaEntryId,
      active: r.active,
      postedAt: r.postedAt,
      solvedAt: r.solvedAt,
      solvedByUsername: r.solvedByUserId ? (usernameById.get(r.solvedByUserId) || null) : null,
      solvedByCMoonName: r.solvedByCMoonId ? (cMoonNameById.get(r.solvedByCMoonId) || null) : null,
      createdAt: r.createdAt,
    })),
    enemyMembers: enemyMembers.map(m => ({ id: m.id, name: m.name })),
    encyclopediaEntries: entries.map(e => ({ id: e.id, title: e.title })),
  }
})
