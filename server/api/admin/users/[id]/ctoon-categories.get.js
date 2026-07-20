// server/api/admin/users/[id]/ctoon-categories.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getFeaturedDissolveConfig, isCtoonFeatured } from '@/server/utils/featuredDissolveConfig'

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

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const ctoons = await prisma.userCtoon.findMany({
    where: { userId: id, burnedAt: null },
    select: {
      ctoon: { select: { series: true, rarity: true, set: true } }
    }
  })

  const featuredConfig = await getFeaturedDissolveConfig()

  let featured = 0, other = 0

  for (const uc of ctoons) {
    if (isCtoonFeatured(uc.ctoon, featuredConfig)) featured++
    else other++
  }

  return { featured, other, total: ctoons.length }
})
