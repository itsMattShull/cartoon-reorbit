// server/api/admin/cron-error-logs/index.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const query = getQuery(event)
  const includeDismissed = query.includeDismissed === 'true'

  const rows = await prisma.cronErrorLog.findMany({
    where: includeDismissed ? {} : { dismissed: false },
    orderBy: { createdAt: 'desc' },
    take: 200
  })

  return rows
})
