// server/api/admin/points-issued-by-category.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { redis } from '@/server/utils/redis'
import { computeCategoryBreakdown } from '@/server/utils/pointsCategoryBreakdown'

const CACHE_TTL_SECONDS = 1800 // 30 minutes

export default defineEventHandler(async (event) => {
  // 1) Admin check
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

  // 2) Params
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly' || rawGroupBy === 'monthly')
    ? rawGroupBy
    : 'daily'

  // 3) Cache check
  const cacheKey = `admin:points-issued-by-category:${timeframe}:${groupBy}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  const result = await computeCategoryBreakdown({ direction: 'increase', timeframe, groupBy })

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
  } catch {}

  return result
})
