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
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const offers = await prisma.tradeOffer.findMany({
    where: {
      status: 'PENDING',
      OR: [{ initiatorId: id }, { recipientId: id }]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      initiator: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
      ctoons: {
        include: {
          userCtoon: {
            include: {
              ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
            }
          }
        }
      }
    }
  })

  const items = offers.map(o => ({
    id: o.id,
    initiator: o.initiator,
    recipient: o.recipient,
    pointsOffered: o.pointsOffered,
    ctoonsOffered: o.ctoons.filter(x => x.role === 'OFFERED').map(x => x.userCtoon.ctoon),
    ctoonsRequested: o.ctoons.filter(x => x.role === 'REQUESTED').map(x => x.userCtoon.ctoon),
    createdAt: o.createdAt
  }))

  return { items }
})
