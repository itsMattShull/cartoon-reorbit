// server/api/admin/dissolve-featured-config.get.js
// Powers the "Edit Featured" modal on /admin/dissolve-queue: returns the
// currently-selected rarities/series/sets plus the full option lists to
// render as checkboxes.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getFeaturedDissolveConfig } from '@/server/utils/featuredDissolveConfig'

// Matches the static rarity list used elsewhere in admin (addCtoon.vue, auctions.vue, etc).
const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const [selected, seriesRows, setRows] = await Promise.all([
    getFeaturedDissolveConfig(),
    prisma.ctoon.findMany({ where: { series: { not: null } }, distinct: ['series'], select: { series: true }, orderBy: { series: 'asc' } }),
    prisma.ctoon.findMany({ where: { set: { not: null } }, distinct: ['set'], select: { set: true }, orderBy: { set: 'asc' } }),
  ])

  return {
    selected,
    options: {
      rarities: RARITY_OPTIONS,
      series: seriesRows.map(r => r.series).filter(Boolean),
      sets: setRows.map(r => r.set).filter(Boolean),
    }
  }
})
