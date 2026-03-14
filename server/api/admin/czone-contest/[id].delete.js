// DELETE /api/admin/czone-contest/[id] — delete a contest (cascades submissions/votes)
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const contest = await prisma.cZoneContest.findUnique({ where: { id } })
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  await prisma.cZoneContest.delete({ where: { id } })

  return { ok: true }
})
