// server/api/collections/meta.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Require authentication
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Fetch unique filter values in parallel, ordering sets & series alphabetically
  const [sets, series, rawRarities] = await Promise.all([
    prisma.ctoon.groupBy({
      by: ['set'],
      orderBy: { set: 'asc' }
    }).then(groups => groups.map(g => g.set)),

    prisma.ctoon.groupBy({
      by: ['series'],
      orderBy: { series: 'asc' }
    }).then(groups => groups.map(g => g.series)),

    // just grab all distinct rarities
    prisma.ctoon.groupBy({
      by: ['rarity']
    }).then(groups => groups.map(g => g.rarity)),
  ])

  // 3. Apply custom ordering for rarities
  const priorityOrder = [
    'Common',
    'Uncommon',
    'Rare',
    'Very Rare',
    'Crazy Rare'
  ]

  const rarities = [
    // first, any of the priority ones that actually exist
    ...priorityOrder.filter(r => rawRarities.includes(r)),
    // then any others (not in the priority list), sorted A→Z
    ...rawRarities
      .filter(r => !priorityOrder.includes(r))
      .sort((a, b) => a.localeCompare(b))
  ]

  // 4. Return as JSON
  return { sets, series, rarities }
})
