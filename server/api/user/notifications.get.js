import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { NOTIFICATION_PREFERENCE_FIELDS } from '@/server/utils/notificationPreferences'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const select = Object.fromEntries(NOTIFICATION_PREFERENCE_FIELDS.map(f => [f, true]))
  const user = await db.user.findUnique({ where: { id: me.id }, select })

  const out = {}
  for (const field of NOTIFICATION_PREFERENCE_FIELDS) out[field] = !!user?.[field]
  return out
})
