// server/api/admin/cmart-metrics.post.js
// Saves the per-rarity percentages used by "Standardize Metric in cMart" — same validate/persist/
// log shape as server/api/admin/rarity-defaults.post.js.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { STANDARDIZABLE_RARITIES } from '@/server/utils/cmartStandardizedMetrics'

const MIN_PERCENT = 1
const MAX_PERCENT = 1000 // guards against a typo (e.g. an extra zero) minting an absurd quantity

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const { percentages } = body || {}
  if (!percentages || typeof percentages !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid percentages payload' })
  }

  const next = {}
  for (const rarity of STANDARDIZABLE_RARITIES) {
    const value = Number(percentages[rarity])
    if (!Number.isFinite(value) || value < MIN_PERCENT || value > MAX_PERCENT) {
      throw createError({
        statusCode: 400,
        statusMessage: `${rarity} percentage must be a number between ${MIN_PERCENT} and ${MAX_PERCENT}.`
      })
    }
    next[rarity] = value
  }

  const before = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 250, cmartStandardizedMetrics: next },
    update: { cmartStandardizedMetrics: next }
  })

  try {
    const prev = before?.cmartStandardizedMetrics ?? null
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      await logAdminChange(prisma, {
        userId: me.id,
        area: 'GlobalGameConfig',
        key: 'cmartStandardizedMetrics',
        prevValue: prev,
        newValue: next
      })
    }
  } catch {}

  return { success: true, percentages: next }
})
