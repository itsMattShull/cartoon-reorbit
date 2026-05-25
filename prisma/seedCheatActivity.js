// prisma/seedCheatActivity.js
//
// One-off dev seed:
//   1. For every active, non-banned user: bump points (100..1000), buy 1..5
//      random affordable cMart ctoons, then complete 3 random 1-for-1 ctoon
//      trades with other users. Every 3rd user (by ordinal) also transfers
//      5 points to their first trade partner.
//   2. Then for each duplicate-IP group in the Cheat Finder, pick the first
//      two aliases (sorted by username) and run a 1-for-1 ctoon trade.
//
// Not idempotent: re-running keeps adding rows. Intended for dev only.

import 'dotenv/config'
import { prisma } from '../server/prisma.js'

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const counters = {
  pointsAwarded: 0,
  ctoonsBought: 0,
  tradesCompleted: 0,
  pointsTraded: 0,
  duplicateIpTrades: 0,
  skipped: 0
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function awardPoints(userId, amount, reason) {
  const updated = await prisma.userPoints.upsert({
    where: { userId },
    update: { points: { increment: amount } },
    create: { userId, points: amount }
  })
  await prisma.pointsLog.create({
    data: {
      userId,
      points: amount,
      total: updated.points,
      method: reason,
      direction: 'increase'
    }
  })
}

async function fetchBuyableCtoons() {
  // cMart-eligible ctoons that aren't gated by an active holiday event.
  const now = new Date()
  const ctoons = await prisma.ctoon.findMany({
    where: {
      inCmart: true,
      OR: [
        { releaseDate: null },
        { releaseDate: { lte: now } }
      ]
    },
    select: {
      id: true,
      price: true,
      quantity: true,
      totalMinted: true,
      initialQuantity: true
    }
  })

  // Drop ctoons with any HolidayEventItem rows — avoids the holiday gating logic.
  const ids = ctoons.map((c) => c.id)
  const holidayIds = new Set(
    (await prisma.holidayEventItem.findMany({
      where: { ctoonId: { in: ids } },
      select: { ctoonId: true }
    })).map((h) => h.ctoonId)
  )

  return ctoons
    .filter((c) => !holidayIds.has(c.id))
    .filter((c) => c.quantity === null || c.totalMinted < c.quantity)
}

async function buyOne(userId, ctoonId, price) {
  // Mirrors mint.worker.js but with the dev-only checks stripped.
  return prisma.$transaction(async (tx) => {
    const updatedCtoon = await tx.ctoon.update({
      where: { id: ctoonId },
      data: { totalMinted: { increment: 1 } },
      select: { totalMinted: true, initialQuantity: true, quantity: true }
    })
    const mintNumber = updatedCtoon.totalMinted
    if (updatedCtoon.quantity !== null && mintNumber > updatedCtoon.quantity) {
      throw new Error('sold out')
    }
    const isFirstEdition =
      updatedCtoon.initialQuantity === null || mintNumber <= updatedCtoon.initialQuantity

    const points = await tx.userPoints.update({
      where: { userId },
      data: { points: { decrement: price } }
    })
    await tx.pointsLog.create({
      data: {
        userId,
        points: price,
        total: points.points,
        method: 'Bought cToon',
        direction: 'decrease'
      }
    })

    const uc = await tx.userCtoon.create({
      data: { userId, ctoonId, mintNumber, isFirstEdition },
      select: { id: true, mintNumber: true, ctoonId: true }
    })
    await tx.ctoonOwnerLog.create({
      data: { userId, ctoonId, userCtoonId: uc.id, mintNumber: uc.mintNumber }
    })
    await tx.cmartPurchaseLog.create({
      data: { userId, ctoonId }
    })
    return uc
  })
}

async function pickTradeableCtoon(userId) {
  // One random tradeable, owned ctoon for this user.
  const candidates = await prisma.userCtoon.findMany({
    where: { userId, isTradeable: true, burnedAt: null, inCzone: false },
    select: { id: true, ctoonId: true, mintNumber: true }
  })
  return candidates.length ? pick(candidates) : null
}

async function completeTrade(userAId, ucA, userBId, ucB, extraPointsFromAtoB = 0) {
  // Creates a TradeRoom with two confirmed Trade rows and swaps ownership of
  // the two UserCtoons. Optionally also transfers points A → B.
  const roomName = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await prisma.$transaction(async (tx) => {
    const room = await tx.tradeRoom.create({
      data: {
        name: roomName,
        active: false,
        traderAId: userAId,
        traderBId: userBId
      },
      select: { id: true }
    })

    const tradeA = await tx.trade.create({
      data: { userId: userAId, roomId: room.id, confirmed: true },
      select: { id: true }
    })
    const tradeB = await tx.trade.create({
      data: { userId: userBId, roomId: room.id, confirmed: true },
      select: { id: true }
    })
    await tx.tradeCtoon.create({
      data: { tradeId: tradeA.id, userCtoonId: ucA.id }
    })
    await tx.tradeCtoon.create({
      data: { tradeId: tradeB.id, userCtoonId: ucB.id }
    })

    // Swap ownership
    await tx.userCtoon.update({ where: { id: ucA.id }, data: { userId: userBId } })
    await tx.userCtoon.update({ where: { id: ucB.id }, data: { userId: userAId } })

    await tx.ctoonOwnerLog.create({
      data: { userId: userBId, ctoonId: ucA.ctoonId, userCtoonId: ucA.id, mintNumber: ucA.mintNumber }
    })
    await tx.ctoonOwnerLog.create({
      data: { userId: userAId, ctoonId: ucB.ctoonId, userCtoonId: ucB.id, mintNumber: ucB.mintNumber }
    })

    if (extraPointsFromAtoB > 0) {
      const aPts = await tx.userPoints.findUnique({ where: { userId: userAId }, select: { points: true } })
      if ((aPts?.points || 0) >= extraPointsFromAtoB) {
        const aUpd = await tx.userPoints.update({
          where: { userId: userAId },
          data: { points: { decrement: extraPointsFromAtoB } }
        })
        await tx.pointsLog.create({
          data: {
            userId: userAId,
            points: extraPointsFromAtoB,
            total: aUpd.points,
            method: 'Requested Trade',
            direction: 'decrease'
          }
        })
        const bUpd = await tx.userPoints.upsert({
          where: { userId: userBId },
          update: { points: { increment: extraPointsFromAtoB } },
          create: { userId: userBId, points: extraPointsFromAtoB }
        })
        await tx.pointsLog.create({
          data: {
            userId: userBId,
            points: extraPointsFromAtoB,
            total: bUpd.points,
            method: 'Accepted Trade',
            direction: 'increase'
          }
        })
        counters.pointsTraded += extraPointsFromAtoB
      }
    }
  })
}

// ── Phase 1: per user ───────────────────────────────────────────────────────

async function phaseOne(users) {
  console.log(`Phase 1: ${users.length} users`)

  const buyable = await fetchBuyableCtoons()
  if (!buyable.length) {
    console.log('  (no buyable cMart ctoons found — skipping purchases)')
  }

  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    const isThird = (i + 1) % 3 === 0
    try {
      // 1. Award points
      const award = randInt(100, 1000)
      await awardPoints(user.id, award, 'Seed cheat-activity grant')
      counters.pointsAwarded += award

      // 2. Buy 1..5 affordable ctoons
      const buyTarget = randInt(1, 5)
      let purchased = 0
      const affordableShuffled = shuffle(buyable)
      for (const c of affordableShuffled) {
        if (purchased >= buyTarget) break
        // Refresh wallet view per attempt
        const wallet = await prisma.userPoints.findUnique({
          where: { userId: user.id },
          select: { points: true }
        })
        if (!wallet || wallet.points < c.price) continue
        try {
          await buyOne(user.id, c.id, c.price)
          purchased += 1
          counters.ctoonsBought += 1
          // Mutate local snapshot's totalMinted so we don't re-pick a now-sold-out ctoon.
          c.totalMinted += 1
        } catch {
          // Sold out under us / race — try the next candidate.
        }
      }

      // 3. Three 1-for-1 trades with random other users
      const otherUsers = users.filter((u) => u.id !== user.id)
      const partners = shuffle(otherUsers).slice(0, 3)
      let tradeCount = 0
      for (const partner of partners) {
        const ucA = await pickTradeableCtoon(user.id)
        const ucB = await pickTradeableCtoon(partner.id)
        if (!ucA || !ucB) {
          counters.skipped += 1
          continue
        }
        // Every 3rd user moves 5 extra points on their first trade.
        const extraPoints = isThird && tradeCount === 0 ? 5 : 0
        try {
          await completeTrade(user.id, ucA, partner.id, ucB, extraPoints)
          counters.tradesCompleted += 1
          tradeCount += 1
        } catch (e) {
          counters.skipped += 1
        }
      }
    } catch (e) {
      console.error(`  user ${user.username || user.id} failed:`, e.message)
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  …${i + 1}/${users.length} users processed`)
    }
  }
}

// ── Phase 2: duplicate-IP groups ────────────────────────────────────────────

async function phaseTwo() {
  console.log('Phase 2: duplicate-IP groups')
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const logs = await prisma.loginLog.findMany({
    where: { createdAt: { gte: since } },
    select: { ip: true, userId: true, user: { select: { username: true } } }
  })

  // Build (ip → Map<username, userId>)
  const byIp = new Map()
  for (const l of logs) {
    if (!l.ip || !l.user?.username) continue
    if (!byIp.has(l.ip)) byIp.set(l.ip, new Map())
    byIp.get(l.ip).set(l.user.username, l.userId)
  }

  const groups = [...byIp.entries()]
    .filter(([, m]) => m.size > 1)
    .map(([ip, m]) => {
      const aliases = [...m.entries()]
        .map(([username, userId]) => ({ username, userId }))
        .sort((a, b) => a.username.localeCompare(b.username))
      return { ip, aliases }
    })

  console.log(`  found ${groups.length} duplicate-IP groups`)

  for (const g of groups) {
    const a = g.aliases[0]
    const b = g.aliases[1]
    if (!a || !b) continue
    const ucA = await pickTradeableCtoon(a.userId)
    const ucB = await pickTradeableCtoon(b.userId)
    if (!ucA || !ucB) {
      counters.skipped += 1
      continue
    }
    try {
      await completeTrade(a.userId, ucA, b.userId, ucB, 0)
      counters.duplicateIpTrades += 1
      counters.tradesCompleted += 1
    } catch (e) {
      counters.skipped += 1
      console.error(`  trade ${a.username} ↔ ${b.username} failed:`, e.message)
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const users = await prisma.user.findMany({
    where: { active: true, banned: false, username: { not: null } },
    select: { id: true, username: true },
    orderBy: { createdAt: 'asc' }
  })

  if (!users.length) {
    console.log('No eligible users found.')
    return
  }

  await phaseOne(users)
  await phaseTwo()

  console.log('\n── Summary ──')
  console.log(`Points awarded:        ${counters.pointsAwarded}`)
  console.log(`Ctoons bought:         ${counters.ctoonsBought}`)
  console.log(`Trades completed:      ${counters.tradesCompleted}`)
  console.log(`  via duplicate IPs:   ${counters.duplicateIpTrades}`)
  console.log(`Extra points traded:   ${counters.pointsTraded}`)
  console.log(`Skipped (no ctoon):    ${counters.skipped}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
