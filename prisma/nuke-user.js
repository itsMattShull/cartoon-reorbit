// server/scripts/nuke.js
// Wipes ONLY the specified user’s data, but TRANSFERS their UserCtoons
// to the username "CartoonReOrbitOfficial".
// Usage: node server/scripts/nuke.js <username>
// Default username: "MysticNinjaWizard"

import { prisma } from '@/server/prisma'

async function nukeUserByUsername(username = 'MysticNinjaWizard') {
  const log = (m) => console.log(m)
  const del = async (label, fn) => {
    const res = await fn()
    log(`• ${label}: deleted ${res.count}`)
    return res.count
  }
  const upd = async (label, fn) => {
    const res = await fn()
    log(`• ${label}: updated ${res.count}`)
    return res.count
  }

  try {
    log(`🔎 Looking up user "${username}"…`)
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      log('⚠️  No such user. Nothing to do.')
      return
    }
    const userId = user.id
    log(`👤 Found user id=${userId}`)

    // Ensure destination (official) owner exists
    const officialUsername = 'CartoonReOrbitOfficial'
    const official = await prisma.user.findUnique({ where: { username: officialUsername } })
    if (!official) {
      throw new Error(
        `Destination user "${officialUsername}" not found. Create this account first or change the username in the script.`
      )
    }
    const officialId = official.id
    log(`🏷  Will transfer UserCtoons to "${officialUsername}" (id=${officialId})`)

    // Collect UserCtoon ids BEFORE any transfer (used to clean dependent rows)
    const userCtoons = await prisma.userCtoon.findMany({
      where: { userId },
      select: { id: true }
    })
    const userCtoonIds = userCtoons.map(x => x.id)

    // Auctions for user’s ctoons (compute before transfer)
    const auctionsForMyCtoons = await prisma.auction.findMany({
      where: { userCtoon: { userId } },
      select: { id: true }
    })
    const myAuctionIds = auctionsForMyCtoons.map(a => a.id)

    log('🧹 Cleaning auctions / bids / trades that involve the user or their items…')

    // --- Auctions & bids (remove these FIRST so nothing remains tied to the old owner) ---
    await del('Bids (placed by user)', () =>
      prisma.bid.deleteMany({ where: { userId } })
    )
    await del('Bids (on auctions for user’s ctoons)', () =>
      prisma.bid.deleteMany({ where: { auctionId: { in: myAuctionIds } } })
    )
    await del('Auctions (for user’s ctoons)', () =>
      prisma.auction.deleteMany({ where: { id: { in: myAuctionIds } } })
    )
    await del('Auctions (created by user)', () =>
      prisma.auction.deleteMany({ where: { creatorId: userId } })
    )
    await upd('Auctions (clear highestBidderId=user)', () =>
      prisma.auction.updateMany({ where: { highestBidderId: userId }, data: { highestBidderId: null } })
    )
    await upd('Auctions (clear winnerId=user)', () =>
      prisma.auction.updateMany({ where: { winnerId: userId }, data: { winnerId: null } })
    )

    // --- Trade offers ---
    await del('TradeOfferCtoon (rows for user’s UserCtoons)', () =>
      prisma.tradeOfferCtoon.deleteMany({ where: { userCtoonId: { in: userCtoonIds } } })
    )
    await del('TradeOfferCtoon (rows in offers user is part of)', () =>
      prisma.tradeOfferCtoon.deleteMany({
        where: { tradeOffer: { OR: [{ initiatorId: userId }, { recipientId: userId }] } }
      })
    )
    await del('TradeOffer (initiated/received by user)', () =>
      prisma.tradeOffer.deleteMany({ where: { OR: [{ initiatorId: userId }, { recipientId: userId }] } })
    )

    // --- Trades & rooms ---
    await del('TradeCtoon (for user’s UserCtoons)', () =>
      prisma.tradeCtoon.deleteMany({ where: { userCtoonId: { in: userCtoonIds } } })
    )
    await del('TradeCtoon (in trades created by user)', () =>
      prisma.tradeCtoon.deleteMany({ where: { trade: { userId } } })
    )
    await del('Trade (created by user)', () =>
      prisma.trade.deleteMany({ where: { userId } })
    )
    await del('TradeSpectator (user)', () =>
      prisma.tradeSpectator.deleteMany({ where: { userId } })
    )
    await upd('TradeRoom (clear traderAId=user)', () =>
      prisma.tradeRoom.updateMany({ where: { traderAId: userId }, data: { traderAId: null } })
    )
    await upd('TradeRoom (clear traderBId=user)', () =>
      prisma.tradeRoom.updateMany({ where: { traderBId: userId }, data: { traderBId: null } })
    )

    // --- Clash / decks / games ---
    await del('ClashDeckCard (in user’s decks)', () =>
      prisma.clashDeckCard.deleteMany({ where: { deck: { userId } } })
    )
    await del('ClashDeck (user’s)', () =>
      prisma.clashDeck.deleteMany({ where: { userId } })
    )
    await del('ClashGame (involving user)', () =>
      prisma.clashGame.deleteMany({
        where: {
          OR: [
            { player1UserId: userId },
            { player2UserId: userId },
            { winnerUserId: userId },
            { whoLeftUserId: userId }
          ]
        }
      })
    )

    // --- Claims / rewards (user-specific only) ---
    await del('Claim (user)', () =>
      prisma.claim.deleteMany({ where: { userId } })
    )

    // --- Inventory / ownership (non-cToon) ---
    await del('UserPack (user)', () =>
      prisma.userPack.deleteMany({ where: { userId } })
    )
    await del('WishlistItem (user)', () =>
      prisma.wishlistItem.deleteMany({ where: { userId } })
    )
    await del('UserBackground (user)', () =>
      prisma.userBackground.deleteMany({ where: { userId } })
    )
    await upd('Background (clear createdById=user)', () =>
      prisma.background.updateMany({ where: { createdById: userId }, data: { createdById: null } })
    )

    // --- Social / logs / misc ---
    await del('Friend (rows where user is user)', () =>
      prisma.friend.deleteMany({ where: { userId } })
    )
    await del('Friend (rows where user is friend)', () =>
      prisma.friend.deleteMany({ where: { friendId: userId } })
    )
    await del('Visit (by user or to user zone)', () =>
      prisma.visit.deleteMany({ where: { OR: [{ userId }, { zoneOwnerId: userId }] } })
    )
    await del('LoginLog (user)', () =>
      prisma.loginLog.deleteMany({ where: { userId } })
    )
    await del('GamePointLog (user)', () =>
      prisma.gamePointLog.deleteMany({ where: { userId } })
    )
    await del('PointsLog (user)', () =>
      prisma.pointsLog.deleteMany({ where: { userId } })
    )
    await del('WheelSpinLog (user)', () =>
      prisma.wheelSpinLog.deleteMany({ where: { userId } })
    )
    await del('UserIP (user)', () =>
      prisma.userIP.deleteMany({ where: { userId } })
    )
    await del('CZone (user)', () =>
      prisma.cZone.deleteMany({ where: { userId } })
    )

    // --- TRANSFER: UserCtoon ownership to official account ---------------
    // Optional: also clear inCzone on transferred items so they don’t appear in the official user’s zone.
    const transferred = await prisma.userCtoon.updateMany({
      where: { userId },
      data: { userId: officialId, inCzone: false } // keep other flags/mints intact
    })
    log(`✅ Transferred ${transferred.count} UserCtoon(s) to "${officialUsername}"`)

    // --- Remove remaining user-scoped records & the account --------------
    await del('UserPoints (user)', () =>
      prisma.userPoints.deleteMany({ where: { userId } })
    )
    await del('User (account)', () =>
      prisma.user.deleteMany({ where: { id: userId } })
    )

    console.log('🏁 Finished nuking user and transferring their cToons.')
  } catch (err) {
    console.error('❌ Error during user nuke:', err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

// Allow overriding username from CLI: `node server/scripts/nuke.js SomeUser`
const argUser = process.argv[2]
nukeUserByUsername(argUser || 'MysticNinjaWizard')
