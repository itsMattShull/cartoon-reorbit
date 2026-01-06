import { prisma } from '../server/prisma.js'

const CTOON_ID = '86270ea0-dc35-494f-9be4-2ccc469b19cc'

async function run() {
  const userCtoons = await prisma.userCtoon.findMany({
    where: { ctoonId: CTOON_ID },
    select: { id: true }
  })

  const userCtoonIds = userCtoons.map(u => u.id)

  if (!userCtoonIds.length) {
    console.log(`No UserCtoon rows found for ctoonId=${CTOON_ID}.`)
    return
  }

  const del = async (label, fn) => {
    const res = await fn()
    const count = typeof res?.count === 'number' ? res.count : 0
    console.log(`- ${label}: ${count}`)
    return count
  }

  console.log(`Deleting ${userCtoonIds.length} UserCtoon rows for ctoonId=${CTOON_ID}...`)

  await prisma.$transaction(async tx => {
    await del('AuctionAutoBid', () =>
      tx.auctionAutoBid.deleteMany({
        where: { auction: { userCtoonId: { in: userCtoonIds } } }
      })
    )

    await del('Bid', () =>
      tx.bid.deleteMany({
        where: { auction: { userCtoonId: { in: userCtoonIds } } }
      })
    )

    await del('AuctionOnly', () =>
      tx.auctionOnly.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    await del('Auction', () =>
      tx.auction.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    await del('TradeOfferCtoon', () =>
      tx.tradeOfferCtoon.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    await del('TradeCtoon', () =>
      tx.tradeCtoon.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    await del('CtoonOwnerLog', () =>
      tx.ctoonOwnerLog.updateMany({
        where: { userCtoonId: { in: userCtoonIds } },
        data: { userCtoonId: null }
      })
    )

    await del('HolidayRedemption', () =>
      tx.holidayRedemption.updateMany({
        where: { sourceUserCtoonId: { in: userCtoonIds } },
        data: { sourceUserCtoonId: null }
      })
    )

    await del('UserCtoon', () =>
      tx.userCtoon.deleteMany({
        where: { id: { in: userCtoonIds } }
      })
    )
  })

  console.log('Done.')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
