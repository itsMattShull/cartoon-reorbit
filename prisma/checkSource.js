// scripts/reportLWGFromSources.js
// Usage: node scripts/reportLWGFromSources.js
// Assumes ESM and prisma export at @/server/prisma (same as your example)

import { prisma } from '@/server/prisma'

const USERNAMES = {
  target: 'LegendaryWarriorGuru',
  sources: ['GroovyCaptainSmith', 'ShadowAngelGuru']
}

async function getUsers() {
  const users = await prisma.user.findMany({
    where: { username: { in: [USERNAMES.target, ...USERNAMES.sources] } },
    select: { id: true, username: true }
  })
  const map = new Map(users.map(u => [u.username, u.id]))
  const missing = [USERNAMES.target, ...USERNAMES.sources].filter(u => !map.has(u))
  if (missing.length) throw new Error(`Missing users: ${missing.join(', ')}`)
  return {
    lwgId: map.get(USERNAMES.target),
    sourceIds: USERNAMES.sources.map(u => map.get(u))
  }
}

async function getUserCtoonIdsEverOwnedBy(userId) {
  const rows = await prisma.ctoonOwnerLog.findMany({
    where: { userId, userCtoonId: { not: null } },
    select: { userCtoonId: true },
    distinct: ['userCtoonId']
  })
  return rows.map(r => r.userCtoonId)
}

async function earliestOwnerByUserCtoon(userCtoonIds) {
  if (userCtoonIds.length === 0) return new Map()
  const logs = await prisma.ctoonOwnerLog.findMany({
    where: { userCtoonId: { in: userCtoonIds } },
    select: { userCtoonId: true, userId: true, createdAt: true },
    orderBy: [{ userCtoonId: 'asc' }, { createdAt: 'asc' }]
  })
  const firstById = new Map()
  for (const row of logs) {
    if (!firstById.has(row.userCtoonId) && row.userId) {
      firstById.set(row.userCtoonId, row.userId)
    }
  }
  return firstById
}

async function currentOwnedCount(userId, ids) {
  if (ids.length === 0) return 0
  return prisma.userCtoon.count({
    where: { id: { in: ids }, userId, burnedAt: null }
  })
}

async function auctionPointsReceivedFor(userId, userCtoonIds) {
  if (userCtoonIds.length === 0) return 0
  const agg = await prisma.auction.aggregate({
    where: {
      userCtoonId: { in: userCtoonIds },
      status: 'CLOSED',
      creatorId: userId,
      winnerId: { not: null }
    },
    _sum: { highestBid: true }
  })
  return agg._sum.highestBid || 0
}

function sumPricesFromOfferRows(offers, whereRole) {
  let sum = 0
  for (const off of offers) {
    for (const c of off.ctoons) {
      // c.userCtoon.ctoon.price is an Int (default 0)
      sum += c.userCtoon?.ctoon?.price ?? 0
    }
  }
  return sum
}

async function tradeValueReceivedFor(userId, seedUserCtoonIds) {
  if (seedUserCtoonIds.length === 0) return 0

  // Case A: LWG initiated the trade and OFFERED one of the seed items.
  // He RECEIVED the REQUESTED items' value.
  const initiated = await prisma.tradeOffer.findMany({
    where: {
      status: 'ACCEPTED',
      initiatorId: userId,
      ctoons: { some: { role: 'OFFERED', userCtoonId: { in: seedUserCtoonIds } } }
    },
    select: {
      id: true,
      ctoons: {
        where: { role: 'REQUESTED' },
        select: {
          userCtoon: { select: { ctoon: { select: { price: true } } } }
        }
      }
    }
  })

  // Case B: LWG was the recipient and the other party REQUESTED one of the seed items.
  // He RECEIVED the OFFERED items' value.
  const received = await prisma.tradeOffer.findMany({
    where: {
      status: 'ACCEPTED',
      recipientId: userId,
      ctoons: { some: { role: 'REQUESTED', userCtoonId: { in: seedUserCtoonIds } } }
    },
    select: {
      id: true,
      ctoons: {
        where: { role: 'OFFERED' },
        select: {
          userCtoon: { select: { ctoon: { select: { price: true } } } }
        }
      }
    }
  })

  const sumInitiated = sumPricesFromOfferRows(initiated, 'REQUESTED')
  const sumReceived  = sumPricesFromOfferRows(received,  'OFFERED')
  return sumInitiated + sumReceived
}

async function main() {
  const { lwgId, sourceIds } = await getUsers()

  // All UserCtoons that LWG has ever owned.
  const lwgEver = await getUserCtoonIdsEverOwnedBy(lwgId)

  // Find the earliest owner per UserCtoon among those, and filter to ones that began with one of the sources.
  const firstOwnerMap = await earliestOwnerByUserCtoon(lwgEver)
  const seedIds = []
  for (const [uctId, firstOwnerId] of firstOwnerMap.entries()) {
    if (sourceIds.includes(firstOwnerId)) seedIds.push(uctId)
  }

  // 1) How many of those does LWG CURRENTLY own?
  const currentCount = await currentOwnedCount(lwgId, seedIds)

  // 2a) Points received via CLOSED auctions where LWG sold those items.
  const auctionPoints = await auctionPointsReceivedFor(lwgId, seedIds)

  // 2b) “Value” of cToons received via accepted trade offers for those items (sum of Ctoon.price).
  const tradeValue = await tradeValueReceivedFor(lwgId, seedIds)

  console.log('— Report —')
  console.log(`Seed items (originated from GroovyCaptainSmith or ShadowAngelGuru, later owned by LegendaryWarriorGuru): ${seedIds.length}`)
  console.log(`Currently owned by LegendaryWarriorGuru: ${currentCount}`)
  console.log(`Points received via auctions for these items: ${auctionPoints}`)
  console.log(`Value of cToons received via trades for these items (sum of Ctoon.price): ${tradeValue}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
