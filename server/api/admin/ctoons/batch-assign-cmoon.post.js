// server/api/admin/ctoons/batch-assign-cmoon.post.js
// Assigns (or clears) one cMoon across an entire batch of cToons in a single
// updateMany — used by the "Batch Assign cMoon" admin tool to set a whole
// series/set to one cMoon without editing each cToon individually.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange, MAX_AUDIT_CTOONS } from '@/server/utils/adminChangeLog'

const MAX_BATCH_SIZE = 5000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)

  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.map(id => String(id || '').trim()).filter(Boolean))]
    : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No cToon ids provided.' })
  if (ids.length > MAX_BATCH_SIZE) {
    throw createError({ statusCode: 400, statusMessage: `Too many cToons in one batch (max ${MAX_BATCH_SIZE}).` })
  }

  const raw = body?.cMoonId
  const cMoonId = raw && String(raw).trim() ? String(raw).trim() : null

  let cMoon = null
  if (cMoonId) {
    cMoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true } })
    if (!cMoon) throw createError({ statusCode: 400, statusMessage: 'Selected cMoon does not exist.' })
  }

  const before = await prisma.ctoon.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, cMoonId: true }
  })
  if (!before.length) return { success: true, count: 0, matchedCount: 0, requestedCount: ids.length }

  const matchedIds = before.map(c => c.id)
  const { count } = await prisma.ctoon.updateMany({
    where: { id: { in: matchedIds } },
    data: { cMoonId }
  })

  const prevCounts = {}
  for (const c of before) {
    const key = c.cMoonId || '(none)'
    prevCounts[key] = (prevCounts[key] || 0) + 1
  }

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Ctoon:batchCMoon',
    key: 'cMoonId',
    prevValue: {
      totalCtoons: before.length,
      byPreviousCMoonId: prevCounts,
      ctoons: before.slice(0, MAX_AUDIT_CTOONS).map(c => ({ id: c.id, name: c.name })),
      ctoonsTruncated: before.length > MAX_AUDIT_CTOONS
    },
    newValue: { cMoonId, cMoonName: cMoon?.name || null }
  })

  return { success: true, count, matchedCount: before.length, requestedCount: ids.length, cMoonId, cMoonName: cMoon?.name || null }
})
