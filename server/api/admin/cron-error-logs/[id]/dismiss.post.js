// server/api/admin/cron-error-logs/[id]/dismiss.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const id = event.context.params.id

  await prisma.cronErrorLog.update({
    where: { id },
    data: { dismissed: true, dismissedAt: new Date() }
  }).catch(() => {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  })

  return { ok: true }
})
