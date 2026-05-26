// prisma/fixSaiyanSagaOverpurchase.js
//
// Remediation script for the Saiyan Saga time-based release over-purchase bug.
// Users were able to purchase more cToons per rarity than the enforced limit.
//
// ── What this script does ─────────────────────────────────────────────────────
//
// Phase 1 – Discovery
//   • Finds all cToons in the "Saiyan Saga" set (Ctoon.set = 'Saiyan Saga')
//   • Loads per-rarity purchase limits from GlobalGameConfig.timeBasedPurchaseLimits
//     (falls back to hardcoded defaults matching the admin screenshot:
//      Common=5, Uncommon=4, Rare=3, Very Rare=2, Crazy Rare=1)
//   • Identifies excess UserCtoon records using CmartPurchaseLog as the source
//     of truth: the first N logs per user per cToon are valid; the rest are excess
//   • Matches each excess CmartPurchaseLog to its corresponding UserCtoon by
//     sorted createdAt order (both created in the same DB transaction)
//
// Phase 2 – Auction cleanup (for excess UserCtoon IDs)
//   • ACTIVE auctions: release highest bidder's locked points, delete
//     bids / auto-bids, delete the auction record
//   • CLOSED auctions (fully undo): refund winner their highestBid, claw back
//     the same amount from the auction creator, delete bids / auto-bids /
//     auction record
//
// Phase 3 – Trade cleanup (for excess UserCtoon IDs)
//   • PENDING trade offers: withdraw, release initiator's active locked points
//   • ACCEPTED trade offers (fully undo): return non-excess cToons to their
//     pre-trade owners (skips if the cToon has since moved again), reverse any
//     points transferred in the trade
//
// Phase 4 – Misc FK cleanup
//   • AuctionOnly listings, DissolveAuctionQueue, UserTradeListItem,
//     TradeCtoon (old-style trade rooms), TradeOfferCtoon join rows
//
// Phase 5 – Delete excess UserCtoon records
//
// Phase 6 – Delete excess CmartPurchaseLog records
//
// Phase 7 – Refund original purchasers (ctoon.price per excess mint via PointsLog)
//
// Phase 8 – Renumber remaining mints (sequential from 1, ordered by createdAt),
//           recalculate isFirstEdition, update Ctoon.totalMinted
//
// ── Usage ─────────────────────────────────────────────────────────────────────
//
//   node prisma/fixSaiyanSagaOverpurchase.js              # dry run (safe, no writes)
//   node prisma/fixSaiyanSagaOverpurchase.js --dry-run    # explicit dry run
//   node prisma/fixSaiyanSagaOverpurchase.js --commit     # apply all changes
//   node prisma/fixSaiyanSagaOverpurchase.js --commit --verbose  # verbose output
//
// Always run the dry run first and review the report before committing.

import { prisma } from '../server/prisma.js'

// ── Configuration ─────────────────────────────────────────────────────────────

const SET_NAME = 'Saiyan Saga'

// Fallback per-rarity purchase limits (matches the admin screenshot).
// These are overridden per-rarity by GlobalGameConfig.timeBasedPurchaseLimits
// if that config entry has a non-null count for the rarity.
const DEFAULT_LIMITS = {
  'Common':     5,
  'Uncommon':   4,
  'Rare':       3,
  'Very Rare':  2,
  'Crazy Rare': 1,
}

// ── CLI flags ─────────────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2))
const COMMIT  = argv.has('--commit')
const VERBOSE = argv.has('--verbose') || argv.has('-v')

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(...args)  { console.log(...args) }
function warn(...args) { console.warn('  ⚠️ ', ...args) }
function sep(label = '') {
  const line = '─'.repeat(72)
  log(`\n${line}`)
  if (label) log(`  ${label}`)
  log(line)
}

// Match purchase logs to UserCtoons by sorted createdAt order.
// Both records are created in the same DB transaction so timestamps align.
// Non-purchased UserCtoons (special grants) have no log counterpart and are
// left unmatched so they are not counted against the purchase limit.
function matchLogsToCtons(sortedLogs, sortedUserCtoons) {
  // Walk both lists simultaneously; each log[i] pairs with userCtoon[i].
  // If counts differ, the shorter list governs.
  const pairs = []
  const len = Math.min(sortedLogs.length, sortedUserCtoons.length)
  for (let i = 0; i < len; i++) {
    pairs.push({ log: sortedLogs[i], uc: sortedUserCtoons[i] })
  }
  // Orphaned logs (more logs than UCs)
  for (let i = len; i < sortedLogs.length; i++) {
    pairs.push({ log: sortedLogs[i], uc: null })
  }
  return pairs
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  sep(`Saiyan Saga Over-Purchase Remediation  [${COMMIT ? '** COMMIT MODE — CHANGES WILL BE WRITTEN **' : 'DRY RUN — no changes'}]`)
  log()

  // ── Phase 0: Load effective rarity limits ──────────────────────────────────
  sep('Phase 0: Loading configuration')

  const cfg = await prisma.globalGameConfig.findFirst({
    select: { timeBasedPurchaseLimits: true }
  })

  const rarityLimits = {}
  for (const [rarity, defaultLimit] of Object.entries(DEFAULT_LIMITS)) {
    let limit = defaultLimit
    try {
      const cfgEntry = cfg?.timeBasedPurchaseLimits?.[rarity]
      if (cfgEntry?.count != null) limit = Number(cfgEntry.count)
    } catch {}
    rarityLimits[rarity] = limit
  }

  log('  Effective purchase limits by rarity:')
  for (const [r, l] of Object.entries(rarityLimits)) {
    log(`    ${r.padEnd(12)}: ${l}`)
  }

  // ── Phase 1: Find cToons in the set ────────────────────────────────────────
  sep(`Phase 1: Finding cToons in set "${SET_NAME}"`)

  const ctoons = await prisma.ctoon.findMany({
    where: { set: SET_NAME },
    select: {
      id: true, name: true, rarity: true, price: true,
      totalMinted: true, initialQuantity: true
    },
    orderBy: [{ rarity: 'asc' }, { name: 'asc' }]
  })

  if (ctoons.length === 0) {
    warn(`No cToons found with set="${SET_NAME}".`)
    warn('Check the exact set name in the database and update SET_NAME if needed.')
    return
  }

  log(`  Found ${ctoons.length} cToon(s) in set "${SET_NAME}":`)
  for (const c of ctoons) {
    const limit = rarityLimits[c.rarity] ?? '?'
    log(`    [${c.rarity.padEnd(12)}] ${c.name}`)
    log(`       id=${c.id}  price=${c.price}  limit=${limit}  totalMinted=${c.totalMinted}`)
  }

  const ctoonIds = ctoons.map(c => c.id)
  const ctoonById = new Map(ctoons.map(c => [c.id, c]))

  // ── Phase 1b: Identify excess purchases ────────────────────────────────────
  sep('Phase 1b: Identifying excess purchases')

  // Load all purchase logs for these cToons, sorted for matching
  const allPurchaseLogs = await prisma.cmartPurchaseLog.findMany({
    where:   { ctoonId: { in: ctoonIds } },
    select:  { id: true, userId: true, ctoonId: true, createdAt: true },
    orderBy: [{ userId: 'asc' }, { ctoonId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
  })

  // Load all UserCtoon records for these cToons (all acquisitions, not just purchased)
  const allUserCtoons = await prisma.userCtoon.findMany({
    where:   { ctoonId: { in: ctoonIds } },
    select:  {
      id: true, userId: true, ctoonId: true,
      mintNumber: true, createdAt: true, burnedAt: true, userPurchased: true
    },
    orderBy: [{ userId: 'asc' }, { ctoonId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
  })

  // Group purchase logs by (userId, ctoonId)
  const logMap = new Map() // `${userId}::${ctoonId}` → CmartPurchaseLog[]
  for (const entry of allPurchaseLogs) {
    const key = `${entry.userId}::${entry.ctoonId}`
    if (!logMap.has(key)) logMap.set(key, [])
    logMap.get(key).push(entry)
  }

  // Group UserCtoons by (userId, ctoonId) — only userPurchased=true for pairing
  // (other acquisitions don't count against the cMart purchase limit)
  const ucMap = new Map() // `${userId}::${ctoonId}` → UserCtoon[]
  for (const uc of allUserCtoons) {
    if (!uc.userPurchased) continue
    const key = `${uc.userId}::${uc.ctoonId}`
    if (!ucMap.has(key)) ucMap.set(key, [])
    ucMap.get(key).push(uc)
  }

  // Collect excess items
  // excessItem: { userCtoonId, ctoonId, rarity, price, originalPurchaserId, purchaseLogId, mintNumber }
  const excessItems          = []
  const excessUserCtoonIds   = new Set()
  const excessPurchaseLogIds = new Set()

  // refundMap: originalPurchaserId → { count, totalRefund, details[] }
  const refundMap = new Map()

  let totalExcess = 0

  for (const [key, logs] of logMap.entries()) {
    const [userId, ctoonId] = key.split('::')
    const ctoon = ctoonById.get(ctoonId)
    if (!ctoon) continue

    const limit = rarityLimits[ctoon.rarity] ?? Infinity
    if (logs.length <= limit) continue   // within limit — nothing to do

    const userCtoons = ucMap.get(key) || []
    const pairs      = matchLogsToCtons(logs, userCtoons)
    const excessPairs = pairs.slice(limit) // everything beyond the limit

    if (!refundMap.has(userId)) {
      refundMap.set(userId, { count: 0, totalRefund: 0, details: [] })
    }
    const userRefund = refundMap.get(userId)

    for (const { log, uc } of excessPairs) {
      excessPurchaseLogIds.add(log.id)
      totalExcess++

      if (uc) {
        excessUserCtoonIds.add(uc.id)
        excessItems.push({
          userCtoonId:        uc.id,
          ctoonId,
          ctoonName:          ctoon.name,
          rarity:             ctoon.rarity,
          price:              ctoon.price,
          originalPurchaserId: userId,
          purchaseLogId:      log.id,
          mintNumber:         uc.mintNumber,
        })
        userRefund.details.push(`${ctoon.name} mint#${uc.mintNumber ?? 'null'} (ucId=${uc.id})`)
      } else {
        // No matching UserCtoon — log only; still delete the orphaned log
        warn(`No UserCtoon found for excess log ${log.id} (userId=${userId}, ctoonId=${ctoonId}, createdAt=${log.createdAt.toISOString()})`)
        excessItems.push({
          userCtoonId:        null,
          ctoonId,
          ctoonName:          ctoon.name,
          rarity:             ctoon.rarity,
          price:              ctoon.price,
          originalPurchaserId: userId,
          purchaseLogId:      log.id,
          mintNumber:         null,
        })
        userRefund.details.push(`${ctoon.name} [LOG ONLY — no UserCtoon]`)
      }

      userRefund.count++
      userRefund.totalRefund += ctoon.price
    }

    // Warn if UC count > log count (non-purchased mints mixed in)
    if (userCtoons.length > logs.length && VERBOSE) {
      warn(`userId=${userId} ctoonId=${ctoonId}: ${userCtoons.length} UserCtoons but only ${logs.length} purchase logs — ${userCtoons.length - logs.length} non-purchased mint(s) present`)
    }
  }

  const affectedUserIds = [...refundMap.keys()]
  log(`\n  Total excess purchases:     ${totalExcess}`)
  log(`  Excess UserCtoon IDs:       ${excessUserCtoonIds.size}`)
  log(`  Excess purchase log IDs:    ${excessPurchaseLogIds.size}`)
  log(`  Affected users:             ${affectedUserIds.length}`)

  if (VERBOSE || affectedUserIds.length <= 20) {
    log('\n  Excess breakdown by user:')
    for (const [userId, info] of refundMap) {
      log(`    userId=${userId}: ${info.count} excess, refund=${info.totalRefund} pts`)
      if (VERBOSE) {
        for (const d of info.details) log(`      • ${d}`)
      }
    }
  }

  if (totalExcess === 0) {
    log('\n  No excess purchases found — nothing to do.')
    return
  }

  const validUcIds = [...excessUserCtoonIds]

  // ── Phase 2: Collect auction state ─────────────────────────────────────────
  sep('Phase 2: Analyzing auctions for excess UserCtoons')

  const activeAuctions = await prisma.auction.findMany({
    where:  { userCtoonId: { in: validUcIds }, status: 'ACTIVE' },
    select: {
      id: true, userCtoonId: true,
      highestBid: true, highestBidderId: true, creatorId: true,
      _count: { select: { bids: true, autoBids: true } }
    }
  })

  const closedAuctionsRaw = await prisma.auction.findMany({
    where:  { userCtoonId: { in: validUcIds }, status: 'CLOSED' },
    select: {
      id: true, userCtoonId: true,
      highestBid: true, winnerId: true, creatorId: true,
      _count: { select: { bids: true, autoBids: true } }
    },
    orderBy: { createdAt: 'asc' }   // process oldest first
  })

  // Resolve the effective refund amount for each closed auction.
  // Auction.highestBid is set conditionally during close (only when winningBid is truthy).
  // If it is 0/null but winnerId is set, the field was not written correctly — fall back
  // to the actual winning Bid record so the summary and refunds are accurate.
  const closedAuctions = await Promise.all(closedAuctionsRaw.map(async (auction) => {
    let effectiveAmount = auction.highestBid || 0
    if (effectiveAmount === 0 && auction.winnerId) {
      const winningBid = await prisma.bid.findFirst({
        where:   { auctionId: auction.id, userId: auction.winnerId },
        orderBy: { amount: 'desc' },
        select:  { amount: true }
      })
      if (winningBid?.amount) {
        effectiveAmount = winningBid.amount
        warn(`Auction ${auction.id}: Auction.highestBid=0 but winning Bid found: ${effectiveAmount} pts — using Bid table amount`)
      }
    }
    return { ...auction, effectiveAmount }
  }))

  log(`  Active auctions to cancel:          ${activeAuctions.length}`)
  log(`  Closed auctions to fully undo:      ${closedAuctions.length}`)

  if (VERBOSE) {
    for (const a of activeAuctions) {
      log(`    [ACTIVE]  auctionId=${a.id}  bids=${a._count.bids}  highestBid=${a.highestBid}`)
    }
    for (const a of closedAuctions) {
      const amountNote = a.effectiveAmount !== (a.highestBid || 0) ? ` (resolved from Bid table)` : ''
      log(`    [CLOSED]  auctionId=${a.id}  winnerId=${a.winnerId}  highestBid=${a.highestBid}  effectiveAmount=${a.effectiveAmount}${amountNote}`)
    }
  }

  // ── Phase 3: Collect trade offer state ─────────────────────────────────────
  sep('Phase 3: Analyzing trade offers for excess UserCtoons')

  const pendingTradeOffers = await prisma.tradeOffer.findMany({
    where:  { status: 'PENDING', ctoons: { some: { userCtoonId: { in: validUcIds } } } },
    select: {
      id: true, initiatorId: true, recipientId: true, pointsOffered: true,
      ctoons: { select: { id: true, userCtoonId: true, role: true } }
    }
  })

  // Sort accepted trades by updatedAt descending so we undo the most recent first
  const acceptedTradeOffers = await prisma.tradeOffer.findMany({
    where:  { status: 'ACCEPTED', ctoons: { some: { userCtoonId: { in: validUcIds } } } },
    select: {
      id: true, initiatorId: true, recipientId: true, pointsOffered: true, updatedAt: true,
      ctoons: { select: { id: true, userCtoonId: true, role: true } }
    },
    orderBy: { updatedAt: 'desc' }   // undo most recent first
  })

  log(`  Pending trade offers to withdraw:   ${pendingTradeOffers.length}`)
  log(`  Accepted trade offers to undo:      ${acceptedTradeOffers.length}`)

  if (VERBOSE) {
    for (const t of pendingTradeOffers) {
      log(`    [PENDING]  tradeId=${t.id}  initiator=${t.initiatorId}`)
    }
    for (const t of acceptedTradeOffers) {
      const excessInTrade = t.ctoons.filter(c => excessUserCtoonIds.has(c.userCtoonId)).length
      log(`    [ACCEPTED] tradeId=${t.id}  initiator=${t.initiatorId}  excess_ctoons_in_trade=${excessInTrade}`)
    }
  }

  // Pre-compute accepted trade reversals.
  // For each accepted trade, determine which non-excess cToons need returning
  // and whether points need reversing.
  const acceptedTradeReversals = []
  for (const trade of acceptedTradeOffers) {
    const ctoonsToReturn = []

    for (const tc of trade.ctoons) {
      if (excessUserCtoonIds.has(tc.userCtoonId)) continue // excess — will be deleted

      // When accepted:
      //   OFFERED  → moved from initiator to recipient; undo: return to initiator
      //   REQUESTED → moved from recipient to initiator; undo: return to recipient
      if (tc.role === 'OFFERED') {
        ctoonsToReturn.push({
          userCtoonId:         tc.userCtoonId,
          returnToUserId:      trade.initiatorId,
          expectedCurrentUser: trade.recipientId,
        })
      } else {
        ctoonsToReturn.push({
          userCtoonId:         tc.userCtoonId,
          returnToUserId:      trade.recipientId,
          expectedCurrentUser: trade.initiatorId,
        })
      }
    }

    // pointsOffered went FROM initiator TO recipient; reverse both
    acceptedTradeReversals.push({
      tradeId:        trade.id,
      initiatorId:    trade.initiatorId,
      recipientId:    trade.recipientId,
      pointsToReverse: Math.max(0, trade.pointsOffered),
      ctoonsToReturn,
    })
  }

  // ── Phase 4: Misc FK records ────────────────────────────────────────────────
  sep('Phase 4: Analyzing misc FK records')

  const auctionOnlyListings = await prisma.auctionOnly.findMany({
    where:  { userCtoonId: { in: validUcIds } },
    select: { id: true, userCtoonId: true }
  })
  const dissolveQueueEntries = await prisma.dissolveAuctionQueue.findMany({
    where:  { userCtoonId: { in: validUcIds } },
    select: { id: true, userCtoonId: true }
  })
  const tradeListItems = await prisma.userTradeListItem.findMany({
    where:  { userCtoonId: { in: validUcIds } },
    select: { id: true, userCtoonId: true }
  })
  const tradeCtoons = await prisma.tradeCtoon.findMany({
    where:  { userCtoonId: { in: validUcIds } },
    select: { id: true, userCtoonId: true }
  })

  log(`  AuctionOnly listings to delete:     ${auctionOnlyListings.length}`)
  log(`  DissolveAuctionQueue to delete:     ${dissolveQueueEntries.length}`)
  log(`  UserTradeListItem entries to delete:${tradeListItems.length}`)
  log(`  TradeCtoon entries to delete:       ${tradeCtoons.length}`)

  // ── Phase 5: Summary ────────────────────────────────────────────────────────
  sep('Summary of planned changes')

  const totalRefundPoints = [...refundMap.values()].reduce((s, u) => s + u.totalRefund, 0)
  const totalClosedAuctionRefunds = closedAuctions.reduce((s, a) => s + a.effectiveAmount, 0)

  log(`  Excess UserCtoon records to delete:       ${excessUserCtoonIds.size}`)
  log(`  Excess CmartPurchaseLog records to delete: ${excessPurchaseLogIds.size}`)
  log(`  Active auctions to cancel:                 ${activeAuctions.length}`)
  log(`  Closed auctions to undo:                   ${closedAuctions.length}`)
  log(`  Pending trade offers to withdraw:          ${pendingTradeOffers.length}`)
  log(`  Accepted trade offers to undo:             ${acceptedTradeOffers.length}`)
  log(`  Original purchaser refunds:                ${refundMap.size} user(s), ${totalRefundPoints} total pts`)
  log(`  Closed auction winner refunds:             ${totalClosedAuctionRefunds} total pts`)
  log(`  cToons to renumber:                        ${ctoons.length}`)

  if (!COMMIT) {
    log('\n  ⬇️  DRY RUN COMPLETE — no changes were made.')
    log('  Run with --commit to apply all changes listed above.')
    log()
    return
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMIT MODE — writing changes below
  // ══════════════════════════════════════════════════════════════════════════

  sep('Applying changes (COMMIT)')

  const stats = {
    activeAuctionsCancelled:   0,
    closedAuctionsUndone:      0,
    pendingTradesWithdrawn:    0,
    acceptedTradesUndone:      0,
    ctoonsReturnedFromTrades:  0,
    ctoonsSkippedMoved:        0,
    auctionOnlyDeleted:        0,
    dissolveQueueDeleted:      0,
    tradeListDeleted:          0,
    tradeCtoonDeleted:         0,
    tradeOfferCtoonDeleted:    0,
    userCtoonsDeleted:         0,
    purchaseLogsDeleted:       0,
    auctionWinnerRefundPts:    0,
    auctionCreatorClawbackPts: 0,
    purchaserRefundPts:        0,
    usersRefunded:             0,
    mintsRenumbered:           0,
    ctoonsRenumbered:          0,
  }

  // ── 1. Cancel ACTIVE auctions ─────────────────────────────────────────────
  log('\n  [1/8] Cancelling active auctions…')
  for (const auction of activeAuctions) {
    await prisma.$transaction(async (tx) => {
      // Release highest bidder's locked points
      await tx.lockedPoints.updateMany({
        where: { contextType: 'AUCTION', contextId: auction.id, status: 'ACTIVE' },
        data:  { status: 'RELEASED' }
      })
      // Delete bids and auto-bids
      await tx.auctionAutoBid.deleteMany({ where: { auctionId: auction.id } })
      await tx.bid.deleteMany({ where: { auctionId: auction.id } })
      // Delete the auction record (UserCtoon will be deleted in phase 5)
      await tx.auction.delete({ where: { id: auction.id } })
    })
    log(`    ✓ Cancelled & deleted active auction ${auction.id} (${auction._count.bids} bids released)`)
    stats.activeAuctionsCancelled++
  }

  // ── 2. Undo CLOSED auctions ───────────────────────────────────────────────
  log('\n  [2/8] Undoing closed auctions…')
  for (const auction of closedAuctions) {
    const refundAmt = auction.effectiveAmount  // resolved from Auction.highestBid or Bid table
    await prisma.$transaction(async (tx) => {
      // Refund the auction winner (they paid refundAmt; the cToon they won is being deleted)
      if (auction.winnerId && refundAmt > 0) {
        const winnerPts = await tx.userPoints.upsert({
          where:  { userId: auction.winnerId },
          update: { points: { increment: refundAmt } },
          create: { userId: auction.winnerId, points: refundAmt }
        })
        await tx.pointsLog.create({
          data: {
            userId:    auction.winnerId,
            direction: 'increase',
            points:    refundAmt,
            total:     winnerPts.points,
            method:    'saiyan-saga-auction-undo-winner-refund'
          }
        })
        stats.auctionWinnerRefundPts += refundAmt

        // Claw back from the auction creator (they received the bid proceeds)
        if (auction.creatorId) {
          const creatorPts = await tx.userPoints.upsert({
            where:  { userId: auction.creatorId },
            update: { points: { decrement: refundAmt } },
            create: { userId: auction.creatorId, points: -refundAmt }
          })
          await tx.pointsLog.create({
            data: {
              userId:    auction.creatorId,
              direction: 'decrease',
              points:    refundAmt,
              total:     creatorPts.points,
              method:    'saiyan-saga-auction-undo-creator-clawback'
            }
          })
          stats.auctionCreatorClawbackPts += refundAmt
        }
      }

      // Delete bids and auto-bids, then delete the auction record
      await tx.auctionAutoBid.deleteMany({ where: { auctionId: auction.id } })
      await tx.bid.deleteMany({ where: { auctionId: auction.id } })
      await tx.auction.delete({ where: { id: auction.id } })
    })
    log(`    ✓ Undid closed auction ${auction.id} — refunded ${refundAmt} pts to winner ${auction.winnerId}; clawed back from creator ${auction.creatorId}`)
    stats.closedAuctionsUndone++
  }

  // ── 3. Withdraw PENDING trade offers ──────────────────────────────────────
  log('\n  [3/8] Withdrawing pending trade offers…')
  for (const trade of pendingTradeOffers) {
    await prisma.$transaction(async (tx) => {
      await tx.tradeOffer.update({
        where: { id: trade.id },
        data:  { status: 'WITHDRAWN' }
      })
      // Release initiator's active locked points for this trade
      await tx.lockedPoints.updateMany({
        where: {
          userId:      trade.initiatorId,
          status:      'ACTIVE',
          contextType: 'TRADE',
          contextId:   trade.id
        },
        data: { status: 'RELEASED' }
      })
    })
    log(`    ✓ Withdrew pending trade offer ${trade.id}`)
    stats.pendingTradesWithdrawn++
  }

  // ── 4. Undo ACCEPTED trade offers ─────────────────────────────────────────
  log('\n  [4/8] Undoing accepted trade offers…')
  for (const reversal of acceptedTradeReversals) {
    await prisma.$transaction(async (tx) => {
      // Return non-excess cToons to original owners (if they haven't moved on)
      for (const c of reversal.ctoonsToReturn) {
        const current = await tx.userCtoon.findUnique({
          where:  { id: c.userCtoonId },
          select: { userId: true, burnedAt: true, ctoonId: true, mintNumber: true }
        })
        if (!current) {
          warn(`UserCtoon ${c.userCtoonId} not found during trade reversal — skipping`)
          stats.ctoonsSkippedMoved++
          continue
        }
        if (current.burnedAt) {
          warn(`UserCtoon ${c.userCtoonId} is burned — cannot return`)
          stats.ctoonsSkippedMoved++
          continue
        }
        if (current.userId !== c.expectedCurrentUser) {
          warn(`UserCtoon ${c.userCtoonId}: expected owner=${c.expectedCurrentUser} but actual=${current.userId} — cToon has moved again, skipping return`)
          stats.ctoonsSkippedMoved++
          continue
        }
        await tx.userCtoon.update({
          where: { id: c.userCtoonId },
          data:  { userId: c.returnToUserId, isTradeable: true }
        })
        // Record the ownership restoration
        await tx.ctoonOwnerLog.create({
          data: {
            userId:      c.returnToUserId,
            ctoonId:     current.ctoonId,
            userCtoonId: c.userCtoonId,
            mintNumber:  current.mintNumber
          }
        })
        stats.ctoonsReturnedFromTrades++
      }

      // Reverse points: pointsOffered went from initiator to recipient
      if (reversal.pointsToReverse > 0) {
        const updatedRecipient = await tx.userPoints.upsert({
          where:  { userId: reversal.recipientId },
          update: { points: { decrement: reversal.pointsToReverse } },
          create: { userId: reversal.recipientId, points: -reversal.pointsToReverse }
        })
        await tx.pointsLog.create({
          data: {
            userId:    reversal.recipientId,
            direction: 'decrease',
            points:    reversal.pointsToReverse,
            total:     updatedRecipient.points,
            method:    'saiyan-saga-trade-undo-clawback'
          }
        })
        const updatedInitiator = await tx.userPoints.upsert({
          where:  { userId: reversal.initiatorId },
          update: { points: { increment: reversal.pointsToReverse } },
          create: { userId: reversal.initiatorId, points: reversal.pointsToReverse }
        })
        await tx.pointsLog.create({
          data: {
            userId:    reversal.initiatorId,
            direction: 'increase',
            points:    reversal.pointsToReverse,
            total:     updatedInitiator.points,
            method:    'saiyan-saga-trade-undo-return'
          }
        })
      }

      // Mark the trade offer as withdrawn (so it's clear it was reversed)
      await tx.tradeOffer.update({
        where: { id: reversal.tradeId },
        data:  { status: 'WITHDRAWN' }
      })
    })
    log(`    ✓ Undid accepted trade ${reversal.tradeId} (returned ${reversal.ctoonsToReturn.length} cToons, reversed ${reversal.pointsToReverse} pts)`)
    stats.acceptedTradesUndone++
  }

  // ── 5. Delete misc FK records ──────────────────────────────────────────────
  log('\n  [5/8] Deleting misc FK records…')

  if (auctionOnlyListings.length > 0) {
    await prisma.auctionOnly.deleteMany({ where: { userCtoonId: { in: validUcIds } } })
    stats.auctionOnlyDeleted = auctionOnlyListings.length
    log(`    ✓ Deleted ${auctionOnlyListings.length} AuctionOnly listing(s)`)
  }
  if (dissolveQueueEntries.length > 0) {
    await prisma.dissolveAuctionQueue.deleteMany({ where: { userCtoonId: { in: validUcIds } } })
    stats.dissolveQueueDeleted = dissolveQueueEntries.length
    log(`    ✓ Deleted ${dissolveQueueEntries.length} DissolveAuctionQueue entry(ies)`)
  }
  if (tradeListItems.length > 0) {
    await prisma.userTradeListItem.deleteMany({ where: { userCtoonId: { in: validUcIds } } })
    stats.tradeListDeleted = tradeListItems.length
    log(`    ✓ Deleted ${tradeListItems.length} UserTradeListItem entry(ies)`)
  }
  if (tradeCtoons.length > 0) {
    await prisma.tradeCtoon.deleteMany({ where: { userCtoonId: { in: validUcIds } } })
    stats.tradeCtoonDeleted = tradeCtoons.length
    log(`    ✓ Deleted ${tradeCtoons.length} TradeCtoon entry(ies)`)
  }

  // Delete TradeOfferCtoon join rows for excess UserCtoons
  // (must happen before deleting the UserCtoon itself)
  const tocResult = await prisma.tradeOfferCtoon.deleteMany({
    where: { userCtoonId: { in: validUcIds } }
  })
  stats.tradeOfferCtoonDeleted = tocResult.count
  if (tocResult.count > 0) {
    log(`    ✓ Deleted ${tocResult.count} TradeOfferCtoon join row(s)`)
  }

  // ── 6. Delete excess UserCtoon records ────────────────────────────────────
  log('\n  [6/8] Deleting excess UserCtoon records…')
  // CtoonOwnerLog has onDelete: SetNull so FK is safe
  // LottoLog has onDelete: SetNull so FK is safe
  // HolidayRedemption.sourceUserCtoonId has onDelete: SetNull so FK is safe
  const ucDeleteResult = await prisma.userCtoon.deleteMany({
    where: { id: { in: validUcIds } }
  })
  stats.userCtoonsDeleted = ucDeleteResult.count
  log(`    ✓ Deleted ${ucDeleteResult.count} excess UserCtoon record(s)`)

  // ── 7. Delete excess CmartPurchaseLog records ──────────────────────────────
  log('\n  [7/8] Deleting excess CmartPurchaseLog records…')
  const logDeleteResult = await prisma.cmartPurchaseLog.deleteMany({
    where: { id: { in: [...excessPurchaseLogIds] } }
  })
  stats.purchaseLogsDeleted = logDeleteResult.count
  log(`    ✓ Deleted ${logDeleteResult.count} excess CmartPurchaseLog record(s)`)

  // Refund original purchasers (ctoon.price × excess count)
  log('\n  [7b/8] Refunding original purchasers…')
  for (const [userId, info] of refundMap) {
    if (info.totalRefund <= 0) continue
    await prisma.$transaction(async (tx) => {
      const updated = await tx.userPoints.upsert({
        where:  { userId },
        update: { points: { increment: info.totalRefund } },
        create: { userId, points: info.totalRefund }
      })
      await tx.pointsLog.create({
        data: {
          userId,
          direction: 'increase',
          points:    info.totalRefund,
          total:     updated.points,
          method:    'saiyan-saga-overpurchase-refund'
        }
      })
    })
    log(`    ✓ Refunded ${info.totalRefund} pts to userId=${userId} (${info.count} excess mint(s))`)
    stats.purchaserRefundPts += info.totalRefund
    stats.usersRefunded++
  }

  // ── 8. Renumber remaining mints ───────────────────────────────────────────
  log('\n  [8/8] Renumbering remaining mints…')

  for (const ctoon of ctoons) {
    const remaining = await prisma.userCtoon.findMany({
      where:   { ctoonId: ctoon.id },
      select:  { id: true, mintNumber: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })

    const newTotal = remaining.length

    if (newTotal === 0) {
      // Nothing left — just sync totalMinted
      if (ctoon.totalMinted !== 0) {
        await prisma.ctoon.update({ where: { id: ctoon.id }, data: { totalMinted: 0 } })
      }
      log(`    ${ctoon.name}: no remaining mints, totalMinted → 0`)
      stats.ctoonsRenumbered++
      continue
    }

    const plan    = remaining.map((uc, idx) => ({ id: uc.id, oldMint: uc.mintNumber, newMint: idx + 1 }))
    const changes = plan.filter(p => p.oldMint !== p.newMint)
    const totalChanged = changes.length

    if (changes.length === 0 && ctoon.totalMinted === newTotal) {
      log(`    ${ctoon.name}: mint numbers already correct (${newTotal} remaining)`)
      continue
    }

    await prisma.$transaction(async (tx) => {
      if (changes.length > 0) {
        // Pass 1: set temporary negative mint numbers to avoid unique constraint conflicts
        const mintNums = remaining.map(r => r.mintNumber).filter(n => n != null)
        const tempBase = mintNums.length ? Math.min(...mintNums) - remaining.length - 1 : -1

        for (let i = 0; i < changes.length; i++) {
          await tx.userCtoon.update({
            where: { id: changes[i].id },
            data:  { mintNumber: tempBase - i }
          })
        }

        // Pass 2: assign final sequential mint numbers
        for (const change of changes) {
          const isFirstEdition =
            ctoon.initialQuantity == null || change.newMint <= ctoon.initialQuantity

          await tx.userCtoon.update({
            where: { id: change.id },
            data:  { mintNumber: change.newMint, isFirstEdition }
          })

          // Keep CtoonOwnerLog.mintNumber in sync
          await tx.ctoonOwnerLog.updateMany({
            where: { userCtoonId: change.id },
            data:  { mintNumber: change.newMint }
          })
        }
      }

      // Sync totalMinted regardless of whether mint numbers changed
      if (ctoon.totalMinted !== newTotal) {
        await tx.ctoon.update({
          where: { id: ctoon.id },
          data:  { totalMinted: newTotal }
        })
      }
    })

    log(`    ✓ ${ctoon.name}: renumbered ${totalChanged} mint(s), totalMinted → ${newTotal}`)
    stats.mintsRenumbered   += totalChanged
    stats.ctoonsRenumbered  += 1
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  sep('Complete — Final Summary')
  log(`  Active auctions cancelled:          ${stats.activeAuctionsCancelled}`)
  log(`  Closed auctions undone:             ${stats.closedAuctionsUndone}`)
  log(`    Auction winner refunds:           ${stats.auctionWinnerRefundPts} pts`)
  log(`    Auction creator clawbacks:        ${stats.auctionCreatorClawbackPts} pts`)
  log(`  Pending trades withdrawn:           ${stats.pendingTradesWithdrawn}`)
  log(`  Accepted trades undone:             ${stats.acceptedTradesUndone}`)
  log(`    cToons returned from trades:      ${stats.ctoonsReturnedFromTrades}`)
  log(`    cToons skipped (already moved):   ${stats.ctoonsSkippedMoved}`)
  log(`  AuctionOnly listings deleted:       ${stats.auctionOnlyDeleted}`)
  log(`  DissolveQueue entries deleted:      ${stats.dissolveQueueDeleted}`)
  log(`  TradeList items deleted:            ${stats.tradeListDeleted}`)
  log(`  TradeCtoon entries deleted:         ${stats.tradeCtoonDeleted}`)
  log(`  TradeOfferCtoon rows deleted:       ${stats.tradeOfferCtoonDeleted}`)
  log(`  Excess UserCtoons deleted:          ${stats.userCtoonsDeleted}`)
  log(`  Excess purchase logs deleted:       ${stats.purchaseLogsDeleted}`)
  log(`  Original purchasers refunded:       ${stats.usersRefunded} user(s) / ${stats.purchaserRefundPts} pts`)
  log(`  Mints renumbered:                   ${stats.mintsRenumbered}`)
  log(`  cToons renumbered:                  ${stats.ctoonsRenumbered}`)
  log()
  log('  ✅ All changes applied successfully.')
  log()
}

main()
  .catch((err) => {
    console.error('\nFATAL ERROR:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    try { await prisma.$disconnect() } catch {}
  })
