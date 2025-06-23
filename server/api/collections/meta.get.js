// server/api/collections/meta.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Require authentication
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    // this will throw if not authenticated
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Fetch unique filter values in parallel
  const [sets, series, rarities] = await Promise.all([
    prisma.ctoon
      .groupBy({ by: ['set'] })
      .then(groups => groups.map(g => g.set)),
    prisma.ctoon
      .groupBy({ by: ['series'] })
      .then(groups => groups.map(g => g.series)),
    prisma.ctoon
      .groupBy({ by: ['rarity'] })
      .then(groups => groups.map(g => g.rarity)),
  ])

  // 3. Return as JSON
  return { sets, series, rarities }
})
