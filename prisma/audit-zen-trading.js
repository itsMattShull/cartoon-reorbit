// prisma/audit-zen-trading.js
//
// Audits cToons and points that ZenVikingGuru received from five suspect accounts
// via the TradeRoom system, TradeOffer system, and Auctions.
//
// Usage:
//   node prisma/audit-zen-trading.js            (dry-run report, no changes)
//   node prisma/audit-zen-trading.js --commit    (apply point removals + ownership transfers)

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../server/prisma.js'

const COMMIT = process.argv.includes('--commit')

const ZEN_USERNAME      = 'ZenVikingGuru'
const OFFICIAL_USERNAME = 'CartoonReOrbitOfficial'
const SUSPECT_USERNAMES = [
  'LoopyWarriorWarrior',
  'GalaxyJumperDruid',
  'RockinBotSuperstar',
  'GroovyOtterWizard',
  'UltraGoblinWarrior',
  'ChillSquirrelAgent',
  'GlitchyPixelArchitect',
]

// Hardcoded fallback prices per rarity (used if GlobalGameConfig row is missing)
const FALLBACK_RARITY_PRICES = {
  'Common':       100,
  'Uncommon':     200,
  'Rare':         400,
  'Very Rare':    750,
  'Crazy Rare':   1250,
  'Auction Only': 0,
  'Prize Only':   0,
  'Code Only':    0,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cmartPriceForRarity(rarity, dbDefaults) {
  const key = (rarity || '').trim()
  if (dbDefaults[key]?.price !== undefined) return dbDefaults[key].price
  return FALLBACK_RARITY_PRICES[key] ?? 0
}

async function loadRarityDefaults() {
  const row = await prisma.globalGameConfig.findFirst({
    select: { rarityDefaults: true },
  })
  const db = row?.rarityDefaults ?? {}
  // Merge: hardcoded fallbacks first, DB values override
  const merged = {}
  for (const [k, v] of Object.entries(FALLBACK_RARITY_PRICES)) merged[k] = { price: v }
  for (const [k, v] of Object.entries(db)) {
    if (typeof v === 'object' && v !== null) merged[k] = v
  }
  return merged
}

async function avgAuctionPriceForCtoon(ctoonId) {
  // Fetch all UserCtoon IDs for this ctoon type, then average highestBid on closed won auctions
  const ucs = await prisma.userCtoon.findMany({
    where: { ctoonId },
    select: { id: true },
  })
  const ucIds = ucs.map(u => u.id)
  if (!ucIds.length) return { avg: 0, auctionCount: 0 }

  const agg = await prisma.auction.aggregate({
    where: {
      userCtoonId: { in: ucIds },
      status: 'CLOSED',
      winnerId: { not: null },
      highestBid: { gt: 0 },
    },
    _avg:   { highestBid: true },
    _count: { id: true },
  })
  return {
    avg:          Math.round(agg._avg.highestBid ?? 0),
    auctionCount: agg._count.id,
  }
}

function sep(label) {
  const line = '━'.repeat(62)
  console.log(`\n${line}`)
  if (label) console.log(label)
  console.log(line)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== ZenVikingGuru Trade Audit ===')
  console.log(`Mode: ${COMMIT ? '** COMMIT — changes will be applied **' : 'DRY RUN — no changes'}`)

  // ── 1. Resolve users ─────────────────────────────────────────────────────

  const allNames = [ZEN_USERNAME, OFFICIAL_USERNAME, ...SUSPECT_USERNAMES]
  const users = await prisma.user.findMany({
    where:  { username: { in: allNames } },
    select: { id: true, username: true },
  })
  const idByName  = new Map(users.map(u => [u.username, u.id]))
  const nameById  = new Map(users.map(u => [u.id, u.username]))

  const missing = allNames.filter(n => !idByName.has(n))
  if (missing.length) throw new Error(`Unknown username(s): ${missing.join(', ')}`)

  const zenId      = idByName.get(ZEN_USERNAME)
  const officialId = idByName.get(OFFICIAL_USERNAME)
  const suspectIds = SUSPECT_USERNAMES.map(n => idByName.get(n))
  const suspectSet = new Set(suspectIds)

  // ── 2. Rarity defaults ───────────────────────────────────────────────────

  const rarityDefaults = await loadRarityDefaults()

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION A — TradeRoom / Trade system
  // ══════════════════════════════════════════════════════════════════════════

  const tradeRooms = await prisma.tradeRoom.findMany({
    where: {
      OR: [
        { traderAId: zenId,                traderBId: { in: suspectIds } },
        { traderAId: { in: suspectIds },   traderBId: zenId },
      ],
    },
    select: { id: true, traderAId: true, traderBId: true },
  })

  const roomIds = tradeRooms.map(r => r.id)

  // Load all Trade records for those rooms
  const allTrades = await prisma.trade.findMany({
    where:  { roomId: { in: roomIds } },
    select: { id: true, roomId: true, userId: true, confirmed: true },
  })

  const tradesByRoom = new Map()
  for (const t of allTrades) {
    if (!tradesByRoom.has(t.roomId)) tradesByRoom.set(t.roomId, [])
    tradesByRoom.get(t.roomId).push(t)
  }

  // Separate into confirmed (both sides confirmed) vs pending
  const confirmedRoomIds = []
  const pendingRoomsBySuspect = new Map() // suspectUsername → count

  for (const room of tradeRooms) {
    const trades      = tradesByRoom.get(room.id) ?? []
    const allConfirmed = trades.length > 0 && trades.every(t => t.confirmed)
    if (allConfirmed) {
      confirmedRoomIds.push(room.id)
    } else {
      const suspectId   = suspectSet.has(room.traderAId) ? room.traderAId : room.traderBId
      const suspectName = nameById.get(suspectId) ?? suspectId
      pendingRoomsBySuspect.set(suspectName, (pendingRoomsBySuspect.get(suspectName) ?? 0) + 1)
    }
  }

  // From confirmed rooms: gather ctoons the SUSPECT put in (which go TO zen)
  const suspectTradeIds = []
  for (const roomId of confirmedRoomIds) {
    for (const t of tradesByRoom.get(roomId) ?? []) {
      if (suspectSet.has(t.userId)) suspectTradeIds.push(t.id)
    }
  }

  const tradeRoomCtoons = suspectTradeIds.length
    ? await prisma.tradeCtoon.findMany({
        where:  { tradeId: { in: suspectTradeIds } },
        select: {
          userCtoonId: true,
          userCtoon: {
            select: {
              id: true, userId: true, burnedAt: true,
              ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true } },
            },
          },
        },
      })
    : []

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION B — TradeOffer system
  // ══════════════════════════════════════════════════════════════════════════

  // Case 1: suspect initiated → zen is recipient → OFFERED ctoons go TO zen
  const offersInitBySuspect = await prisma.tradeOffer.findMany({
    where: {
      status:      'ACCEPTED',
      initiatorId: { in: suspectIds },
      recipientId: zenId,
    },
    select: {
      id: true, initiatorId: true, pointsOffered: true,
      ctoons: {
        where:  { role: 'OFFERED' },
        select: {
          userCtoonId: true,
          userCtoon: {
            select: {
              id: true, userId: true, burnedAt: true,
              ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true } },
            },
          },
        },
      },
    },
  })

  // Case 2: zen initiated → suspect is recipient → REQUESTED ctoons come FROM suspect TO zen
  const offersInitByZen = await prisma.tradeOffer.findMany({
    where: {
      status:      'ACCEPTED',
      initiatorId: zenId,
      recipientId: { in: suspectIds },
    },
    select: {
      id: true, recipientId: true,
      ctoons: {
        where:  { role: 'REQUESTED' },
        select: {
          userCtoonId: true,
          userCtoon: {
            select: {
              id: true, userId: true, burnedAt: true,
              ctoonId: true, mintNumber: true,
              ctoon: { select: { id: true, name: true, rarity: true } },
            },
          },
        },
      },
    },
  })

  // Points zen received when suspect was initiator (suspect paid zen)
  const tradeOfferPointsToZen = offersInitBySuspect.reduce((sum, o) => sum + (o.pointsOffered ?? 0), 0)

  // Pending TradeOffers (info only)
  const pendingOffers = await prisma.tradeOffer.findMany({
    where: {
      status: 'PENDING',
      OR: [
        { initiatorId: { in: suspectIds }, recipientId: zenId },
        { initiatorId: zenId,             recipientId: { in: suspectIds } },
      ],
    },
    select: { id: true, initiatorId: true, recipientId: true, pointsOffered: true },
  })

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION C — Collate all ctoon instances traded TO zen
  // ══════════════════════════════════════════════════════════════════════════

  // Build deduplicated map: userCtoonId → userCtoon record
  const tradedToZen = new Map()

  for (const tc of tradeRoomCtoons) {
    tradedToZen.set(tc.userCtoonId, tc.userCtoon)
  }
  for (const offer of offersInitBySuspect) {
    for (const tc of offer.ctoons) tradedToZen.set(tc.userCtoonId, tc.userCtoon)
  }
  for (const offer of offersInitByZen) {
    for (const tc of offer.ctoons) tradedToZen.set(tc.userCtoonId, tc.userCtoon)
  }

  // Aggregate by Ctoon type
  // ctoonId → { name, rarity, total, instances: [userCtoonId, ...] }
  const ctoonStats = new Map()
  for (const uc of tradedToZen.values()) {
    if (!uc?.ctoon) continue
    const c = uc.ctoon
    if (!ctoonStats.has(c.id)) {
      ctoonStats.set(c.id, { name: c.name, rarity: c.rarity, total: 0, instances: [] })
    }
    const stat = ctoonStats.get(c.id)
    stat.total++
    stat.instances.push(uc.id)
  }

  // Which specific instances does zen still own?
  const allInstanceIds = [...tradedToZen.keys()]
  const zenCurrentOwned = allInstanceIds.length
    ? await prisma.userCtoon.findMany({
        where:  { id: { in: allInstanceIds }, userId: zenId, burnedAt: null },
        select: { id: true },
      })
    : []
  const zenOwnsSet = new Set(zenCurrentOwned.map(u => u.id))

  // Avg auction prices per ctoon type
  const avgPriceByCtoon = new Map() // ctoonId → { avg, auctionCount }
  for (const ctoonId of ctoonStats.keys()) {
    avgPriceByCtoon.set(ctoonId, await avgAuctionPriceForCtoon(ctoonId))
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION D — Auctions (zen sold, suspect won)
  // ══════════════════════════════════════════════════════════════════════════

  const suspectWonAuctions = await prisma.auction.findMany({
    where: {
      creatorId: zenId,
      status:    'CLOSED',
      winnerId:  { in: suspectIds },
    },
    select: {
      id: true, highestBid: true, winnerId: true,
      userCtoon: { select: { ctoon: { select: { name: true } } } },
    },
  })
  const auctionPointsToZen = suspectWonAuctions.reduce((sum, a) => sum + (a.highestBid ?? 0), 0)

  // ══════════════════════════════════════════════════════════════════════════
  // COMPUTE TOTALS for report & commit
  // ══════════════════════════════════════════════════════════════════════════

  let totalCtoonPointValue = 0
  const ctoonRows = [] // for printing

  for (const [ctoonId, stat] of ctoonStats) {
    const ownedCount    = stat.instances.filter(id =>  zenOwnsSet.has(id)).length
    const notOwnedCount = stat.instances.filter(id => !zenOwnsSet.has(id)).length
    const rarityPx      = cmartPriceForRarity(stat.rarity, rarityDefaults)
    const { avg: avgPx, auctionCount } = avgPriceByCtoon.get(ctoonId)
    const unitPrice     = Math.max(rarityPx, avgPx)
    const lostValue     = unitPrice * notOwnedCount
    totalCtoonPointValue += lostValue

    ctoonRows.push({
      ctoonId, name: stat.name, rarity: stat.rarity,
      total: stat.total, ownedCount, notOwnedCount,
      rarityPx, avgPx, auctionCount, unitPrice, lostValue,
      instances: stat.instances,
    })
  }

  const totalPointsToRemove = totalCtoonPointValue + tradeOfferPointsToZen + auctionPointsToZen

  // ══════════════════════════════════════════════════════════════════════════
  // PRINT REPORT
  // ══════════════════════════════════════════════════════════════════════════

  sep('SECTION 1 — cToons Traded TO ZenVikingGuru (TradeRoom + TradeOffer)')

  if (!ctoonRows.length) {
    console.log('  (none found)')
  } else {
    for (const row of ctoonRows) {
      const priceSource = row.avgPx > row.rarityPx
        ? `avg auction (${row.avgPx} pts, ${row.auctionCount} auctions) beats cMart (${row.rarityPx} pts)`
        : `cMart (${row.rarityPx} pts) >= avg auction (${row.avgPx} pts, ${row.auctionCount} auctions)`

      console.log(`\n  ${row.name}  [${row.rarity}]`)
      console.log(`    Traded to ZenVikingGuru    : ${row.total}`)
      console.log(`    Still owned by him         : ${row.ownedCount}`)
      console.log(`    No longer owned            : ${row.notOwnedCount}`)
      console.log(`    Unit value used            : ${row.unitPrice} pts  (${priceSource})`)
      console.log(`    Point value (not owned)    : ${row.lostValue} pts`)
    }
    console.log(`\n  ── SUBTOTAL (ctoon trade value, no longer owned): ${totalCtoonPointValue} pts`)
  }

  sep('SECTION 2 — Points Received via TradeOffer (pointsOffered from suspects)')

  console.log(`  Accepted offers where a suspect was initiator & ZenVikingGuru was recipient: ${offersInitBySuspect.length}`)
  for (const o of offersInitBySuspect) {
    const who = nameById.get(o.initiatorId) ?? o.initiatorId
    console.log(`    • ${who}  →  pointsOffered: ${o.pointsOffered} pts`)
  }
  console.log(`\n  ── SUBTOTAL: ${tradeOfferPointsToZen} pts`)

  sep('SECTION 3 — Auction Points Received by ZenVikingGuru')

  console.log(`  Closed auctions listed by ZenVikingGuru, won by a suspect: ${suspectWonAuctions.length}`)
  for (const a of suspectWonAuctions) {
    const winner = nameById.get(a.winnerId) ?? a.winnerId
    console.log(`    • ${a.userCtoon?.ctoon?.name ?? '(unknown)'}  —  winner: ${winner}  —  ${a.highestBid} pts`)
  }
  console.log(`\n  ── SUBTOTAL: ${auctionPointsToZen} pts`)

  sep('SECTION 4 — Pending Trades (informational, NOT included in commit)')

  console.log(`  Pending TradeRoom sessions: ${[...pendingRoomsBySuspect.values()].reduce((s, v) => s + v, 0)}`)
  for (const [name, count] of pendingRoomsBySuspect) {
    console.log(`    • ${name}: ${count} room(s)`)
  }
  console.log(`  Pending TradeOffers: ${pendingOffers.length}`)
  for (const o of pendingOffers) {
    const isSuspectInitiator = suspectSet.has(o.initiatorId)
    const suspectName = nameById.get(isSuspectInitiator ? o.initiatorId : o.recipientId) ?? '?'
    const role = isSuspectInitiator ? 'initiator' : 'recipient'
    console.log(`    • ${suspectName} (${role})  —  pointsOffered: ${o.pointsOffered} pts`)
  }

  sep('SUMMARY')

  console.log(`  cToon trade value (ctoons no longer owned) : ${totalCtoonPointValue} pts`)
  console.log(`  TradeOffer points received from suspects   : ${tradeOfferPointsToZen} pts`)
  console.log(`  Auction proceeds from suspects             : ${auctionPointsToZen} pts`)
  console.log(`  ─────────────────────────────────────────────────────`)
  console.log(`  TOTAL to remove from ZenVikingGuru         : ${totalPointsToRemove} pts`)

  const ctoonStillOwnedIds = [...zenOwnsSet] // specific UserCtoon IDs zen still holds from these trades
  console.log(`  cToons zen still owns (to transfer to CRO) : ${ctoonStillOwnedIds.length}`)

  if (!COMMIT) {
    console.log('\n  (Run with --commit to apply all changes above)\n')
    return
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMIT CHANGES
  // ══════════════════════════════════════════════════════════════════════════

  sep('APPLYING CHANGES')

  // ── Step 1: Points transfer ──────────────────────────────────────────────

  if (totalPointsToRemove > 0) {
    await prisma.$transaction(async (tx) => {
      // Deduct from ZenVikingGuru
      const zenPts = await tx.userPoints.upsert({
        where:  { userId: zenId },
        update: { points: { decrement: totalPointsToRemove } },
        create: { userId: zenId, points: -totalPointsToRemove },
      })
      await tx.pointsLog.create({
        data: {
          userId:    zenId,
          direction: 'decrease',
          points:    totalPointsToRemove,
          total:     zenPts.points,
          method:    'TRADE_AUDIT_REVOKE',
        },
      })

      // Add to CartoonReOrbitOfficial
      const offPts = await tx.userPoints.upsert({
        where:  { userId: officialId },
        update: { points: { increment: totalPointsToRemove } },
        create: { userId: officialId, points: totalPointsToRemove },
      })
      await tx.pointsLog.create({
        data: {
          userId:    officialId,
          direction: 'increase',
          points:    totalPointsToRemove,
          total:     offPts.points,
          method:    'TRADE_AUDIT_REVOKE',
        },
      })
    })
    console.log(`\n  ✓ Transferred ${totalPointsToRemove} pts  ZenVikingGuru → CartoonReOrbitOfficial`)
  } else {
    console.log('\n  (no points to transfer)')
  }

  // ── Step 2: Transfer ctoons zen still owns to CartoonReOrbitOfficial ─────

  if (ctoonStillOwnedIds.length) {
    let transferred = 0
    for (const ucId of ctoonStillOwnedIds) {
      try {
        await prisma.$transaction(async (tx) => {
          const uc = await tx.userCtoon.update({
            where: { id: ucId },
            data:  { userId: officialId, isTradeable: false },
          })

          // Remove any trade list entries that no longer apply
          await tx.userTradeListItem.deleteMany({
            where: { userCtoonId: ucId, userId: { not: officialId } },
          })

          // Log ownership change
          await tx.ctoonOwnerLog.create({
            data: {
              userId:      officialId,
              ctoonId:     uc.ctoonId,
              userCtoonId: uc.id,
              mintNumber:  uc.mintNumber,
            },
          })
        })
        transferred++
      } catch (err) {
        console.error(`  ✗ Failed to transfer UserCtoon ${ucId}: ${err.message}`)
      }
    }
    console.log(`  ✓ Transferred ${transferred} / ${ctoonStillOwnedIds.length} cToon(s) to CartoonReOrbitOfficial`)
  } else {
    console.log('  (no ctoons to transfer — ZenVikingGuru no longer holds any from these trades)')
  }

  console.log('\n  Done.\n')
}

main()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
