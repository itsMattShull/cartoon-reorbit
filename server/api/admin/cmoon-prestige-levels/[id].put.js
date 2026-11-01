// server/api/admin/cmoon-prestige-levels/[id].put.js — edit a prestige ladder rung.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { PRESTIGE_LEVEL_MIN, PRESTIGE_LEVEL_MAX, PRESTIGE_THRESHOLD_MAX } from '@/server/utils/cmoonPrestige'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const level = await db.cMoonPrestigeLevel.findUnique({ where: { id } })
  if (!level) throw createError({ statusCode: 404, statusMessage: 'Prestige level not found' })

  const body = await readBody(event)
  const newLevel = body?.level === undefined ? level.level : Math.trunc(Number(body.level))
  const pointThreshold = body?.pointThreshold === undefined ? level.pointThreshold : Math.trunc(Number(body.pointThreshold))
  const title = body?.title === undefined ? level.title : (typeof body.title === 'string' ? body.title.trim().slice(0, 60) || null : null)

  if (!Number.isInteger(newLevel) || newLevel < PRESTIGE_LEVEL_MIN || newLevel > PRESTIGE_LEVEL_MAX) {
    throw createError({ statusCode: 400, statusMessage: `Level must be a whole number between ${PRESTIGE_LEVEL_MIN} and ${PRESTIGE_LEVEL_MAX}` })
  }
  if (!Number.isInteger(pointThreshold) || pointThreshold < 0 || pointThreshold > PRESTIGE_THRESHOLD_MAX) {
    throw createError({ statusCode: 400, statusMessage: 'Point threshold must be a non-negative whole number' })
  }

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
