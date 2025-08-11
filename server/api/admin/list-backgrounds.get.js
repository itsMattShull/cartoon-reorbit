// server/api/admin/list-backgrounds.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // By default, only show CODE_ONLY since PUBLIC needs no unlock.
  const items = await db.background.findMany({
    where: { visibility: 'CODE_ONLY' },
    select: { id: true, label: true, imagePath: true }
  })
  return items
})