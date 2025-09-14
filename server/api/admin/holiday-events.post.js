// /api/admin/holiday-events.post.js
// Create a HolidayEvent with items and pool entries.

import { defineEventHandler, readBody, createError } from 'h3'
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

  const body = await readBody(event) || {}
  const {
    name,
    startsAt,
    endsAt,
    minRevealAt = null,
    items = [],                 // [{ ctoonId }]
    poolEntries = []            // [{ ctoonId, probabilityPercent }]
  } = body

  // ── Validate basics ─────────────────────────────────────────
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

  // Items optional but often required in UX. Enforce non-empty pool.
  if (!Array.isArray(poolEntries) || poolEntries.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one pool entry is required' })
  }
  if (!Array.isArray(items)) {
    throw createError({ statusCode: 400, statusMessage: 'items must be an array' })
  }

  // ── Normalize and validate pool weights ─────────────────────
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

  // ── Check duplicates ────────────────────────────────────────
  const itemIds = items.map(i => String(i.ctoonId)).filter(Boolean)
  const poolIds = normPool.map(p => p.ctoonId)
  const dupItem = new Set(itemIds).size !== itemIds.length
  const dupPool = new Set(poolIds).size !== poolIds.length
  if (dupItem) throw createError({ statusCode: 400, statusMessage: 'Duplicate cToon in items' })
  if (dupPool) throw createError({ statusCode: 400, statusMessage: 'Duplicate cToon in pool' })

  // Optional: prevent the same cToon being both item and pool
  const overlap = itemIds.find(id => poolIds.includes(id))
  if (overlap) {
    throw createError({ statusCode: 400, statusMessage: 'A cToon cannot be in both items and pool' })
  }

  // ── Verify cToon IDs exist ──────────────────────────────────
  const allIds = Array.from(new Set([...itemIds, ...poolIds]))
  const found = await prisma.ctoon.findMany({
    where: { id: { in: allIds } },
    select: { id: true }
  })
  const foundSet = new Set(found.map(x => x.id))
  const missing = allIds.filter(id => !foundSet.has(id))
  if (missing.length) {
    throw createError({ statusCode: 400, statusMessage: `Unknown cToon id(s): ${missing.join(', ')}` })
  }

  // ── Create in a transaction ─────────────────────────────────
  try {
    const created = await prisma.$transaction(async (tx) => {
      const ev = await tx.holidayEvent.create({
        data: {
          name: name.trim(),
          startsAt: starts,
          endsAt: ends,
          minRevealAt: minReveal
        }
      })

      if (itemIds.length) {
        await tx.holidayEventItem.createMany({
          data: itemIds.map(ctoonId => ({ eventId: ev.id, ctoonId })),
          skipDuplicates: true
        })
      }

      await tx.holidayEventPool.createMany({
        data: normPool.map(p => ({
          eventId: ev.id,
          ctoonId: p.ctoonId,
          probabilityPercent: p.probabilityPercent
        }))
      })

      // return full event
      return tx.holidayEvent.findUnique({
        where: { id: ev.id },
        include: {
          _count: { select: { items: true, poolEntries: true } },
          items: { include: { ctoon: true } },
          poolEntries: { include: { ctoon: true } }
        }
      })
    })

    // 201 Created
    event.node.res.statusCode = 201
    return created
  } catch (err) {
    // Unique name constraint
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Event name already exists' })
    }
    console.error('[POST /api/admin/holiday-events]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
