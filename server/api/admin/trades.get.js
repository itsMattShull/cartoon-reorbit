import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── 1. Admin check via your auth endpoint ────────────────────────────────
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

  // Fetch all trade offers with related users and ctoon details
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
                select: {
                  id: true,
                  name: true,
                  rarity: true,
                  assetPath: true
                }
              }
            }
          }
        }
      }
    }
  })

  // Map offers to the shape expected by the frontend
  return offers.map(o => {
    const ctoonsOffered = o.ctoons
      .filter(x => x.role === 'OFFERED')
      .map(x => x.userCtoon.ctoon)
    const ctoonsRequested = o.ctoons
      .filter(x => x.role === 'REQUESTED')
      .map(x => x.userCtoon.ctoon)

    return {
      id: o.id,
      initiator: o.initiator,
      recipient: o.recipient,
      pointsOffered: o.pointsOffered,
      ctoonsOffered,
      ctoonsRequested
    }
  })
})
