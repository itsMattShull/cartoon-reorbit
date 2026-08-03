import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
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

  const body = await readBody(event)

  // Patch semantics: only fields actually present in the request are written.
  // A plain `Boolean(body?.field)` over the whole list would turn every omitted
  // toggle off, so a settings page that posts one field would silently disable
  // the others.
  const data = {}
  for (const field of NOTIFICATION_PREFERENCE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = Boolean(body[field])
    }
  }

  const select = Object.fromEntries(NOTIFICATION_PREFERENCE_FIELDS.map(f => [f, true]))

  const updated = Object.keys(data).length
    ? await db.user.update({ where: { id: me.id }, data, select })
    : await db.user.findUnique({ where: { id: me.id }, select })

  const out = {}
  for (const field of NOTIFICATION_PREFERENCE_FIELDS) out[field] = !!updated?.[field]
  return out
})
