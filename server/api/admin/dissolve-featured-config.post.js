// server/api/admin/dissolve-featured-config.post.js
// Saves the "Edit Featured" rule set (rarities/series/sets that make a
// dissolved cToon featured) and retroactively re-evaluates every entry
// currently sitting in the dissolve queue — scheduled or not — since none of
// them are live auctions yet.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isCtoonFeatured } from '@/server/utils/featuredDissolveConfig'

function sanitizeList(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const out = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event) || {}
  const rarities = sanitizeList(body.rarities)
  const series   = sanitizeList(body.series)
  const sets     = sanitizeList(body.sets)

  const before = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { featuredDissolveRarities: true, featuredDissolveSeries: true, featuredDissolveSets: true }
  })

  const result = await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', featuredDissolveRarities: rarities, featuredDissolveSeries: series, featuredDissolveSets: sets },
    update: { featuredDissolveRarities: rarities, featuredDissolveSeries: series, featuredDissolveSets: sets },
  })

  for (const [key, prevVal, nextVal] of [
    ['featuredDissolveRarities', before?.featuredDissolveRarities, result.featuredDissolveRarities],
    ['featuredDissolveSeries',   before?.featuredDissolveSeries,   result.featuredDissolveSeries],
    ['featuredDissolveSets',     before?.featuredDissolveSets,     result.featuredDissolveSets],
  ]) {
    if (JSON.stringify(prevVal ?? []) !== JSON.stringify(nextVal ?? [])) {
      await logAdminChange(prisma, { userId: me.id, area: 'GlobalGameConfig', key, prevValue: prevVal, newValue: nextVal })
    }
  }

  // Retroactively re-evaluate every queue entry (scheduled or not — neither
  // is a live auction yet) against the new rule set.
  const config = { rarities, series, sets }
  const entries = await prisma.dissolveAuctionQueue.findMany({
    select: {
      id: true,
      category: true,
      isFeatured: true,
      userCtoon: { select: { ctoon: { select: { rarity: true, series: true, set: true } } } }
    }
  })

  let updated = 0
  for (const entry of entries) {
    const nextFeatured = isCtoonFeatured(entry.userCtoon?.ctoon, config)
    const nextCategory = nextFeatured ? 'FEATURED' : 'OTHER'
    if (nextFeatured === entry.isFeatured && nextCategory === entry.category) continue

    // Race-safe: a matching `id` in the where-clause means this no-ops
    // instead of throwing if the launch worker deleted the row concurrently.
    const { count } = await prisma.dissolveAuctionQueue.updateMany({
      where: { id: entry.id },
      data:  { isFeatured: nextFeatured, category: nextCategory }
    })
    updated += count
  }

  return { rarities, series, sets, reevaluated: entries.length, updated }
})
