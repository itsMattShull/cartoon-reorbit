// server/utils/tradeReversal.js
// Database half of the admin "Trade Reversal" tool (components/newsite/AdminTradeReversal.vue). The decisions — what
// goes back, what is skipped, who owes whom how many points — are made by the pure planner in tradeReversalPlan.js;
// this module reads the live state it needs and carries the plan out.
//
// A reversal runs in ONE transaction. Either every item and every point moves, or nothing does — an error anywhere
// rolls the whole thing back and the admin is told nothing changed. The plan the admin previewed is only a preview:
// the real plan is rebuilt INSIDE the transaction, under row locks, from the state at that moment.
//
// Lock order (matches accept.post.js, so a reversal racing an accept blocks instead of deadlocking where it can):
//   this TradeOffer row -> UserCtoon rows (sorted) -> UserPack rows (sorted) -> UserPoints (by userId) -> LockedPoints
//
// A trade can only be reversed once: the TradeReversal row is unique per TradeOffer, and it is written right after the
// offer row is locked, so a second admin clicking at the same moment waits on the lock and then finds the row.
import { createError } from 'h3'
import { Prisma } from '@prisma/client'
import { frozenAmong } from '@/server/utils/ogGtoonTournamentFreeze'
import { lockPacksForUpdate, getPackLockState, logPackOwners } from '@/server/utils/userPackState'
import { getSystemUserIds } from '@/server/utils/systemAccounts'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import {
  buildTradeReversalPlan,
  pickFairMarketValue,
  REVERSAL_OUTCOME
} from '@/server/utils/tradeReversalPlan'

/** PointsLog.method for the points a reversal moves. Listed in TRANSFER_METHODS (it nets to zero). */
export const TRADE_REVERSAL_POINTS_METHOD = 'Trade Reversal'
/** CtoonOwnerLog / PackOwnerLog method for an item handed back by a reversal. */
export const TRADE_REVERSAL_OWNER_METHOD = 'TRADE_REVERSAL'
/** How many recent sold auctions the fair market value averages over (same window as the admin Trade Logs). */
export const FAIR_MARKET_RECENT_SALES = 5

// Items moved per statement, so the progress bar has something to show on a big trade.
const MOVE_BATCH = 100

const offerInclude = {
  initiator: { select: { id: true, username: true } },
  recipient: { select: { id: true, username: true } },
  reversal: { select: { id: true, createdAt: true, adminUsername: true, includeFairMarketValue: true, summary: true } },
  ctoons: {
    select: {
      role: true,
      userCtoonId: true,
      userCtoon: {
        select: {
          mintNumber: true,
          ctoon: { select: { id: true, name: true, rarity: true, assetPath: true, price: true } }
        }
      }
    }
  },
  packs: {
    select: {
      role: true,
      userPackId: true,
      userPack: { select: { packId: true, pack: { select: { id: true, name: true, imagePath: true, price: true } } } }
    }
  }
}

/** The trade with everything the tool shows about it. */
export async function loadTradeForReversal (db, offerId) {
  return db.tradeOffer.findUnique({ where: { id: offerId }, include: offerInclude })
}

/** The shape the planner reads. */
function plannerOffer (offer) {
  return {
    id: offer.id,
    initiatorId: offer.initiatorId,
    recipientId: offer.recipientId,
    pointsOffered: offer.pointsOffered,
    pointsRequested: offer.pointsRequested,
    ctoons: offer.ctoons.map(c => ({ userCtoonId: c.userCtoonId, role: c.role, ctoonId: c.userCtoon.ctoon.id })),
    packs: offer.packs.map(p => ({ userPackId: p.userPackId, role: p.role, packId: p.userPack.packId }))
  }
}

/**
 * Where every item of the trade is right now. With `tx`, the rows are locked FOR UPDATE first (sorted, so concurrent
 * writers can't deadlock each other) and read under the lock.
 */
export async function readTradeItemState (db, offer, { lock = false } = {}) {
  const ctoonIds = [...new Set(offer.ctoons.map(c => c.userCtoonId))].sort()
  const packIds = [...new Set(offer.packs.map(p => p.userPackId))].sort()

  let ctoonRows = []
  if (ctoonIds.length) {
    ctoonRows = lock
      ? await db.$queryRaw`
          SELECT "id", "userId", "burnedAt" FROM "UserCtoon"
           WHERE "id" = ANY(${ctoonIds}::text[]) ORDER BY "id" FOR UPDATE`
      : await db.userCtoon.findMany({ where: { id: { in: ctoonIds } }, select: { id: true, userId: true, burnedAt: true } })
  }
  const packRows = packIds.length
    ? (lock
        ? await lockPacksForUpdate(db, packIds)
        : await db.userPack.findMany({ where: { id: { in: packIds } }, select: { id: true, userId: true, opened: true } }))
    : []

  // Sequential, not Promise.all: inside an interactive transaction every query shares one connection anyway.
  const auctions = ctoonIds.length
    ? await db.auction.findMany({ where: { userCtoonId: { in: ctoonIds }, status: 'ACTIVE' }, select: { userCtoonId: true } })
    : []
  const packLocks = await getPackLockState(db, packIds)
  const inAuction = new Set(auctions.map(a => a.userCtoonId))

  // Tournament-deck freezes are per owner; only the receiver's matter (a cToon still with them may be locked in).
  const byReceiver = new Map()
  for (const c of offer.ctoons) {
    const receiver = c.role === 'OFFERED' ? offer.recipientId : offer.initiatorId
    if (!byReceiver.has(receiver)) byReceiver.set(receiver, [])
    byReceiver.get(receiver).push(c.userCtoonId)
  }
  const frozen = new Set()
  for (const [receiver, ids] of byReceiver) {
    for (const id of await frozenAmong(db, receiver, ids)) frozen.add(`${receiver}:${id}`)
  }

  const ctoonState = new Map()
  for (const r of ctoonRows) {
    ctoonState.set(r.id, {
      userId: r.userId,
      burnedAt: r.burnedAt,
      inActiveAuction: inAuction.has(r.id),
      frozen: frozen.has(`${r.userId}:${r.id}`)
    })
  }
  const packState = new Map()
  for (const r of packRows) {
    packState.set(r.id, { userId: r.userId, opened: r.opened, inActiveAuction: !!packLocks.get(r.id)?.inActiveAuction })
  }
  return { ctoonState, packState }
}

/**
 * Fair market value per cToon and per pack type: the average winning bid of the last FAIR_MARKET_RECENT_SALES sold
 * auctions (CLOSED with a winner, wins by the official/system accounts excluded since those are buyouts at the floor,
 * not sales), falling back to the cToon's cMart price / the pack's shop price, then 0.
 *
 * Returns { ctoonValues: Map<ctoonId, number>, packValues: Map<packId, number>, detail: Map<'ctoon:id'|'pack:id', {...}> }.
 */
export async function getTradeFairMarketValues (db, offer) {
  const ctoonIds = [...new Set(offer.ctoons.map(c => c.userCtoon.ctoon.id))]
  const packIds = [...new Set(offer.packs.map(p => p.userPack.packId))]
  const exclude = await getSystemUserIds()
  const excludeIds = exclude.length ? exclude : ['']

  const [ctoonSales, packSales] = await Promise.all([
    ctoonIds.length
      ? db.$queryRaw`
          SELECT "ctoonId", "highestBid" FROM (
            SELECT uc."ctoonId" AS "ctoonId", a."highestBid" AS "highestBid",
                   ROW_NUMBER() OVER (PARTITION BY uc."ctoonId" ORDER BY a."winnerAt" DESC NULLS LAST) AS rn
              FROM "Auction" a
              JOIN "UserCtoon" uc ON uc.id = a."userCtoonId"
             WHERE a.status = 'CLOSED' AND a."winnerId" IS NOT NULL AND a."highestBid" > 0
               AND a."winnerId" NOT IN (${Prisma.join(excludeIds)})
               AND uc."ctoonId" IN (${Prisma.join(ctoonIds)})
          ) s WHERE rn <= ${FAIR_MARKET_RECENT_SALES}`
      : [],
    packIds.length
      ? db.$queryRaw`
          SELECT "packId", "highestBid" FROM (
            SELECT up."packId" AS "packId", a."highestBid" AS "highestBid",
                   ROW_NUMBER() OVER (PARTITION BY up."packId" ORDER BY a."winnerAt" DESC NULLS LAST) AS rn
              FROM "Auction" a
              JOIN "UserPack" up ON up.id = a."userPackId"
             WHERE a.status = 'CLOSED' AND a."winnerId" IS NOT NULL AND a."highestBid" > 0
               AND a."winnerId" NOT IN (${Prisma.join(excludeIds)})
               AND up."packId" IN (${Prisma.join(packIds)})
          ) s WHERE rn <= ${FAIR_MARKET_RECENT_SALES}`
      : []
  ])

  const group = (rows, key) => {
    const m = new Map()
    for (const r of rows) {
      if (!m.has(r[key])) m.set(r[key], [])
      m.get(r[key]).push(Number(r.highestBid))
    }
    return m
  }
  const ctoonSalesBy = group(ctoonSales, 'ctoonId')
  const packSalesBy = group(packSales, 'packId')

  const ctoonValues = new Map()
  const packValues = new Map()
  const detail = new Map()
  for (const c of offer.ctoons) {
    const ct = c.userCtoon.ctoon
    if (ctoonValues.has(ct.id)) continue
    const v = pickFairMarketValue(ctoonSalesBy.get(ct.id) || [], ct.price)
    ctoonValues.set(ct.id, v.value)
    detail.set(`ctoon:${ct.id}`, v)
  }
  for (const p of offer.packs) {
    const pk = p.userPack.pack
    if (packValues.has(pk.id)) continue
    const v = pickFairMarketValue(packSalesBy.get(pk.id) || [], pk.price)
    packValues.set(pk.id, v.value)
    detail.set(`pack:${pk.id}`, v)
  }
  return { ctoonValues, packValues, detail }
}

/** Attaches names / images / value sources to a plan's items for display, and usernames to its points. */
function describePlan (plan, offer, values) {
  const users = { [offer.initiatorId]: offer.initiator.username, [offer.recipientId]: offer.recipient.username }
  const ctoonById = new Map(offer.ctoons.map(c => [c.userCtoonId, c]))
  const packById = new Map(offer.packs.map(p => [p.userPackId, p]))
  const items = plan.items.map(i => {
    const base = {
      ...i,
      fromUsername: users[i.receiverId],
      toUsername: users[i.originalOwnerId]
    }
    if (i.kind === 'ctoon') {
      const c = ctoonById.get(i.id)
      const ct = c.userCtoon.ctoon
      return { ...base, name: ct.name, rarity: ct.rarity, image: ct.assetPath, mintNumber: c.userCtoon.mintNumber, valueSource: values.detail.get(`ctoon:${ct.id}`) ?? null }
    }
    const p = packById.get(i.id)
    const pk = p.userPack.pack
    return { ...base, name: pk.name, rarity: null, image: pk.imagePath, mintNumber: null, valueSource: values.detail.get(`pack:${pk.id}`) ?? null }
  })
  const net = plan.points.net
  return {
    ...plan,
    items,
    points: {
      ...plan.points,
      net: { ...net, fromUsername: net.fromUserId ? users[net.fromUserId] : null, toUsername: net.toUserId ? users[net.toUserId] : null }
    }
  }
}

/** Current balances for both users, and what they'd be after `plan`. */
function projectBalances (plan, offer, balances) {
  const out = {}
  for (const id of [offer.initiatorId, offer.recipientId]) {
    const before = balances.get(id) ?? 0
    const { net } = plan.points
    const delta = net.amount === 0 ? 0 : id === net.toUserId ? net.amount : id === net.fromUserId ? -net.amount : 0
    out[id === offer.initiatorId ? 'initiator' : 'recipient'] = { before, after: before + delta }
  }
  return out
}

/** One row of the trade list / the header of the modal. */
export function summarizeTradeRow (offer) {
  const n = (list, role) => list.filter(x => x.role === role).length
  return {
    id: offer.id,
    acceptedAt: offer.updatedAt,
    createdAt: offer.createdAt,
    initiator: offer.initiator,
    recipient: offer.recipient,
    initiatorGave: { ctoons: n(offer.ctoons, 'OFFERED'), packs: n(offer.packs, 'OFFERED'), points: offer.pointsOffered || 0 },
    recipientGave: { ctoons: n(offer.ctoons, 'REQUESTED'), packs: n(offer.packs, 'REQUESTED'), points: offer.pointsRequested || 0 },
    reversal: offer.reversal
      ? { id: offer.reversal.id, createdAt: offer.reversal.createdAt, adminUsername: offer.reversal.adminUsername, includeFairMarketValue: offer.reversal.includeFairMarketValue }
      : null
  }
}

function assertReversible (offer) {
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Trade not found.' })
  if (offer.status !== 'ACCEPTED') {
    throw createError({ statusCode: 400, statusMessage: `Only accepted trades can be reversed (this one is ${offer.status}).` })
  }
  if (offer.reversal) {
    throw createError({ statusCode: 409, statusMessage: 'This trade has already been reversed.' })
  }
}

/**
 * What undoing the trade would do right now, both with and without fair market value, plus each user's balance
 * before and after. Read-only.
 */
export async function previewTradeReversal (db, offerId) {
  const offer = await loadTradeForReversal(db, offerId)
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Trade not found.' })
  const trade = summarizeTradeRow(offer)
  if (offer.status !== 'ACCEPTED' || offer.reversal) {
    return { trade, reversible: false, reason: offer.reversal ? 'This trade has already been reversed.' : `Only accepted trades can be reversed (this one is ${offer.status}).`, previousSummary: offer.reversal?.summary ?? null }
  }

  const [{ ctoonState, packState }, values, pointsRows] = await Promise.all([
    readTradeItemState(db, offer),
    getTradeFairMarketValues(db, offer),
    db.userPoints.findMany({ where: { userId: { in: [offer.initiatorId, offer.recipientId] } }, select: { userId: true, points: true } })
  ])
  const balances = new Map(pointsRows.map(r => [r.userId, r.points]))
  const make = (includeFairMarketValue) => {
    const plan = buildTradeReversalPlan({
      offer: plannerOffer(offer), ctoonState, packState,
      ctoonValues: values.ctoonValues, packValues: values.packValues, includeFairMarketValue
    })
    return { ...describePlan(plan, offer, values), balances: projectBalances(plan, offer, balances) }
  }
  return { trade, reversible: true, withFairMarketValue: make(true), withoutFairMarketValue: make(false) }
}

/** Withdraws every PENDING offer (other than this one) that holds one of these cToons or packs, releasing its points. */
async function withdrawPendingOffersHolding (tx, { userCtoonIds, userPackIds, exceptOfferId }) {
  const ctoonLinks = userCtoonIds.length
    ? await tx.tradeOfferCtoon.findMany({ where: { userCtoonId: { in: userCtoonIds }, tradeOffer: { status: 'PENDING' } }, select: { tradeOfferId: true } })
    : []
  const packLinks = userPackIds.length
    ? await tx.tradeOfferPack.findMany({ where: { userPackId: { in: userPackIds }, tradeOffer: { status: 'PENDING' } }, select: { tradeOfferId: true } })
    : []
  const ids = [...new Set([...ctoonLinks, ...packLinks].map(l => l.tradeOfferId))].filter(id => id !== exceptOfferId).sort()
  if (!ids.length) return 0
  const { count } = await tx.tradeOffer.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: { status: 'WITHDRAWN', updatedAt: new Date() }
  })
  await tx.lockedPoints.updateMany({
    where: { contextType: 'TRADE', contextId: { in: ids }, status: 'ACTIVE' },
    data: { status: 'RELEASED' }
  })
  return count
}

const chunk = (xs, n) => {
  const out = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/**
 * Undo an accepted trade. Everything happens in one transaction; `onProgress(event)` is called as each step finishes
 * (events: { type: 'start', totalSteps }, { type: 'step', done, totalSteps, label }) so the caller can stream a
 * progress bar. Steps reported before a failure are rolled back with everything else.
 *
 * Returns the summary the admin is shown (also stored on the TradeReversal row and in the admin change log).
 */
export async function executeTradeReversal (db, { offerId, includeFairMarketValue, admin, onProgress = () => {} }) {
  const progress = async (e) => { try { await onProgress(e) } catch { /* a closed stream must not abort the reversal */ } }

  // Values are read outside the transaction: they're a read of auction history, not of anything the reversal locks,
  // and computing them inside would only hold the locks longer.
  const pre = await loadTradeForReversal(db, offerId)
  assertReversible(pre)
  const values = await getTradeFairMarketValues(db, pre)

  const summary = await db.$transaction(async (tx) => {
    // 1) Claim: lock the offer row, re-check it under the lock, and write the one-and-only reversal row.
    const locked = await tx.$queryRaw`SELECT "id", "status" FROM "TradeOffer" WHERE "id" = ${offerId} FOR UPDATE`
    if (!locked.length) throw createError({ statusCode: 404, statusMessage: 'Trade not found.' })
    const offer = await loadTradeForReversal(tx, offerId)
    assertReversible(offer)
    const reversal = await tx.tradeReversal.create({
      data: { tradeOfferId: offerId, adminId: admin.id, adminUsername: admin.username ?? null, includeFairMarketValue: !!includeFairMarketValue }
    })

    // 2) Lock every item and decide, from the state under the lock, what happens to each.
    const { ctoonState, packState } = await readTradeItemState(tx, offer, { lock: true })
    const plan = describePlan(buildTradeReversalPlan({
      offer: plannerOffer(offer), ctoonState, packState,
      ctoonValues: values.ctoonValues, packValues: values.packValues, includeFairMarketValue
    }), offer, values)

    const returning = plan.items.filter(i => i.outcome === REVERSAL_OUTCOME.RETURN)
    const ctoonGroups = new Map() // `${from}>${to}` -> ids
    const packGroups = new Map()
    for (const i of returning) {
      const g = i.kind === 'ctoon' ? ctoonGroups : packGroups
      const k = `${i.receiverId}>${i.originalOwnerId}`
      if (!g.has(k)) g.set(k, [])
      g.get(k).push(i.id)
    }
    const ctoonBatches = [...ctoonGroups].flatMap(([k, ids]) => chunk(ids, MOVE_BATCH).map(b => [k, b]))
    const packBatches = [...packGroups].flatMap(([k, ids]) => chunk(ids, MOVE_BATCH).map(b => [k, b]))
    // validate + one step per batch + points + record
    const totalSteps = 1 + ctoonBatches.length + packBatches.length + 1 + 1
    let done = 0
    await progress({ type: 'start', totalSteps })
    await progress({ type: 'step', done: ++done, totalSteps, label: 'Checked where every item in the trade is now' })

    // 3) Anything going back may sit in someone's open trade offer; that offer can never be accepted now.
    const withdrawnOffers = await withdrawPendingOffersHolding(tx, {
      userCtoonIds: returning.filter(i => i.kind === 'ctoon').map(i => i.id),
      userPackIds: returning.filter(i => i.kind === 'pack').map(i => i.id),
      exceptOfferId: offerId
    })

    const users = { [offer.initiatorId]: offer.initiator.username, [offer.recipientId]: offer.recipient.username }
    const ctoonById = new Map(offer.ctoons.map(c => [c.userCtoonId, c]))
    const packById = new Map(offer.packs.map(p => [p.userPackId, p]))

    // 4) cToons back to whoever gave them. Conditional on the owner the plan saw, like accept.post.js.
    for (const [k, ids] of ctoonBatches) {
      const [from, to] = k.split('>')
      const moved = await tx.userCtoon.updateMany({
        where: { id: { in: ids }, userId: from, burnedAt: null },
        data: { userId: to, inCzone: false }
      })
      if (moved.count !== ids.length) {
        throw createError({ statusCode: 409, statusMessage: `${ids.length - moved.count} cToon(s) changed owner while the reversal was running.` })
      }
      await tx.userTradeListItem.deleteMany({ where: { userCtoonId: { in: ids }, userId: { not: to } } })
      await tx.ctoonOwnerLog.createMany({
        data: ids.map(id => {
          const c = ctoonById.get(id)
          return {
            userId: to,
            ctoonId: c.userCtoon.ctoon.id,
            userCtoonId: id,
            mintNumber: c.userCtoon.mintNumber,
            method: TRADE_REVERSAL_OWNER_METHOD,
            counterpartyUserId: from,
            counterpartyUsername: users[from] ?? null,
            tradeOfferId: offerId
          }
        })
      })
      await progress({ type: 'step', done: ++done, totalSteps, label: `Returned ${ids.length} cToon${ids.length === 1 ? '' : 's'} to ${users[to]}` })
    }

    // 5) Sealed packs back.
    for (const [k, ids] of packBatches) {
      const [from, to] = k.split('>')
      const moved = await tx.userPack.updateMany({ where: { id: { in: ids }, userId: from, opened: false }, data: { userId: to } })
      if (moved.count !== ids.length) {
        throw createError({ statusCode: 409, statusMessage: `${ids.length - moved.count} pack(s) changed owner or were opened while the reversal was running.` })
      }
      await logPackOwners(tx, ids.map(id => ({
        userPackId: id,
        packId: packById.get(id).userPack.packId,
        userId: to,
        method: TRADE_REVERSAL_OWNER_METHOD,
        counterpartyUserId: from,
        counterpartyUsername: users[from] ?? null,
        tradeOfferId: offerId
      })))
      await progress({ type: 'step', done: ++done, totalSteps, label: `Returned ${ids.length} pack${ids.length === 1 ? '' : 's'} to ${users[to]}` })
    }

    // 6) Points: one netted transfer. Rows taken in userId order (see accept.post.js for why). A balance may go below
    // zero, as with the other admin correction tools: the user who benefited from the trade carries the debt, and the
    // modal warned the admin before they clicked.
    const balancesAfter = {}
    const { net } = plan.points
    if (net.amount > 0) {
      const [firstId, secondId] = [net.fromUserId, net.toUserId].sort()
      const rows = {}
      for (const id of [firstId, secondId]) {
        const delta = id === net.toUserId ? net.amount : -net.amount
        rows[id] = await tx.userPoints.upsert({
          where: { userId: id },
          update: { points: { increment: delta } },
          create: { userId: id, points: delta }
        })
      }
      await tx.pointsLog.createMany({
        data: [
          { userId: net.fromUserId, direction: 'decrease', points: net.amount, total: rows[net.fromUserId].points, method: TRADE_REVERSAL_POINTS_METHOD },
          { userId: net.toUserId, direction: 'increase', points: net.amount, total: rows[net.toUserId].points, method: TRADE_REVERSAL_POINTS_METHOD }
        ]
      })
      balancesAfter[net.fromUserId] = rows[net.fromUserId].points
      balancesAfter[net.toUserId] = rows[net.toUserId].points
    }
    await progress({ type: 'step', done: ++done, totalSteps, label: net.amount > 0 ? `Moved ${net.amount} points from ${users[net.fromUserId]} to ${users[net.toUserId]}` : 'No points to move' })

    // 7) Record what was done.
    for (const id of [offer.initiatorId, offer.recipientId]) {
      if (balancesAfter[id] == null) {
        balancesAfter[id] = (await tx.userPoints.findUnique({ where: { userId: id }, select: { points: true } }))?.points ?? 0
      }
    }
    const result = {
      tradeId: offerId,
      reversalId: reversal.id,
      reversedAt: reversal.createdAt,
      adminUsername: admin.username ?? null,
      includeFairMarketValue: !!includeFairMarketValue,
      initiator: offer.initiator,
      recipient: offer.recipient,
      items: plan.items.map(({ kind, id, name, rarity, image, mintNumber, fromUsername, toUsername, outcome, reason, fairMarketValue }) =>
        ({ kind, id, name, rarity, image, mintNumber, fromUsername, toUsername, outcome, reason, fairMarketValue })),
      counts: plan.counts,
      points: {
        ...plan.points,
        balancesAfter: { initiator: balancesAfter[offer.initiatorId], recipient: balancesAfter[offer.recipientId] }
      },
      withdrawnOffers
    }
    await tx.tradeReversal.update({ where: { id: reversal.id }, data: { summary: result } })
    await progress({ type: 'step', done: ++done, totalSteps, label: 'Saved the reversal record' })
    return result
  }, {
    // Same budget as accept.post.js: a full-size trade moves its items in set-based batches, not one row at a time.
    timeout: 45000,
    maxWait: 15000
  })

  // Audit trail, one entry per user so it shows up when either is searched. After the commit on purpose:
  // logAdminChange swallows its own errors, and a failed statement inside a Postgres transaction would poison it.
  for (const target of [summary.initiator, summary.recipient]) {
    await logAdminChange(db, {
      userId: admin.id,
      area: 'Admin:TradeReversal',
      key: 'tradeReversal',
      prevValue: { tradeOfferId: offerId, initiator: summary.initiator.username, recipient: summary.recipient.username },
      newValue: {
        includeFairMarketValue: summary.includeFairMarketValue,
        counts: summary.counts,
        points: summary.points.net,
        withdrawnOffers: summary.withdrawnOffers
      },
      targetUserId: target.id,
      targetUsername: target.username
    })
  }

  return summary
}

/** Readable message for an error thrown by a reversal, with why it happened where we can tell. */
export function describeTradeReversalError (err) {
  if (err?.statusMessage) return err.statusMessage
  const code = err?.code
  if (code === 'P2002') return 'This trade has already been reversed.'
  if (code === 'P2028') return 'The reversal took too long and was stopped by the database.'
  if (code === 'P2034' || /deadlock/i.test(String(err?.message))) return 'Another change to these users\' items or points happened at the same moment. Try again.'
  // Prisma's messages open with a multi-line "Invalid `prisma.x()` invocation" preamble; the database's own reason is
  // what the admin needs.
  if (err?.meta?.message) return `Database error: ${err.meta.message}`
  const lines = String(err?.message || err || 'Unknown error').split('\n').map(l => l.trim()).filter(Boolean)
  return lines[lines.length - 1] || 'Unknown error'
}

/** Paginated ACCEPTED trades for the tool's list. */
export async function listTradesForReversal (db, { page = 1, limit = 25, user = '', reversed = 'all' } = {}) {
  const where = {
    status: 'ACCEPTED',
    ...(reversed === 'yes' ? { reversal: { isNot: null } } : reversed === 'no' ? { reversal: { is: null } } : {}),
    ...(user
      ? {
          OR: [
            { initiator: { username: { contains: user, mode: 'insensitive' } } },
            { recipient: { username: { contains: user, mode: 'insensitive' } } }
          ]
        }
      : {})
  }
  const [total, offers] = await Promise.all([
    db.tradeOffer.count({ where }),
    db.tradeOffer.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        initiator: { select: { id: true, username: true } },
        recipient: { select: { id: true, username: true } },
        reversal: { select: { id: true, createdAt: true, adminUsername: true, includeFairMarketValue: true } },
        ctoons: { select: { role: true } },
        packs: { select: { role: true } }
      }
    })
  ])
  return { items: offers.map(summarizeTradeRow), total, page, limit }
}
