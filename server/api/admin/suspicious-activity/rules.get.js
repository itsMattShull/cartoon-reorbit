import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const rules = await db.suspiciousActivityRule.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      conditions: { orderBy: { order: 'asc' } },
      createdBy: { select: { id: true, username: true } },
    },
  })

  return rules
})
