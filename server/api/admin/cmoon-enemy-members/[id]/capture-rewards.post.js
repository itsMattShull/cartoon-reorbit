// server/api/admin/cmoon-enemy-members/[id]/capture-rewards.post.js — add ONE possible prize row
// to an enemy member's CAPTURE reward table (see CMoonEnemyCaptureReward's own schema comment) —
// a wholly separate pool from rewards.post.js's own CMoonEnemyReward table, rolled only on a
// successful "Throw Pokeball" capture, never on an ordinary win. Same add-row/remove-row shape
// (not a bulk replace) and the same generic parseRewardBody validation as that sibling endpoint.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseRewardBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const enemyMemberId = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId }, select: { id: true } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const body = await readBody(event)
  const parsed = parseRewardBody(body)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }
  const { rewardType, ctoonId, avatarId, backgroundId, packId } = parsed.data

  // parseRewardBody guarantees exactly the one id matching rewardType is set; confirm it's real.
  if (rewardType === 'CTOON') {
    const found = await db.ctoon.count({ where: { id: ctoonId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward cToon not found' })
  } else if (rewardType === 'AVATAR') {
    const found = await db.avatar.count({ where: { id: avatarId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward avatar not found' })
  } else if (rewardType === 'BACKGROUND') {
    const found = await db.background.count({ where: { id: backgroundId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward background not found' })
  } else if (rewardType === 'PACK') {
    const found = await db.pack.count({ where: { id: packId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward pack not found' })
  }

  let created
  try {
    created = await db.cMoonEnemyCaptureReward.create({ data: { enemyMemberId, ...parsed.data } })
  } catch (err) {
    // The member or the prize existed at the checks above but was deleted by another admin
    // request before this write landed — same race rewards.post.js's own P2003 catch covers.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'The enemy or the prize was deleted by another request — reload and try again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyCaptureReward',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, enemyMemberId, ...parsed.data },
  })

  return { id: created.id }
})
