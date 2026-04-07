import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const mutes = await db.suspiciousActivityMute.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, discordTag: true } },
      mutedBy: { select: { id: true, username: true } },
    },
  })

  return mutes
})
