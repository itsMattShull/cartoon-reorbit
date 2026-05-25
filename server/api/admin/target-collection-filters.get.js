// server/api/admin/target-collection-filters.get.js
// Returns distinct filter-option values (sets, series, rarities) for a
// target user's tradeable collection (admin-only, for the initiate-trade page).
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { username } = getQuery(event)
  if (!username?.trim()) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  const targetUser = await prisma.user.findUnique({
    where: { username: username.trim() },
    select: { id: true }
  })
  if (!targetUser) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const rows = await prisma.userCtoon.findMany({
    where: { userId: targetUser.id, burnedAt: null, isTradeable: true },
    select: { ctoon: { select: { set: true, series: true, rarity: true } } }
  })

  const PRIORITY_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
  const allSets     = [...new Set(rows.map(r => r.ctoon.set?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const allSeries   = [...new Set(rows.map(r => r.ctoon.series?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const allRarities = [...new Set(rows.map(r => r.ctoon.rarity?.trim()).filter(Boolean))]
  const inPriority  = PRIORITY_RARITIES.filter(r => allRarities.includes(r))
  const extras      = allRarities.filter(r => !PRIORITY_RARITIES.includes(r)).sort()

  return {
    sets:          ['All', ...allSets],
    seriesOptions: ['All', ...allSeries],
    rarities:      ['All', ...inPriority, ...extras]
  }
})
