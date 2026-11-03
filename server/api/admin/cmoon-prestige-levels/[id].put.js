// server/api/admin/cmoon-prestige-levels/[id].put.js — edit a prestige ladder rung.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parsePrestigeLevelBody } from '@/server/utils/cmoonPrestige'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const level = await db.cMoonPrestigeLevel.findUnique({ where: { id } })
  if (!level) throw createError({ statusCode: 404, statusMessage: 'Prestige level not found' })

  const body = await readBody(event)
  const parsed = parsePrestigeLevelBody(body, level)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })
  const { level: newLevel, pointThreshold, title } = parsed

  try {
    await db.cMoonPrestigeLevel.update({ where: { id }, data: { level: newLevel, pointThreshold, title } })
  } catch (err) {
    if (err?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: `Prestige level ${newLevel} already exists` })
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPrestigeLevel', key: `update:${id}`,
    prevValue: { level: level.level, pointThreshold: level.pointThreshold, title: level.title },
    newValue: { level: newLevel, pointThreshold, title },
  })

  return { ok: true }
})
