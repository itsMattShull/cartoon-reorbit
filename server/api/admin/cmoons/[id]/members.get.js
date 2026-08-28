// server/api/admin/cmoons/[id]/members.get.js
// Lightweight member list for one cMoon, for the admin cMoons "Members" panel. Deliberately its
// own narrow, single-cMoon-scoped query rather than reusing /api/admin/users (which loads every
// user in the database plus several groupBy aggregates) — this panel can be opened/reopened
// often, and doesn't need any of that extra data.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id }, select: { id: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const members = await db.user.findMany({
    where: { cMoonId: id },
    orderBy: { username: 'asc' },
    select: { id: true, username: true, banned: true },
  })

  return { members }
})
