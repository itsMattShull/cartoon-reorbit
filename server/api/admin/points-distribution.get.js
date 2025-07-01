// server/api/admin/points-distribution.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2) Build 1 000-point buckets, exclude a specific user, fill gaps
  const rows = await prisma.$queryRaw`
    WITH all_pts AS (
      SELECT
        u.id,
        COALESCE(up.points, 0) AS pts
      FROM "User" u
      LEFT JOIN "UserPoints" up
        ON up."userId" = u.id
      WHERE u.id <> '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'
    ),
    counts AS (
      SELECT
        (floor(pts / 1000)::int * 1000) AS bucket_start,
        COUNT(*)::int                  AS cnt
      FROM all_pts
      GROUP BY bucket_start
    ),
    max_bucket AS (
      SELECT (floor(MAX(pts) / 1000)::int * 1000) AS max_b
      FROM all_pts
    ),
    buckets AS (
      -- now both 0 and max_b are ints
      SELECT generate_series(0, (SELECT max_b FROM max_bucket), 1000) AS bucket_start
    )
    SELECT
      b.bucket_start,
      COALESCE(c.cnt, 0) AS count
    FROM buckets b
    LEFT JOIN counts c
      ON c.bucket_start = b.bucket_start
    ORDER BY b.bucket_start
  `

  // 3) Shape payload with human-readable labels
  return rows.map(r => {
    const start = Number(r.bucket_start)
    const end   = start + 999
    return {
      bucketStart: start,
      bucketEnd:   end,
      count:       Number(r.count),
      label:       `${start}–${end}`
    }
  })
})
