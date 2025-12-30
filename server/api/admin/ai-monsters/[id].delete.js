// server/api/admin/ai-monsters/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = String(event.context.params?.id || '').trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const before = await db.aiMonster.findUnique({ where: { id } })
  if (!before) throw createError({ statusCode: 404, statusMessage: 'AI monster not found' })

  await db.aiMonster.delete({ where: { id } })
  await logAdminChange(db, { userId: me.id, area: 'AiMonster', key: `delete:${id}`, prevValue: before, newValue: null })
  return { ok: true }
})
