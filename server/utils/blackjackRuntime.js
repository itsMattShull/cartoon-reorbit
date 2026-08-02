// server/utils/blackjackRuntime.js
//
// Everything ReOrbit Blackjack needs that isn't pure rules: the Redis-held live hand, the
// daily caps, and the money movements between UserPoints and a session's chip stack.
//
// The split that governs this whole file:
//
//   Postgres (BlackjackSession)  money, and only money. Written once per hand and once per
//                                money movement. Nothing secret is stored, so no query on it
//                                can leak the hole card.
//   Redis (bj:hand:<userId>)     the live hand — shuffled cards, hole card, whose turn it is.
//                                Volatile. If it is lost, the wager is returned and the hand
//                                is voided, which is what a real casino does on a malfunction.
//
// Three rules hold the money together, and none of them is "remember to check":
//
//   1. Every mutation is a conditional UPDATE whose row count is checked. `version` makes a
//      double-submitted action lose rather than apply twice; `activeKey` makes a second
//      concurrent session impossible at the database level.
//   2. Every transaction that touches UserPoints opens with pg_advisory_xact_lock(hashtext(userId)),
//      the same key server/utils/gamePoints.js uses — so a cash-out cannot interleave with a
//      Clash or TKO award on the same row.
//   3. A wager is escrowed out of `chips` the instant it is placed. The same chip is never
//      both in the stack and on the felt, so a cash-out fired mid-hand cannot bank money that
//      is already in play.

import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getDailyWindowStart } from '@/server/utils/centralTime'
import {
  normalizeBlackjackConfig, shuffledHandCards, dealerFrom, startHand, applyAction,
  publicView, maxBetForHeadroom, BET_INCREMENT, PHASE
} from '@/server/utils/blackjackEngine'

// Not exported: server/utils is auto-imported wholesale, and guessCtoonRuntime.js
// already exports a GAME_NAME.
const GAME_NAME = 'Blackjack'
export const BUY_IN_METHOD = 'Game - ReOrbit Blackjack (Buy-In)'
export const CASH_OUT_METHOD = 'Game - ReOrbit Blackjack (Cash-Out)'

// The live hand outlives any reasonable pause but not a whole day; a session that loses its
// hand key simply starts the next hand fresh with its wager returned.
const HAND_TTL_SECONDS = 6 * 60 * 60

// Cheap admission control. Postgres is authoritative for correctness, so these only exist to
// stop a scripted client from turning the table into a write amplifier — practice mode has no
// cap on hands played, which makes it the one endpoint here with no natural ceiling.
const MIN_ACTION_INTERVAL_MS = 150
const HANDS_PER_HOUR = 600

function handKey (userId)  { return `bj:hand:${userId}` }
function rateKey (userId)  { return `bj:hands:${userId}` }

// ── config ────────────────────────────────────────────────────────────────────

let configCache = null
let configCachedAt = 0
const CONFIG_TTL_MS = 60_000

/**
 * The table's tuning. Cached briefly because /action would otherwise re-read it several times
 * per hand per player; a session snapshots it at buy-in anyway, so staleness here only affects
 * what a *new* session starts with. The TTL is the invalidation mechanism on purpose — the app
 * runs multiple Nuxt instances, so clearing a module-level cache from the admin save would only
 * ever clear one of them.
 */
export async function getBlackjackConfig () {
  if (configCache && Date.now() - configCachedAt < CONFIG_TTL_MS) return configCache
  const row = await prisma.gameConfig.findUnique({ where: { gameName: GAME_NAME } }).catch(() => null)
  configCache = normalizeBlackjackConfig(row || {})
  configCachedAt = Date.now()
  return configCache
}

// ── player eligibility ────────────────────────────────────────────────────────

/**
 * Rejects anyone who must not be moving points: deleted (a JWT outlives the row), banned, or
 * deactivated. `user?.banned` alone would let a deleted user through, since undefined is falsy.
 * Mirrors assertPlayable() in server/utils/guessCtoonRuntime.js, under a distinct name
 * because both modules are auto-imported into the same namespace.
 */
export async function assertBlackjackPlayable (userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { banned: true, active: true }
  })
  if (!user) return 'Account not found'
  if (user.banned) return 'Account suspended'
  if (user.active === false) return 'Account inactive'
  return null
}

// ── daily totals ──────────────────────────────────────────────────────────────

/**
 * How much of today's buy-in budget is spent and how far ahead the player is, aggregated from
 * the session rows themselves rather than a denormalised counter.
 *
 * A second source of truth could drift from the sessions it summarises, and the aggregate is
 * one indexed range scan over a handful of rows — this is the same shape the rest of the app
 * uses for daily caps (server/utils/gamePoints.js, asteroid/end.post.js).
 *
 * Chips still sitting in a live session count toward net winnings, so a player cannot park
 * winnings on the table to dodge the cap and cash them out later.
 */
export async function getDailyTotals (userId, client = prisma) {
  const windowStart = getDailyWindowStart()
  const sessions = await client.blackjackSession.findMany({
    where: { userId, mode: 'gamble', createdAt: { gte: windowStart } },
    select: { chips: true, wagered: true, totalBuyIn: true, cashedOut: true, status: true }
  })

  let buyInUsed = 0
  let netWinnings = 0
  for (const s of sessions) {
    buyInUsed += s.totalBuyIn
    netWinnings += s.cashedOut + s.chips + s.wagered - s.totalBuyIn
  }
  return { windowStart, buyInUsed, netWinnings }
}

// ── session lookup ────────────────────────────────────────────────────────────

/**
 * The player's live session, if any.
 *
 * The session id is never accepted from the client — it is derived from the authenticated
 * user and the requested mode. That makes acting on someone else's table structurally
 * impossible rather than a check that could be forgotten, and it is why `activeKey` is unique.
 */
export function findActiveSession (userId, mode, client = prisma) {
  return client.blackjackSession.findUnique({ where: { activeKey: `${userId}:${mode}` } })
}

/**
 * Settles any session left over from a previous daily window: chips go back to points for a
 * gamble session, practice sessions are simply closed.
 *
 * Done lazily on read rather than from a scheduled job. The app has exactly one cron host and
 * treating it as load-bearing for someone's points would be a mistake — and even a perfect
 * 8pm job would still race a player mid-hand at the boundary, so this path has to exist
 * regardless. Same reasoning as ensureEconomyDataFresh().
 */
export async function settleStaleSessions (userId) {
  const windowStart = getDailyWindowStart()
  const stale = await prisma.blackjackSession.findMany({
    where: { userId, status: 'active', windowStart: { lt: windowStart } },
    select: { id: true, mode: true }
  })
  if (!stale.length) return null

  let returned = 0
  for (const s of stale) {
    if (s.mode === 'practice') {
      await closePracticeSession(s.id)
      continue
    }
    const result = await cashOutSession(userId, s.id, { force: true }).catch(() => null)
    if (result?.cashedOut) returned += result.cashedOut
  }
  return returned > 0 ? returned : null
}

function closePracticeSession (sessionId) {
  return prisma.blackjackSession.updateMany({
    where: { id: sessionId, status: 'active' },
    data: { status: 'closed', activeKey: null, chips: 0, wagered: 0 }
  })
}

// ── starting a session ────────────────────────────────────────────────────────

/**
 * Opens a practice table. No points are involved at any point in a practice session's life —
 * the database CHECK constraint on this table makes a practice row carrying buy-in or
 * cash-out unpersistable, so a handler bug cannot quietly turn practice into a mint.
 */
export async function startPracticeSession (userId, rules) {
  const existing = await findActiveSession(userId, 'practice')
  if (existing) return existing

  return prisma.blackjackSession.create({
    data: {
      userId,
      mode: 'practice',
      chips: rules.practiceStack,
      activeKey: `${userId}:practice`,
      rules,
      windowStart: getDailyWindowStart()
    }
  })
}

/** Practice only: hand the stack back. Refuses to find a gamble session at all. */
export async function resetPracticeSession (userId, rules) {
  await redis.del(handKey(userId)).catch(() => {})
  const updated = await prisma.blackjackSession.updateMany({
    // `mode: 'practice'` is part of the WHERE, not a check after the fact: a gamble session is
    // unfindable here, so this endpoint cannot be pointed at one to conjure free chips.
    where: { userId, mode: 'practice', status: 'active' },
    data: { chips: rules.practiceStack, wagered: 0, handPhase: 'idle', version: { increment: 1 } }
  })
  return updated.count > 0
}

/**
 * Converts points into chips. Every step is a conditional UPDATE checked by row count — there
 * is no read-then-write anywhere in here, which is what stops two concurrent buy-ins from both
 * passing the same daily-budget check.
 */
export async function buyIn (userId, amount, rules) {
  const windowStart = getDailyWindowStart()

  return prisma.$transaction(async (tx) => {
    // First statement, before any read. A read above this line would put the TOCTOU back.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

    const { buyInUsed, netWinnings } = await getDailyTotals(userId, tx)
    if (buyInUsed + amount > rules.dailyBuyInLimit) {
      throw createBlackjackError(400, 'That would exceed your daily buy-in limit.')
    }
    if (netWinnings >= rules.dailyWinLimit) {
      throw createBlackjackError(400, 'You have hit the daily win limit. Come back after the reset.')
    }

    // Conditional decrement: the row is only touched if the balance actually covers it, so a
    // negative balance is unrepresentable rather than merely unlikely.
    const debited = await tx.userPoints.updateMany({
      where: { userId, points: { gte: amount } },
      data: { points: { decrement: amount }, updatedAt: new Date() }
    })
    if (debited.count === 0) throw createBlackjackError(400, 'Not enough points.')

    const after = await tx.userPoints.findUnique({ where: { userId }, select: { points: true } })
    await tx.pointsLog.create({
      data: {
        userId, direction: 'decrease', points: amount,
        total: after.points, method: BUY_IN_METHOD
      }
    })

    const existing = await tx.blackjackSession.findUnique({
      where: { activeKey: `${userId}:gamble` },
      select: { id: true }
    })

    if (existing) {
      await tx.blackjackSession.update({
        where: { id: existing.id },
        data: {
          chips: { increment: amount },
          totalBuyIn: { increment: amount },
          version: { increment: 1 }
        }
      })
      return { sessionId: existing.id, pointsAfter: after.points }
    }

    const created = await tx.blackjackSession.create({
      data: {
        userId,
        mode: 'gamble',
        chips: amount,
        totalBuyIn: amount,
        activeKey: `${userId}:gamble`,
        rules,
        windowStart
      },
      select: { id: true }
    })
    return { sessionId: created.id, pointsAfter: after.points }
  }, { maxWait: 2000, timeout: 8000 })
}

/**
 * Returns the escrowed wager of a hand that no longer exists.
 *
 * A session marked mid-hand whose Redis hand has expired or been evicted would otherwise be
 * stuck: cash-out refuses to run while a hand is live, so the chips would be unreachable until
 * the player happened to attempt a move. Voiding the hand and returning the stake is what a
 * real table does on a malfunction, and it is safe to run unconditionally — the guard is that
 * a hand which really is live still has its Redis key.
 *
 * Returns true if a hand was voided.
 */
export async function voidOrphanedHand (userId, session) {
  if (!session || session.handPhase !== 'live') return false
  const raw = await redis.get(handKey(userId)).catch(() => null)
  if (raw) {
    try {
      if (JSON.parse(raw).sessionId === session.id) return false
    } catch {
      // Unparseable hand state is as good as no hand state.
    }
  }
  await refundWager(userId, session.id, session.wagered)
  return true
}

// ── cashing out ───────────────────────────────────────────────────────────────

/**
 * Converts the chip stack back into points and closes the session.
 *
 * The amount credited is the value the UPDATE itself returns, never a figure read beforehand.
 * That is the difference between this being safe and being a double-spend: two concurrent
 * cash-outs both read `chips = 4000`, but only one of them can be the UPDATE that moves the
 * row off `status = 'active'`.
 */
export async function cashOutSession (userId, sessionId, { force = false } = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

    // `handPhase: 'idle'` is in the WHERE unless we're force-settling a stale session, so a
    // cash-out cannot land in the middle of a hand whose outcome is still undecided.
    const where = {
      id: sessionId,
      userId,
      mode: 'gamble',
      status: 'active',
      ...(force ? {} : { handPhase: 'idle' })
    }

    const session = await tx.blackjackSession.findFirst({ where, select: { id: true, chips: true, wagered: true } })
    if (!session) throw createBlackjackError(409, 'No table to cash out.')

    // A forced settle can find chips still escrowed on an abandoned hand; they were the
    // player's and are returned rather than destroyed.
    const amount = session.chips + (force ? session.wagered : 0)

    const closed = await tx.blackjackSession.updateMany({
      where,
      data: {
        chips: 0,
        wagered: 0,
        cashedOut: { increment: amount },
        status: 'cashed_out',
        activeKey: null,
        handPhase: 'idle',
        version: { increment: 1 }
      }
    })
    if (closed.count === 0) throw createBlackjackError(409, 'No table to cash out.')

    let pointsAfter = null
    if (amount > 0) {
      const updated = await tx.userPoints.upsert({
        where: { userId },
        create: { userId, points: amount },
        update: { points: { increment: amount } }
      })
      pointsAfter = updated.points
      await tx.pointsLog.create({
        data: {
          userId, direction: 'increase', points: amount,
          total: updated.points, method: CASH_OUT_METHOD
        }
      })
    }

    return { cashedOut: amount, pointsAfter }
  }, { maxWait: 2000, timeout: 8000 })
}

// ── playing a hand ────────────────────────────────────────────────────────────

/**
 * Places a bet and deals. The wager leaves `chips` in the same UPDATE that marks the hand
 * live, so there is no instant at which it is countable twice.
 */
export async function placeBet (userId, session, bet) {
  const rules = session.rules
  await enforceRate(userId)

  const staked = await prisma.blackjackSession.updateMany({
    // The full set of preconditions lives here rather than in an `if` above: not enough chips,
    // a hand already in progress, or a stale `version` all mean zero rows and a clean refusal.
    where: {
      id: session.id,
      userId,
      status: 'active',
      handPhase: 'idle',
      version: session.version,
      chips: { gte: bet }
    },
    data: {
      chips: { decrement: bet },
      wagered: bet,
      handPhase: 'live',
      version: { increment: 1 },
      lastActionAt: new Date()
    }
  })
  if (staked.count === 0) throw createBlackjackError(409, 'Table state changed. Refresh and try again.')

  const cards = shuffledHandCards(rules.deckCount)
  const deal = dealerFrom(cards)
  let state
  try {
    state = startHand(bet, rules, deal)
  } catch {
    await refundWager(userId, session.id, bet)
    throw createBlackjackError(500, 'Could not deal. Your bet was returned.')
  }

  const fresh = await prisma.blackjackSession.findUnique({ where: { id: session.id } })
  return persistHandProgress(userId, fresh, state, cards, deal)
}

/** Applies one player action to the live hand and settles it if that finishes it. */
export async function playAction (userId, session, action) {
  await enforceRate(userId)

  // Claim the action against the session's version before touching the hand. Two requests
  // arriving together both read the same Redis hand, and without this both would draw a card
  // from it — the second overwriting the first. Only one can win this UPDATE; the loser is
  // told the table moved rather than being silently applied.
  //
  // Postgres is the authority here on purpose. The Redis interval check above is admission
  // control that fails open, so it cannot be what protects the hand.
  const claimed = await prisma.blackjackSession.updateMany({
    where: {
      id: session.id,
      userId,
      status: 'active',
      handPhase: 'live',
      version: session.version
    },
    data: { version: { increment: 1 }, lastActionAt: new Date() }
  })
  if (claimed.count === 0) {
    throw createBlackjackError(409, 'Table state changed. Refresh and try again.')
  }
  // The claim consumed the version this caller read.
  session = { ...session, version: session.version + 1 }

  const raw = await redis.get(handKey(userId)).catch(() => null)
  if (!raw) {
    // The hand is gone (expired, evicted, or a Redis blip). Void it and return the wager —
    // the alternative is silently keeping money for a hand nobody can finish.
    if (session.wagered > 0) await refundWager(userId, session.id, session.wagered)
    throw createBlackjackError(409, 'Your hand expired. Your bet was returned.')
  }

  const stored = JSON.parse(raw)
  if (stored.sessionId !== session.id) {
    throw createBlackjackError(409, 'Table state changed. Refresh and try again.')
  }

  const rules = session.rules
  const state = stored.state
  const deal = dealerFrom(stored.cards.slice(stored.dealt))

  // Chips available for a double or a split: the free stack, not counting what's already at
  // risk. The engine uses it to decide whether those actions are even legal.
  const free = session.chips

  let next
  try {
    next = applyAction(state, action, rules, free, deal)
  } catch (err) {
    throw createBlackjackError(400, err?.message?.startsWith('Illegal') ? 'That move is not available.' : 'Invalid move.')
  }

  return persistHandProgress(userId, session, next, stored.cards, deal, stored.dealt)
}

/**
 * Writes the hand forward: Redis while it is live, Postgres once it settles.
 *
 * A doubled or split hand raises the amount at risk after the bet was placed, so the extra
 * stake is escrowed here in the same conditional UPDATE — a split the stack can no longer
 * cover is rejected by the row count, not by trusting the earlier legality check.
 */
async function persistHandProgress (userId, session, state, cards, deal, alreadyDealt = 0) {
  const dealt = alreadyDealt + deal.dealt
  const committed = state.hands.reduce((sum, h) => sum + h.bet, 0) + state.insuranceBet
  const extra = committed - session.wagered

  let current = session
  if (extra > 0) {
    const escrowed = await prisma.blackjackSession.updateMany({
      where: { id: session.id, userId, status: 'active', chips: { gte: extra } },
      data: { chips: { decrement: extra }, wagered: { increment: extra }, version: { increment: 1 } }
    })
    if (escrowed.count === 0) throw createBlackjackError(409, 'Not enough chips for that move.')
    current = await prisma.blackjackSession.findUnique({ where: { id: session.id } })
  }

  if (state.phase !== PHASE.SETTLED) {
    await redis.set(
      handKey(userId),
      JSON.stringify({ sessionId: session.id, state, cards, dealt }),
      'EX', HAND_TTL_SECONDS
    ).catch(() => {})
    return { session: current, state }
  }

  // Settled. The escrowed stake plus the net result returns to the stack in one write, and the
  // hand key is dropped so the same hand can never be replayed.
  await redis.del(handKey(userId)).catch(() => {})

  const returned = committed + state.netPayout
  const settled = await prisma.blackjackSession.update({
    where: { id: session.id },
    data: {
      chips: { increment: returned },
      wagered: 0,
      handPhase: 'idle',
      version: { increment: 1 },
      lastActionAt: new Date()
    }
  })

  return { session: settled, state }
}

async function refundWager (userId, sessionId, amount) {
  await redis.del(handKey(userId)).catch(() => {})
  await prisma.blackjackSession.updateMany({
    where: { id: sessionId, status: 'active' },
    data: {
      chips: { increment: amount },
      wagered: 0,
      handPhase: 'idle',
      version: { increment: 1 }
    }
  }).catch(() => {})
}

/**
 * Admission control: a floor on the gap between actions and a ceiling on hands per hour.
 * Fails open — Postgres holds correctness, and a Redis outage must not shut the table.
 */
async function enforceRate (userId) {
  try {
    // A short NX key is both the throttle and the double-submit guard: a second request
    // arriving inside the interval finds the key already set and is refused, which is what
    // makes an impatient double-tap harmless without a full lock.
    const fresh = await redis.set(`bj:tick:${userId}`, '1', 'NX', 'PX', MIN_ACTION_INTERVAL_MS)
    if (fresh !== 'OK') throw createBlackjackError(429, 'Slow down a moment.')

    const key = rateKey(userId)
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, 3600)
    if (n > HANDS_PER_HOUR) {
      throw createBlackjackError(429, "That's a lot of hands. Take a breather and come back shortly.")
    }
  } catch (err) {
    if (err?.statusCode) throw err
    // Redis unavailable: fail open. Postgres holds correctness, and a cache outage must not
    // close a table that is holding a player's points.
  }
}

export function createBlackjackError (statusCode, statusMessage) {
  const err = new Error(statusMessage)
  err.statusCode = statusCode
  err.statusMessage = statusMessage
  return err
}

/**
 * The ONLY shape any endpoint may return.
 *
 * Building it here — from a fresh object literal, never a spread of a Prisma row — is what
 * keeps the hole card and the undealt cards from escaping. A handler that returns the session
 * row directly would leak nothing anyway (the row holds no secrets by design), but this makes
 * the response deliberate rather than incidental.
 */
export function buildTableView ({ session, state, rules, daily, points, extra = {} }) {
  const chips = session?.chips ?? 0
  const headroom = rules ? rules.dailyWinLimit - (daily?.netWinnings ?? 0) : 0

  return {
    mode: session?.mode ?? null,
    status: session?.status ?? null,
    chips,
    wagered: session?.wagered ?? 0,
    version: session?.version ?? 0,
    points,
    rules: rules
      ? {
          minBet: rules.minBet,
          maxBet: rules.maxBet,
          deckCount: rules.deckCount,
          dealerHitsSoft17: rules.dealerHitsSoft17,
          payoutNum: rules.payoutNum,
          payoutDen: rules.payoutDen,
          allowDouble: rules.allowDouble,
          allowSplit: rules.allowSplit,
          allowInsurance: rules.allowInsurance,
          practiceStack: rules.practiceStack
        }
      : null,
    daily: daily
      ? {
          buyInUsed: daily.buyInUsed,
          buyInLimit: rules.dailyBuyInLimit,
          buyInLeft: Math.max(0, rules.dailyBuyInLimit - daily.buyInUsed),
          netWinnings: daily.netWinnings,
          winLimit: rules.dailyWinLimit,
          resetsAt: new Date(daily.windowStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
        }
      : null,
    // For a gamble table this is capped so that even a split-and-doubled win stays inside the
    // daily limit; practice has no cap to respect.
    // Always a whole multiple of the bet increment, so a bet the UI lets the player build is
    // never one the server then refuses.
    maxBet: session?.mode === 'gamble'
      ? maxBetForHeadroom(chips, headroom, rules)
      : Math.floor(Math.min(rules?.maxBet ?? 0, chips) / BET_INCREMENT) * BET_INCREMENT,
    betIncrement: BET_INCREMENT,
    hand: state ? publicView(state, rules, chips) : null,
    ...extra
  }
}
