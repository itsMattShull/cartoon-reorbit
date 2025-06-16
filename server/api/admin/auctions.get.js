import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

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

  const auctions = await   prisma.auction.findMany({
    orderBy: { endAt: 'asc' },
    include: {
      // include the UserCtoon → Ctoon relation so we can get the image & name
      userCtoon: {
        include: {
          ctoon: {
            select: {
              id: true,
              name: true,
              assetPath: true
            }
          }
        }
      },
      // include the auction creator’s username
      creator: {
        select: {
          id: true,
          username: true
        }
      },
      // include the highest bidder’s username if any
      highestBidder: {
        select: {
          id: true,
          username: true
        }
      },
      // include just the IDs of all bids so we can count them client-side
      bids: {
        select: { id: true }
      }
    }
  })

  return auctions.map(a => ({
    id: a.id,
    status: a.status,
    createdAt: a.createdAt,
    endAt: a.endAt,
    highestBid: a.highestBid,
    userCtoon: {
      ctoon: a.userCtoon.ctoon
    },
    creator: a.creator,
    highestBidder: a.highestBidder,
    bids: a.bids
  }))
})
