// server/api/auctions/featured.get.js
// GET /api/auctions/featured — the small, curated set of currently-active
// featured auctions, shaped for the Economy page's "Featured Auctions"
// carousel (components/newsite/EconomyFeaturedAuctionsCarousel.vue).
//
// Read-only: bidding itself always goes through the existing, hardened
// POST /api/auction/[id]/bid endpoint (eligibility checks, exact-amount
// enforcement, locking, socket broadcast all live there — not duplicated
// here). This endpoint only needs to tell the carousel what to render and
// what the next valid bid amount is.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { incrementFor } from '@/server/utils/autoBid'

export default defineEventHandler(async (event) => {
  // Auth pattern matches server/api/auctions/all.get.js and
  // server/api/auction/[id]/bid.post.js: proxy the session cookie through to
  // /api/auth/me rather than reading event.context.userId directly.
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const auctions = await prisma.auction.findMany({
    where: {
      isFeatured: true,
      status: 'ACTIVE',
      endAt: { gt: new Date() }
    },
    orderBy: { endAt: 'asc' },
    include: {
      userCtoon: {
        select: {
          mintNumber: true,
          ctoon: {
            select: {
              id: true,
              name: true,
              assetPath: true,
              rarity: true,
              isSecondEdition: true
            }
          }
        }
      },
      highestBidder: { select: { username: true } }
    }
  })

  return {
    items: auctions.map(a => {
      const noBidsYet = !a.highestBidderId || (a.highestBid || 0) === 0
      const requiredBid = noBidsYet
        ? a.initialBet
        : (a.highestBid + incrementFor(a.highestBid))

      return {
        id: a.id,
        ctoonId: a.userCtoon?.ctoon?.id ?? null,
        ctoonName: a.userCtoon?.ctoon?.name ?? null,
        assetPath: a.userCtoon?.ctoon?.assetPath ?? null,
        rarity: a.userCtoon?.ctoon?.rarity ?? null,
        isSecondEdition: a.userCtoon?.ctoon?.isSecondEdition ?? false,
        mintNumber: a.userCtoon?.mintNumber ?? null,
        highestBid: a.highestBid ?? 0,
        initialBet: a.initialBet,
        // Same shown-on-the-public-detail-page field as /api/auction/[id]
        // (see highestBidderUsername there) — not a new leak.
        highestBidderUsername: a.highestBidder?.username ?? null,
        requiredBid,
        endAt: a.endAt.toISOString()
      }
    })
  }
})
