// server/api/admin/users/search.get.js
// Lightweight username search for admin "pick a user" pickers (currently: the cMoons Members
// panel's "add member" flow). Deliberately narrow — server-side LIMIT, no aggregates — unlike
// /api/admin/users, which loads the entire user table and is meant for the full Manage Users
// table, not a search-as-you-type control.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

const MIN_QUERY_LENGTH = 3
const RESULT_LIMIT = 20

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { q } = getQuery(event)
  const query = typeof q === 'string' ? q.trim() : ''
  if (query.length < MIN_QUERY_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Query must be at least ${MIN_QUERY_LENGTH} characters` })
  }

  const users = await db.user.findMany({
    where: { username: { contains: query, mode: 'insensitive' } },
    orderBy: { username: 'asc' },
    take: RESULT_LIMIT,
    select: {
      id: true,
      username: true,
      banned: true,
      active: true,
      isAdmin: true,
      cMoonId: true,
      cMoon: { select: { name: true } },
    },
  })

  return {
    users: users.map(u => ({
      id: u.id,
      username: u.username,
      banned: u.banned,
      active: u.active,
      isAdmin: u.isAdmin,
      cMoonId: u.cMoonId,
      cMoonName: u.cMoon?.name || null,
    })),
  }
})
