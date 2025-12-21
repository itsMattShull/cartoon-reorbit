// server/api/admin/achievements.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const items = await db.achievement.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rewards: {
        include: {
          ctoons: { include: { ctoon: { select: { id: true, name: true } } } },
          backgrounds: { include: { background: { select: { id: true, label: true, imagePath: true } } } }
        }
      }
    }
  })

  return items.map(a => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    description: a.description,
    imagePath: a.imagePath,
    isActive: a.isActive,
    pointsGte: a.pointsGte,
    totalCtoonsGte: a.totalCtoonsGte,
    uniqueCtoonsGte: a.uniqueCtoonsGte,
    setsRequired: a.setsRequired || [],
    userCreatedBefore: a.userCreatedBefore,
    rewards: a.rewards?.[0] ? {
      points: a.rewards[0].points || 0,
      ctoons: (a.rewards[0].ctoons || []).map(rc => ({ ctoonId: rc.ctoonId, quantity: rc.quantity, name: rc.ctoon?.name || '' })),
      backgrounds: (a.rewards[0].backgrounds || []).map(rb => ({ backgroundId: rb.backgroundId, label: rb.background?.label || '', imagePath: rb.background?.imagePath || null }))
    } : { points: 0, ctoons: [], backgrounds: [] }
  }))
})
