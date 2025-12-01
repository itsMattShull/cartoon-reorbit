// server/scripts/delete-user-MellowChargerPioneer.js
// Usage:
//   DATABASE_URL="postgres://..." node server/scripts/delete-user-MellowChargerPioneer.js
//
// What it does:
//  - Finds the user by username ("MellowChargerPioneer")
//  - Deletes / nulls out almost everything that references that user
//  - Finally deletes the User row

import { prisma } from '../server/prisma.js'

const TARGET_USERNAME = 'MellowChargerPioneer'

async function main() {
  const user = await prisma.user.findUnique({
    where: { username: TARGET_USERNAME },
  })

  if (!user) {
    console.log(`No user found with username "${TARGET_USERNAME}". Nothing to do.`)
    return
  }

  const userId = user.id
  console.log(`🔍 Found user "${TARGET_USERNAME}" (${userId})`)

  // Preload IDs that are referenced in many places
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId },
    select: { id: true },
  })
  const userCtoonIds = userCtoons.map((u) => u.id)

  const decks = await prisma.clashDeck.findMany({
    where: { userId },
    select: { id: true },
  })
  const deckIds = decks.map((d) => d.id)

  const auctions = await prisma.auction.findMany({
    where: {
      OR: [
        { creatorId: userId },
        { highestBidderId: userId },
        { winnerId: userId },
        { userCtoon: { userId } },
      ],
    },
    select: { id: true },
  })
  const auctionIds = auctions.map((a) => a.id)

  const tradeRooms = await prisma.tradeRoom.findMany({
    where: {
      OR: [{ traderAId: userId }, { traderBId: userId }],
    },
    select: { id: true },
  })
  const tradeRoomIds = tradeRooms.map((r) => r.id)

  const trades = await prisma.trade.findMany({
    where: { userId },
    select: { id: true, roomId: true },
  })
  const tradeIds = trades.map((t) => t.id)

  const tradeOffers = await prisma.tradeOffer.findMany({
    where: {
      OR: [{ initiatorId: userId }, { recipientId: userId }],
    },
    select: { id: true },
  })
  const tradeOfferIds = tradeOffers.map((t) => t.id)

  console.log(
    `Preloaded: ${userCtoonIds.length} userCtoons, ` +
      `${deckIds.length} decks, ${auctionIds.length} auctions, ` +
      `${tradeRoomIds.length} tradeRooms, ${tradeIds.length} trades, ` +
      `${tradeOfferIds.length} tradeOffers`
  )

  // --- Auctions / bidding related ------------------------------------

  let result

  result = await prisma.auctionAutoBid.deleteMany({
    where: {
      OR: [
        { userId },
        auctionIds.length ? { auctionId: { in: auctionIds } } : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} AuctionAutoBid rows`)

  result = await prisma.bid.deleteMany({
    where: {
      OR: [
        { userId },
        auctionIds.length ? { auctionId: { in: auctionIds } } : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} Bid rows`)

  result = await prisma.auctionOnly.deleteMany({
    where: {
      OR: [
        { createdById: userId },
        userCtoonIds.length ? { userCtoonId: { in: userCtoonIds } } : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} AuctionOnly rows`)

  if (auctionIds.length) {
    result = await prisma.auction.deleteMany({
      where: { id: { in: auctionIds } },
    })
    console.log(`🗑 Deleted ${result.count} Auction rows`)
  }

  // --- Trade offers + trades + rooms ---------------------------------

  if (tradeOfferIds.length) {
    result = await prisma.tradeOfferCtoon.deleteMany({
      where: { tradeOfferId: { in: tradeOfferIds } },
    })
    console.log(`🗑 Deleted ${result.count} TradeOfferCtoon rows`)

    result = await prisma.tradeOffer.deleteMany({
      where: { id: { in: tradeOfferIds } },
    })
    console.log(`🗑 Deleted ${result.count} TradeOffer rows`)
  }

  result = await prisma.tradeCtoon.deleteMany({
    where: {
      OR: [
        userCtoonIds.length ? { userCtoonId: { in: userCtoonIds } } : undefined,
        tradeIds.length ? { tradeId: { in: tradeIds } } : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} TradeCtoon rows`)

  result = await prisma.tradeSpectator.deleteMany({
    where: {
      OR: [
        { userId },
        tradeRoomIds.length ? { roomId: { in: tradeRoomIds } } : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} TradeSpectator rows`)

  if (tradeIds.length) {
    result = await prisma.trade.deleteMany({
      where: { id: { in: tradeIds } },
    })
    console.log(`🗑 Deleted ${result.count} Trade rows`)
  }

  if (tradeRoomIds.length) {
    result = await prisma.tradeRoom.deleteMany({
      where: { id: { in: tradeRoomIds } },
    })
    console.log(`🗑 Deleted ${result.count} TradeRoom rows`)
  }

  // --- Clash decks & games -------------------------------------------

  if (deckIds.length) {
    result = await prisma.clashDeckCard.deleteMany({
      where: { deckId: { in: deckIds } },
    })
    console.log(`🗑 Deleted ${result.count} ClashDeckCard rows`)

    result = await prisma.clashDeck.deleteMany({
      where: { id: { in: deckIds } },
    })
    console.log(`🗑 Deleted ${result.count} ClashDeck rows`)
  }

  result = await prisma.clashGame.deleteMany({
    where: {
      OR: [
        { player1UserId: userId },
        { player2UserId: userId },
        { whoLeftUserId: userId },
        { winnerUserId: userId },
      ],
    },
  })
  console.log(`🗑 Deleted ${result.count} ClashGame rows`)

  // --- Wishlist, packs, points, logs, visits -------------------------

  result = await prisma.wishlistItem.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} WishlistItem rows`)

  result = await prisma.userPack.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} UserPack rows`)

  result = await prisma.userPoints.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} UserPoints rows`)

  result = await prisma.gamePointLog.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} GamePointLog rows`)

  result = await prisma.pointsLog.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} PointsLog rows`)

  result = await prisma.loginLog.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} LoginLog rows`)

  result = await prisma.visit.deleteMany({
    where: {
      OR: [{ userId }, { zoneOwnerId: userId }],
    },
  })
  console.log(`🗑 Deleted ${result.count} Visit rows`)

  result = await prisma.userIP.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} UserIP rows`)

  // --- Friends -------------------------------------------------------

  result = await prisma.friend.deleteMany({
    where: {
      OR: [{ userId }, { friendId: userId }],
    },
  })
  console.log(`🗑 Deleted ${result.count} Friend rows`)

  // --- Wheel, holiday, ownership logs --------------------------------

  result = await prisma.wheelSpinLog.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} WheelSpinLog rows`)

  result = await prisma.holidayRedemption.deleteMany({
    where: {
      OR: [
        { userId },
        userCtoonIds.length
          ? { sourceUserCtoonId: { in: userCtoonIds } }
          : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} HolidayRedemption rows`)

  result = await prisma.ctoonOwnerLog.deleteMany({
    where: {
      OR: [
        { userId },
        userCtoonIds.length
          ? { userCtoonId: { in: userCtoonIds } }
          : undefined,
      ].filter(Boolean),
    },
  })
  console.log(`🗑 Deleted ${result.count} CtoonOwnerLog rows`)

  // --- Backgrounds / images / schedules (null out creator) -----------

  result = await prisma.userBackground.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} UserBackground rows`)

  result = await prisma.background.updateMany({
    where: { createdById: userId },
    data: { createdById: null },
  })
  console.log(`🧹 Nullified createdById on ${result.count} Background rows`)

  result = await prisma.adImage.updateMany({
    where: { createdById: userId },
    data: { createdById: null },
  })
  console.log(`🧹 Nullified createdById on ${result.count} AdImage rows`)

  result = await prisma.winballGrandPrizeSchedule.updateMany({
    where: { createdById: userId },
    data: { createdById: null },
  })
  console.log(
    `🧹 Nullified createdById on ${result.count} WinballGrandPrizeSchedule rows`
  )

  // --- CZone / UserCtoon ---------------------------------------------

  result = await prisma.cZone.deleteMany({ where: { userId } })
  console.log(`🗑 Deleted ${result.count} CZone rows`)

  if (userCtoonIds.length) {
    result = await prisma.userCtoon.deleteMany({
      where: { id: { in: userCtoonIds } },
    })
    console.log(`🗑 Deleted ${result.count} UserCtoon rows`)
  }

  // --- Auctions that might still reference user (fallback) -----------

  result = await prisma.auction.deleteMany({
    where: {
      OR: [
        { creatorId: userId },
        { highestBidderId: userId },
        { winnerId: userId },
      ],
    },
  })
  if (result.count) {
    console.log(
      `⚠️ Fallback: deleted ${result.count} additional Auction rows still pointing at user`
    )
  }

  // --- Finally: delete the User itself -------------------------------

  await prisma.user.delete({ where: { id: userId } })
  console.log(`✅ Deleted user "${TARGET_USERNAME}" and related data.`)
}

main()
  .catch((err) => {
    console.error('❌ Error while deleting user and related data:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
