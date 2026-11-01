// server/api/admin/cmoon-prestige-levels.post.js — add one rung to the prestige ladder: "Prestige
// N needs this many points." See prisma/schema.prisma's CMoonPrestigeLevel comment.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { PRESTIGE_LEVEL_MIN, PRESTIGE_LEVEL_MAX, PRESTIGE_THRESHOLD_MAX } from '@/server/utils/cmoonPrestige'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const level = Number.isFinite(Number(body?.level)) ? Math.trunc(Number(body.level)) : NaN
  const pointThreshold = Number.isFinite(Number(body?.pointThreshold)) ? Math.trunc(Number(body.pointThreshold)) : NaN
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 60) || null : null

  if (!Number.isInteger(level) || level < PRESTIGE_LEVEL_MIN || level > PRESTIGE_LEVEL_MAX) {
    throw createError({ statusCode: 400, statusMessage: `Level must be a whole number between ${PRESTIGE_LEVEL_MIN} and ${PRESTIGE_LEVEL_MAX}` })
  }
  if (!Number.isInteger(pointThreshold) || pointThreshold < 0 || pointThreshold > PRESTIGE_THRESHOLD_MAX) {
    throw createError({ statusCode: 400, statusMessage: 'Point threshold must be a non-negative whole number' })
  }

  let created
  try {
    created = await db.cMoonPrestigeLevel.create({ data: { level, pointThreshold, title } })
  } catch (err) {
    if (err?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: `Prestige level ${level} already exists` })
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonPrestigeLevel', key: `create:${created.id}`, prevValue: null, newValue: { level, pointThreshold, title } })

  return { id: created.id }
})
