import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const { userId, reason } = await readBody(event)
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId is required' })

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const mute = await db.suspiciousActivityMute.upsert({
    where: { userId },
    create: { userId, mutedById: me.id, reason: reason?.trim() || null },
    update: { mutedById: me.id, reason: reason?.trim() || null, createdAt: new Date() },
  })

  return mute
})
