import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
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

  // 2) Fetch offers
  const offers = await prisma.tradeOffer.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      initiator: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
      ctoons: {
        include: {
          userCtoon: {
            include: {
              ctoon: {
                select: { id: true, name: true, rarity: true, assetPath: true }
              }
            }
          }
        }
      }
    }
  })

  // 3) Shape for frontend
  return offers.map(o => {
    const ctoonsOffered = o.ctoons.filter(x => x.role === 'OFFERED').map(x => x.userCtoon.ctoon)
    const ctoonsRequested = o.ctoons.filter(x => x.role === 'REQUESTED').map(x => x.userCtoon.ctoon)

    // Decision timestamp is when status left PENDING. We use updatedAt.
    const decisionAt = o.status !== 'PENDING' ? o.updatedAt : null

    return {
      id: o.id,
      initiator: o.initiator,
      recipient: o.recipient,
      pointsOffered: o.pointsOffered,
      ctoonsOffered,
      ctoonsRequested,
      status: o.status,
      createdAt: o.createdAt,      // ISO UTC
      decisionAt                   // ISO UTC or null
    }
  })
})
