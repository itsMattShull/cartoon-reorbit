import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const cfg = await db.homepageConfig.findUnique({ where: { id: 'homepage' } })
  return cfg ?? {
    id: 'homepage',
    topLeftImagePath: null,
    bottomLeftImagePath: null,
    topRightImagePath: null,
    bottomRightImagePath: null,
    showcaseImagePath: null,
    updatedAt: null
  }
})
