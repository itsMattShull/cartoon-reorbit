import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const rows = await db.adImage.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, imagePath: true, filename: true, label: true, createdAt: true }
  })
  return rows
})
