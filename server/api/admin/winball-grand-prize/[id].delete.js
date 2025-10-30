// server/api/admin/winball-grand-prize/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  await db.winballGrandPrizeSchedule.delete({ where: { id } })
  return { ok: true }
})
