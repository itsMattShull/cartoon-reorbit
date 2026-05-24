// prisma/seedTestActivity.js
// Seeds activity for testing the Cheat Finder + Trade Logs views.
//
// For every non-admin user:
//   - Adds 100-10000 points (with a PointsLog entry)
//   - Mints 1-3 random cMart cToons (atomic increment of totalMinted,
//     CtoonOwnerLog + CmartPurchaseLog written; points NOT deducted)
//   - Issues 3-4 TradeOffers as initiator.
//     * Most users trade only with peers that DO NOT share their IP.
//     * Two "cheater" users (picked from the largest shared-IP group)
//       send 1-2 of their trades to a same-IP peer — these will surface
//       as yellow cards in Cheat Finder.
//
// Run:  node prisma/seedTestActivity.js

import 'dotenv/config'
import { randomInt } from 'node:crypto'
import { prisma } from '../server/prisma.js'

function pickN(arr, n) {
  const pool = [...arr]
  const out = []
  while (out.length < n && pool.length) {
    out.push(pool.splice(randomInt(pool.length), 1)[0])
  }
  return out
}

async function mintCtoonForUser(userId, ctoonId) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.ctoon.update({
      where: { id: ctoonId },
      data: { totalMinted: { increment: 1 } },
      select: { totalMinted: true, initialQuantity: true, quantity: true }
    })
    const mintNumber = updated.totalMinted
    if (updated.quantity !== null && mintNumber > updated.quantity) {
      throw new Error('sold out')
    }
    const isFirstEdition =
      updated.initialQuantity === null || mintNumber <= updated.initialQuantity

    const uc = await tx.userCtoon.create({
      data: { userId, ctoonId, mintNumber, isFirstEdition },
      select: { id: true, mintNumber: true }
    })
    await tx.ctoonOwnerLog.create({
      data: { userId, ctoonId, userCtoonId: uc.id, mintNumber: uc.mintNumber }
    })
    await tx.cmartPurchaseLog.create({ data: { userId, ctoonId } })
    return uc
  })
}

async function main() {
  // 1) Non-admin users with usernames
  const users = await prisma.user.findMany({
    where: { isAdmin: false, username: { not: null } },
    select: { id: true, username: true }
  })
  if (!users.length) {
    console.error('No non-admin users found.')
    process.exit(1)
  }
  const userIdSet = new Set(users.map(u => u.id))
  console.log(`Found ${users.length} non-admin users`)

  // 2) Build IP-sharing graph from LoginLog (last 90 days)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const logs = await prisma.loginLog.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, ip: true }
  })

  const userIps = new Map()    // userId -> Set<ip>
  const ipUsers = new Map()    // ip -> Set<userId>
  for (const { userId, ip } of logs) {
    if (!userIps.has(userId)) userIps.set(userId, new Set())
    userIps.get(userId).add(ip)
    if (!ipUsers.has(ip)) ipUsers.set(ip, new Set())
    ipUsers.get(ip).add(userId)
  }

  function sharesIp(a, b) {
    const ipsA = userIps.get(a)
    if (!ipsA) return false
    for (const ip of ipsA) {
      if (ipUsers.get(ip)?.has(b)) return true
    }
    return false
  }

  // 3) Pick cheaters from up to 2 of the largest shared-IP groups
  const sharedIpGroups = Array.from(ipUsers.entries())
    .map(([ip, peers]) => ({
      ip,
      peers: Array.from(peers).filter(id => userIdSet.has(id))
    }))
    .filter(g => g.peers.length > 1)
    .sort((a, b) => b.peers.length - a.peers.length)

  const cheaterPairs = []
  const cheaterIds = new Set()
  for (const grp of sharedIpGroups.slice(0, 2)) {
    cheaterPairs.push({ ip: grp.ip, users: [grp.peers[0], grp.peers[1]] })
    cheaterIds.add(grp.peers[0])
    cheaterIds.add(grp.peers[1])
  }

  // 4) cMart ctoons available for purchase
  const allCmart = await prisma.ctoon.findMany({
    where: {
      inCmart: true,
      codeOnly: false,
      releaseDate: { lte: new Date() },
      holidayItems: { none: {} }
    },
    select: {
      id: true, name: true, price: true,
      quantity: true, totalMinted: true
    }
  })
  const availableCmart = allCmart.filter(c =>
    c.quantity === null || c.totalMinted < c.quantity
  )
  if (!availableCmart.length) {
    console.warn('No cmart ctoons available — skipping purchases')
  }

  // 5) Per-user seed loop
  let pointsAwarded = 0
  let ctoonsMinted = 0
  let tradesCreated = 0

  for (const user of users) {
    // -- Points: add 100-10000, log it
    const gain = 100 + randomInt(9901)
    const updated = await prisma.userPoints.upsert({
      where: { userId: user.id },
      update: { points: { increment: gain } },
      create: { userId: user.id, points: gain }
    })
    await prisma.pointsLog.create({
      data: {
        userId: user.id,
        points: gain,
        total: updated.points,
        method: 'seed grant',
        direction: 'increase'
      }
    })
    pointsAwarded += gain

    // -- cToons: 1-3 random from cmart (no payment for the seed)
    if (availableCmart.length) {
      const count = 1 + randomInt(3)
      const picks = pickN(availableCmart, Math.min(count, availableCmart.length))
      for (const c of picks) {
        try {
          await mintCtoonForUser(user.id, c.id)
          ctoonsMinted++
        } catch (e) {
          // sold out or transient — skip silently
        }
      }
    }

    // -- Trades: at least 3 as initiator
    const peers = users.filter(u => u.id !== user.id)
    const intraPeers = peers.filter(p => sharesIp(user.id, p.id))
    const interPeers = peers.filter(p => !sharesIp(user.id, p.id))

    let recipients
    if (cheaterIds.has(user.id) && intraPeers.length) {
      // Cheater: 1-2 to intra-IP peers, plus enough inter-IP trades to reach 3-4 total
      const intraCount = Math.min(intraPeers.length, 1 + randomInt(2))
      const interCount = Math.max(0, 3 + randomInt(2) - intraCount)
      recipients = [
        ...pickN(intraPeers, intraCount),
        ...pickN(interPeers, Math.min(interCount, interPeers.length))
      ]
    } else {
      // Normal user: 3-4 trades to non-IP-shared peers (fall back to any peer if pool is empty)
      const count = 3 + randomInt(2)
      const pool = interPeers.length ? interPeers : peers
      recipients = pickN(pool, Math.min(count, pool.length))
    }

    for (const r of recipients) {
      await prisma.tradeOffer.create({
        data: {
          initiatorId: user.id,
          recipientId: r.id,
          pointsOffered: 0,
          status: 'PENDING'
        }
      })
      tradesCreated++
    }
  }

  console.log('\nSeeded:')
  console.log(`  Points awarded: ${pointsAwarded.toLocaleString()}`)
  console.log(`  cToons minted:  ${ctoonsMinted}`)
  console.log(`  TradeOffers:    ${tradesCreated}`)
  if (cheaterPairs.length) {
    console.log('\nCheater pairs (will turn Cheat Finder cards yellow):')
    for (const p of cheaterPairs) {
      const names = p.users.map(id => users.find(u => u.id === id)?.username || id)
      console.log(`  ${p.ip} -> ${names.join(' <-> ')}`)
    }
  } else {
    console.log('\n(No shared-IP groups found — run prisma/seedAuthLogs.js first if you want yellow-card cheaters.)')
  }
}

main()
  .catch(e => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => {})
