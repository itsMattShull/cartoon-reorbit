// server/api/admin/czone-mail/unblock.post.js
// Lift a cMail burst block early (e.g. a false positive from settings that were
// tighter than intended).

import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { resetCzoneMailWindow } from '@/server/utils/czoneMailRateLimit'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const userId = String(body?.userId || '').trim()
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'A userId is required.' })

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, czoneMailBlockedUntil: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  await db.user.update({ where: { id: userId }, data: { czoneMailBlockedUntil: null } })
  // Clear the hot counters too, or the next send would immediately re-trip.
  await resetCzoneMailWindow(userId)

  await logAdminChange(db, {
    userId: me.id,
    area: 'cZone Mail',
    key: 'unblock',
    prevValue: { blockedUntil: target.czoneMailBlockedUntil },
    newValue: { blockedUntil: null },
    targetUserId: target.id,
    targetUsername: target.username
  })

  return { success: true }
})
