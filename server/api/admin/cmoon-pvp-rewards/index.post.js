// server/api/admin/cmoon-pvp-rewards/index.post.js — add ONE possible prize row to a cMoon PvP
// reward context (MATCH_WIN/MATCH_PARTICIPATION/TOURNAMENT_WINNER/TOURNAMENT_PARTICIPATION — see
// CMoonPvpRewardContext's own schema comment). Same add/remove-individual-row shape as
// cmoon-enemy-members/[id]/rewards.post.js (reused verbatim via parseRewardBody, since the row
// shape is byte-identical to CMoonEnemyReward) — a bulk replace doesn't buy anything here either,
// for the same reasons that file's own header comment gives.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseRewardBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const VALID_CONTEXTS = ['MATCH_WIN', 'MATCH_PARTICIPATION', 'TOURNAMENT_WINNER', 'TOURNAMENT_PARTICIPATION']

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const context = typeof body?.context === 'string' ? body.context.trim() : ''
  if (!VALID_CONTEXTS.includes(context)) {
    throw createError({ statusCode: 400, statusMessage: `context must be one of ${VALID_CONTEXTS.join(', ')}` })
  }

  const parsed = parseRewardBody(body)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }
  const { rewardType, ctoonId, avatarId, backgroundId, packId } = parsed.data

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

  const created = await db.cMoonPvpReward.create({ data: { context, ...parsed.data } })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonPvpReward',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, context, ...parsed.data },
  })

  return { id: created.id }
})
