// server/api/admin/official-collection.get.js
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

  // Admin with discordTag "mattshull" can see ALL official cToons including non-tradeable ones
  const isMattShull = me.discordTag?.toLowerCase() === 'mattshull'

  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const userWithCtoons = await prisma.user.findUnique({
    where: { username: officialUsername },
    include: {
      ctoons: {
        where: {
          burnedAt: null,
          ...(isMattShull ? {} : { isTradeable: true })
        },
        include: { ctoon: true }
      }
    }
  })
  if (!userWithCtoons) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }

  const userCtoonIds = userWithCtoons.ctoons.map(uc => uc.id)
  if (!userCtoonIds.length) return []

  // Fetch all lock sets in parallel
  const [activeAuctionRows, pendingTradeRows, dissolveQueueRows, auctionOnlyRows] = await Promise.all([
    // Active auctions
    prisma.auction.findMany({
      where: { userCtoonId: { in: userCtoonIds }, status: 'ACTIVE' },
      select: { userCtoonId: true }
    }),
    // Pending trades
    prisma.tradeOfferCtoon.findMany({
      where: { userCtoonId: { in: userCtoonIds }, tradeOffer: { status: 'PENDING' } },
      select: { userCtoonId: true }
    }),
    // Dissolve auction queue
    prisma.dissolveAuctionQueue.findMany({
      where: { userCtoonId: { in: userCtoonIds } },
      select: { userCtoonId: true }
    }),
    // Featured/scheduled auction queue (AuctionOnly not yet started)
    prisma.auctionOnly.findMany({
      where: { userCtoonId: { in: userCtoonIds }, isStarted: false },
      select: { userCtoonId: true }
    })
  ])

  const activeAuctionSet = new Set(activeAuctionRows.map(r => r.userCtoonId))
  const pendingTradeSet  = new Set(pendingTradeRows.map(r => r.userCtoonId))
  const dissolveQueueSet = new Set(dissolveQueueRows.map(r => r.userCtoonId))
  const auctionOnlySet   = new Set(auctionOnlyRows.map(r => r.userCtoonId))

  // Exclude any cToon that is locked in one of the above states
  const available = userWithCtoons.ctoons.filter(uc =>
    !activeAuctionSet.has(uc.id) &&
    !pendingTradeSet.has(uc.id) &&
    !dissolveQueueSet.has(uc.id) &&
    !auctionOnlySet.has(uc.id)
  )

  // Sort: name A–Z, then ctoonId, then mintNumber (nulls last)
  available.sort((a, b) => {
    const nameA = a.ctoon?.name ?? ''
    const nameB = b.ctoon?.name ?? ''
    const byName = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
    if (byName) return byName
    const byId = (a.ctoonId ?? '').localeCompare(b.ctoonId ?? '')
    if (byId) return byId
    const mA = a.mintNumber ?? Number.POSITIVE_INFINITY
    const mB = b.mintNumber ?? Number.POSITIVE_INFINITY
    return mA - mB
  })

  // Holiday item lookup
  const ctoonIds = available.map(uc => uc.ctoonId)
  const holidayRows = ctoonIds.length
    ? await prisma.holidayEventItem.findMany({
        where: { ctoonId: { in: ctoonIds } },
        select: { ctoonId: true }
      })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  return available.map(uc => ({
    id:             uc.id,
    ctoonId:        uc.ctoonId,
    assetPath:      uc.ctoon.assetPath,
    name:           uc.ctoon.name,
    series:         uc.ctoon.series?.trim() || null,
    set:            uc.ctoon.set?.trim() || null,
    rarity:         uc.ctoon.rarity?.trim() || null,
    isGtoon:        uc.ctoon.isGtoon,
    cost:           uc.ctoon.cost,
    power:          uc.ctoon.power,
    mintNumber:     uc.mintNumber,
    quantity:       uc.ctoon.quantity,
    isFirstEdition: uc.isFirstEdition,
    isHolidayItem:  holidaySet.has(uc.ctoonId),
    inPendingTrade: false // already filtered out above
  }))
})
