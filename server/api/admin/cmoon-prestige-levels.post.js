// server/api/admin/cmoon-prestige-levels.post.js — add one rung to the prestige ladder: "Prestige
// N needs this many points." See prisma/schema.prisma's CMoonPrestigeLevel comment.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parsePrestigeLevelBody } from '@/server/utils/cmoonPrestige'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parsePrestigeLevelBody(body)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })
  const { level, pointThreshold, title } = parsed

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
