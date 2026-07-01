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
  const { visibility } = await readBody(event)

  if (!VALID_VISIBILITY.includes(visibility)) {
    throw createError({ statusCode: 400, statusMessage: 'visibility must be PUBLIC or CODE_ONLY' })
  }

  const bg = await db.background.findUnique({ where: { id } })
  if (!bg) throw createError({ statusCode: 404, statusMessage: 'Background not found' })

  const updated = await db.background.update({
    where: { id },
    data: { visibility }
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'Background',
    key: 'visibility',
    prevValue: bg.visibility,
    newValue: visibility
  })

  return { id: updated.id, visibility: updated.visibility }
})
