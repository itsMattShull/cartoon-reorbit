import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const VALID_VISIBILITY = ['PUBLIC', 'CODE_ONLY']

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const id = event.context.params?.id
  const body = await readBody(event)
  const updates = {}

  if ('visibility' in body) {
    if (!VALID_VISIBILITY.includes(body.visibility)) {
      throw createError({ statusCode: 400, statusMessage: 'visibility must be PUBLIC or CODE_ONLY' })
    }
    updates.visibility = body.visibility
  }

  if ('label' in body) {
    updates.label = body.label?.trim() || null
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  }

  const bg = await db.background.findUnique({ where: { id } })
  if (!bg) throw createError({ statusCode: 404, statusMessage: 'Background not found' })

  const updated = await db.background.update({ where: { id }, data: updates })

  for (const [key, newValue] of Object.entries(updates)) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'Background',
      key,
      prevValue: bg[key],
      newValue
    })
  }

  return { id: updated.id, label: updated.label, visibility: updated.visibility }
})
