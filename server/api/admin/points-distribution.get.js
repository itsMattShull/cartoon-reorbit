// server/api/admin/points-distribution.get.js

import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 1800 // 30 minutes
const MAX_BUCKETS = 2000 // bars before everything above is lumped into one "N+" bar

export default defineEventHandler(async (event) => {
  // 1) Admin check via /api/auth/me
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

  // 2) Build buckets, exclude a specific user, fill gaps
  const { bucketSize: rawBucketSize } = getQuery(event)
  const bucketSize = [500, 1000, 5000, 10000].includes(Number(rawBucketSize))
    ? Number(rawBucketSize)
    : 1000

  // 3) Cache check. The "v2" in the key retires the old unbounded payloads (a single outlier balance
  // used to cache a ~90 MB response for 30 minutes).
  const cacheKey = `admin:points-distribution:v2:${bucketSize}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  // The histogram has at most MAX_BUCKETS + 1 bars no matter what the data holds. Every balance at or
  // above `overflowStart` lands in one final "N+" bar. Previously the SQL generate_series'd a bucket for
  // every `bucketSize` points up to the single largest balance, so one account holding ~1.2 billion
  // points produced a ~1.2 million row / ~90 MB response that froze the server and the chart.
  const overflowStart = MAX_BUCKETS * bucketSize

  // Only buckets that actually contain users come back from SQL (at most MAX_BUCKETS + 1 rows); the
  // empty bars in between are filled in below.
  const rows = await prisma.$queryRaw`
    SELECT
      (floor(LEAST(COALESCE(up.points, 0), ${overflowStart}::int) / ${bucketSize}::int)::int * ${bucketSize}::int) AS bucket_start,
      COUNT(*)::int AS cnt
    FROM "User" u
    LEFT JOIN "UserPoints" up
      ON up."userId" = u.id
    WHERE u.id <> '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'
      AND COALESCE(up.points, 0) >= 0
    GROUP BY bucket_start
  `

  // 4) Shape payload with human-readable labels
  const countByIndex = new Map()
  let lastIndex = 0
  for (const r of rows) {
    const idx = Math.min(MAX_BUCKETS, Math.floor(Number(r.bucket_start) / bucketSize))
    countByIndex.set(idx, (countByIndex.get(idx) || 0) + Number(r.cnt))
    if (idx > lastIndex) lastIndex = idx
  }

  const result = []
  for (let idx = 0; idx <= lastIndex; idx++) {
    const start = idx * bucketSize
    const count = countByIndex.get(idx) || 0
    if (idx === MAX_BUCKETS) {
      result.push({ bucketStart: start, bucketEnd: null, count, label: `${start}+` })
    } else {
      const end = start + (bucketSize - 1)
      result.push({ bucketStart: start, bucketEnd: end, count, label: `${start}–${end}` })
    }
  }

  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
  return result
})
