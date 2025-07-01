// server/api/admin/clash-stats.get.js
import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ——————————————————————————————————————————————
  // 1️⃣ Admin auth via /api/auth/me
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

  // ——————————————————————————————————————————————
  // 2️⃣ Raw SQL: group by day using Chicago time, count total & finished
  const rows = await prisma.$queryRaw`
    SELECT
      to_char(
        "startedAt" AT TIME ZONE 'UTC'
                     AT TIME ZONE 'America/Chicago',
        'YYYY-MM-DD'
      ) AS day,
      COUNT(*) AS total,
      SUM(
        CASE
          WHEN outcome IS NOT NULL
           AND outcome != 'incomplete'
           AND outcome != ''
          THEN 1
          ELSE 0
        END
      ) AS finished
    FROM "ClashGame"
    GROUP BY day
    ORDER BY day
  `

  // ——————————————————————————————————————————————
  // 3️⃣ Map into the shape you want
  const results = rows.map(r => {
    const total    = Number(r.total)
    const finished = Number(r.finished)
    return {
      day:             r.day,
      count:           total,
      percentFinished: total > 0
        ? Math.round((finished / total) * 100)
        : 0
    }
  })

  return results
})
