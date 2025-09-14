// /api/admin/holiday-events/[id].put.js
// Update a HolidayEvent (basic fields, items, pool entries).

import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { prisma } from '@/server/prisma'

async function assertAdmin (event) {
  const user = event.context.user
  if (!user?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}
function asDate(v, label) {
  const d = new Date(v)
  if (!v || isNaN(d.getTime())) throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  return d
}

export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event) || {}
  const {
    name,
    startsAt,
    endsAt,
    minRevealAt = null,
    items = [],                 // [{ ctoonId }]
    poolEntries = []            // [{ ctoonId, probabilityPercent }]
  } = body

  // Validate
  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  const starts = asDate(startsAt, 'startsAt')
  const ends   = asDate(endsAt, 'endsAt')
  if (!(starts.getTime() < ends.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'startsAt must be before endsAt' })
  }
  let minReveal = null
  if (minRevealAt) {
    minReveal = asDate(minRevealAt, 'minRevealAt')
    if (minReveal.getTime() < starts.getTime()) {
      throw createError({ statusCode: 400, statusMessage: 'minRevealAt must be ≥ startsAt' })
    }
  }
  if (!Array.isArray(items)) {
    throw createError({ statusCode: 400, statusMessage: 'items must be an array' })
  }
  if (!Array.isArray(poolEntries) || poolEntries.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one pool entry is required' })
  }

  const normPool = poolEntries.map(p => ({
    ctoonId: String(p.ctoonId),
    probabilityPercent: Number.isFinite(Number(p.probabilityPercent)) ? Math.trunc(Number(p.probabilityPercent)) : NaN
  }))
  if (normPool.some(p => !p.ctoonId || isNaN(p.probabilityPercent) || p.probabilityPercent < 0 || p.probabilityPercent > 100)) {
    throw createError({ statusCode: 400, statusMessage: 'Each pool entry needs ctoonId and 0–100 probabilityPercent' })
  }
  const poolSum = normPool.reduce((s, p) => s + p.probabilityPercent, 0)
  if (poolSum !== 100) {
    throw createError({ statusCode: 400, statusMessage: `Pool probabilities must total 100%. Current total: ${poolSum}` })
  }

  const itemIds = items.map(i => String(i.ctoonId)).filter(Boolean)
  const poolIds = normPool.map(p => p.ctoonId)
  if (new Set(itemIds).size !== itemIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Duplicate cToon in items' })
  }
  if (new Set(poolIds).size !== poolIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Duplicate cToon in pool' })
  }
  const overlap = itemIds.find(x => poolIds.includes(x))
  if (overlap) {
    throw createError({ statusCode: 400, statusMessage: 'A cToon cannot be in both items and pool' })
  }

  // Verify IDs exist
  const allIds = Array.from(new Set([...itemIds, ...poolIds]))
  if (allIds.length) {
    const found = await prisma.ctoon.findMany({ where: { id: { in: allIds } }, select: { id: true } })
    const foundSet = new Set(found.map(x => x.id))
    const missing = allIds.filter(x => !foundSet.has(x))
    if (missing.length) {
      throw createError({ statusCode: 400, statusMessage: `Unknown cToon id(s): ${missing.join(', ')}` })
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const exists = await tx.holidayEvent.findUnique({ where: { id }, select: { id: true } })
      if (!exists) throw createError({ statusCode: 404, statusMessage: 'Holiday event not found' })

      await tx.holidayEvent.update({
        where: { id },
        data: {
          name: name.trim(),
          startsAt: starts,
          endsAt: ends,
          minRevealAt: minReveal
        }
      })

      // Replace items and pool
      await tx.holidayEventItem.deleteMany({ where: { eventId: id } })
      await tx.holidayEventPool.deleteMany({ where: { eventId: id } })

      if (itemIds.length) {
        await tx.holidayEventItem.createMany({
          data: itemIds.map(ctoonId => ({ eventId: id, ctoonId })),
          skipDuplicates: true
        })
      }
      await tx.holidayEventPool.createMany({
        data: normPool.map(p => ({ eventId: id, ctoonId: p.ctoonId, probabilityPercent: p.probabilityPercent }))
      })

      return tx.holidayEvent.findUnique({
        where: { id },
        include: {
          _count: { select: { items: true, poolEntries: true } },
          items: { include: { ctoon: true } },
          poolEntries: { include: { ctoon: true } }
        }
      })
    })

    return updated
  } catch (err) {
    if (err?.statusCode) throw err
    if (err?.code === 'P2002') {
      // unique constraint (event name)
      throw createError({ statusCode: 409, statusMessage: 'Event name already exists' })
    }
    console.error('[PUT /api/admin/holiday-events/:id]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
