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

  // 2) Build histogram buckets of current points (100-point bins)
  //    Include users without a points record by treating NULL as 0.
  const rows = await prisma.$queryRaw`
    WITH all_pts AS (
      SELECT
        u.id,
        COALESCE(up.points, 0) AS pts
      FROM "User" u
      LEFT JOIN "UserPoints" up ON up."userId" = u.id
    )
    SELECT
      floor(pts / 100) * 100 AS bucket_start,
      COUNT(*)::int AS count
    FROM all_pts
    GROUP BY bucket_start
    ORDER BY bucket_start
  `

  // 3) Shape payload with human-readable labels
  return rows.map(r => ({
    bucketStart: Number(r.bucket_start),
    bucketEnd:   Number(r.bucket_start) + 99,
    count:       Number(r.count),
    label:       `${r.bucket_start}–${r.bucket_start + 99}`
  }))
})
