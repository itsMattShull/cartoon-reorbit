// server/api/admin/cmoon-points-log.get.js
import { defineEventHandler, getQuery } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { CMOON_SCORE_LOG_CATEGORIES, describeCMoonScoreLogSource } from '@/server/utils/cmoon'

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

// CMoonScoreLog.userId is a plain string column with no Prisma relation to User (only cMoonId
// has one, to CMoon) — see the schema comment on CMoonScoreLog — so a username search or a
// username in the response both require an explicit join, done here with raw SQL rather than
// two round-trips per page.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit
  const username = typeof query.username === 'string' ? query.username.trim() : ''
  const category = typeof query.category === 'string' && CMOON_SCORE_LOG_CATEGORIES.includes(query.category)
    ? query.category
    : ''
  const cMoonId = typeof query.cMoonId === 'string' ? query.cMoonId.trim() : ''
  const from = query.from ? parseStartYMD(String(query.from)) : null
  const to = query.to ? parseEndYMD(String(query.to)) : null

  const conditions = [Prisma.sql`1=1`]
  if (username) conditions.push(Prisma.sql`u.username ILIKE ${'%' + username + '%'}`)
  if (category) conditions.push(Prisma.sql`l.category = ${category}`)
  if (cMoonId) conditions.push(Prisma.sql`l."cMoonId" = ${cMoonId}`)
  if (from) conditions.push(Prisma.sql`l."createdAt" >= ${from}`)
  if (to) conditions.push(Prisma.sql`l."createdAt" <= ${to}`)
  const whereSql = Prisma.join(conditions, ' AND ')

  const [countRows, rows, cmoons] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "CMoonScoreLog" l
      LEFT JOIN "User" u ON u.id = l."userId"
      WHERE ${whereSql}
    `,
    prisma.$queryRaw`
      SELECT
        l.id, l."userId", u.username, l."cMoonId", c.name AS "cMoonName", c.color AS "cMoonColor",
        l.category, l.detail, l.points, l."weekStart", l."createdAt"
      FROM "CMoonScoreLog" l
      LEFT JOIN "User" u ON u.id = l."userId"
      LEFT JOIN "CMoon" c ON c.id = l."cMoonId"
      WHERE ${whereSql}
      ORDER BY l."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
    prisma.cMoon.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
  ])

  const items = rows.map(r => ({
    id: r.id,
    userId: r.userId,
    username: r.username,
    cMoonId: r.cMoonId,
    cMoonName: r.cMoonName,
    cMoonColor: r.cMoonColor,
    category: r.category,
    detail: r.detail,
    source: describeCMoonScoreLogSource(r.category, r.detail),
    points: r.points,
    weekStart: r.weekStart,
    createdAt: r.createdAt,
  }))

  return {
    items,
    total: countRows[0]?.count ?? 0,
    page,
    limit,
    categories: CMOON_SCORE_LOG_CATEGORIES,
    cmoons,
  }
})
