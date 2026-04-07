import { defineEventHandler, getRequestHeader, getRouterParam, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const userId = getRouterParam(event, 'userId')

  const existing = await db.suspiciousActivityMute.findUnique({ where: { userId } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Mute not found' })

  await db.suspiciousActivityMute.delete({ where: { userId } })

  return { ok: true }
})
