// server/utils/ogGtoonsPackReward.js
// The OG gToons PvP pack reward: the winner of a played-out random-queue or direct-challenge match gets ONE sealed pack
// (the pack and the per-player limit are admin settings: Manage Games > gToons (Original)).
//
// ── Import rules ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Loaded by server/socket-server.js, a plain `node` process: no `@/` alias, no `#imports`, no `$fetch`. So this module
// takes the Prisma client as a parameter and imports only `.js` siblings that themselves import nothing Nuxt-only.
//
// ── Who is paid ──────────────────────────────────────────────────────────────────────────────────────────────────────
//   * a win that was PLAYED OUT (winReason set) — not a tie, an incomplete game, a forfeit, a timeout sweep;
//   * not a tournament game (tournaments have their own prizes);
//   * practice and the tutorial never reach this code: they never touch Prisma or persistAndSettle.
// A forfeit is excluded because the "win" can be manufactured in seconds: an alt queues, the main joins, the alt leaves.
//
// ── Anti-farming ─────────────────────────────────────────────────────────────────────────────────────────────────────
//   * per-player cap per 8pm–7:59pm Central window, counted across ALL packs (so switching the reward pack mid-window
//     cannot double-dip);
//   * ONE pack per (winner, loser) per window — directional on purpose: A beating B and B beating A may each earn one,
//     but A beating B twice earns A one. Also a unique key in the database, so it is a fact, not an app check;
//   * the loser must have committed at least MIN_LOSER_MANUAL_COMMITS rounds THEMSELVES. An idle opponent is auto-played
//     by the round timer and "loses naturally", which is otherwise indistinguishable from a real game;
//   * banned / inactive winner or loser: re-read inside the transaction (the socket's cached user can be weeks stale).
//
// ── Reliability ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The award is its OWN transaction, run after the match row is written, so a reward bug can never lose a match or its
// stake settlement. `rewardCheckedAt` is claimed with a conditional UPDATE inside that transaction, so the award is
// idempotent: a retry, a double call or the reconcile cron can never pay twice, and a crash mid-way rolls the claim back
// so the cron picks the match up again. Every finished match ends with a rewardStatus, which is why turning the reward
// on later never pays old matches retroactively.
import { getPackDailyWindowStart } from './packDailyWindow.js'
import { notifyPvpPackWon } from './notifications.js'

/** A loser who committed fewer rounds than this by their own hand was effectively not playing. */
export const MIN_LOSER_MANUAL_COMMITS = 2

/** The per-user limit an admin may set. */
export const MAX_PER_USER_LIMIT = 100

/**
 * Why this finished match can never earn the reward, or null if it is eligible. Pure.
 * @param {{ outcome:string, winnerUserId:string|null, player1UserId:string, player2UserId:string, winReason:string|null,
 *           whoLeftUserId:string|null, tournamentMatchId:string|null }} m
 */
export function ineligibleReason (m) {
  if (!m) return 'no_match'
  if (m.outcome !== 'PLAYER1' && m.outcome !== 'PLAYER2') return 'not_a_win'     // TIE / INCOMPLETE
  if (!m.winnerUserId) return 'no_winner'
  if (m.player1UserId === m.player2UserId) return 'self'
  if (m.tournamentMatchId) return 'tournament'
  if (m.whoLeftUserId) return 'forfeit'
  if (!m.winReason) return 'not_played_out'                                       // a sweep / forfeit writes no reason
  return null
}

/** The loser's user id and how many rounds they committed themselves. Pure. */
export function loserOf (m) {
  const winnerIsP1 = m.winnerUserId === m.player1UserId
  return winnerIsP1
    ? { userId: m.player2UserId, manualCommits: m.player2ManualCommits ?? 0 }
    : { userId: m.player1UserId, manualCommits: m.player1ManualCommits ?? 0 }
}

/**
 * The reward decision, given everything already looked up. Pure — the database work is in evaluatePackReward.
 *
 * @param {object} p
 * @param {object} p.match    the persisted OgGtoonMatch row
 * @param {{ packId:string|null, perUserLimit:number|null }} p.config   read fresh, never from the 60s config cache
 * @param {{ winnerBlocked:boolean, loserBlocked:boolean }} p.blocked  banned / inactive
 * @param {{ winnerInWindow:number, pairInWindow:number }} p.counts    awards already paid in this match's window
 * @returns {{ status:'AWARDED'|'CAPPED'|'SAME_PAIR'|'IDLE_OPPONENT'|'BANNED'|'OFF'|'SKIPPED', reason:string|null, configured:boolean }}
 */
export function decideReward ({ match, config, blocked = {}, counts = {} }) {
  const configured = !!(config?.packId && Number.isInteger(config?.perUserLimit) && config.perUserLimit > 0)
  const why = ineligibleReason(match)
  if (why) return { status: 'SKIPPED', reason: why, configured }
  if (!configured) return { status: 'OFF', reason: null, configured }
  if (blocked.winnerBlocked || blocked.loserBlocked) return { status: 'BANNED', reason: null, configured }
  if (loserOf(match).manualCommits < MIN_LOSER_MANUAL_COMMITS) return { status: 'IDLE_OPPONENT', reason: null, configured }
  if ((counts.pairInWindow ?? 0) >= 1) return { status: 'SAME_PAIR', reason: null, configured }
  if ((counts.winnerInWindow ?? 0) >= config.perUserLimit) return { status: 'CAPPED', reason: null, configured }
  return { status: 'AWARDED', reason: null, configured }
}

/**
 * What the winner is told on the match-end card, or null for "say nothing". Pure.
 * Nothing is said when the reward is off, the game was ineligible for an unremarkable reason (tie, tournament, …), or the
 * other player was banned — never tell a winner why their opponent was filtered out.
 */
export function noticeFor (decision, pack) {
  const { status, reason, configured } = decision
  if (!configured) return null
  if (status === 'AWARDED') return { status, packName: pack?.name ?? 'Pack', packImagePath: pack?.imagePath ?? null }
  if (status === 'CAPPED' || status === 'SAME_PAIR' || status === 'IDLE_OPPONENT') return { status }
  if (status === 'SKIPPED' && reason === 'forfeit') return { status: 'FORFEIT' }
  return null
}

const MATCH_SELECT = {
  id: true, outcome: true, winnerUserId: true, player1UserId: true, player2UserId: true,
  winReason: true, whoLeftUserId: true, tournamentMatchId: true, endedAt: true,
  player1ManualCommits: true, player2ManualCommits: true
}

/**
 * Evaluates (and, if earned, pays) the reward for ONE finished, persisted match. Idempotent: the first caller claims the
 * match; any other gets `{ status: 'ALREADY_CHECKED' }`. Never pays twice, never throws for a "no" outcome.
 *
 * @param {import('@prisma/client').PrismaClient} db
 * @param {string} matchId
 * @returns {Promise<{ status:string, reason?:string|null, winnerUserId?:string, notice?:object|null }>}
 */
export async function evaluatePackReward (db, matchId) {
  let packForNotification = null
  let winnerForNotification = null

  const result = await db.$transaction(async (tx) => {
    // Claim. Conditional, so a second caller (retry, cron, double call) matches nothing and stands down — and because it
    // is inside this transaction, a failure below un-claims it and the reconcile cron tries again.
    const claimed = await tx.ogGtoonMatch.updateMany({
      where: { id: matchId, rewardCheckedAt: null, endedAt: { not: null } },
      data: { rewardCheckedAt: new Date() }
    })
    if (claimed.count !== 1) return { status: 'ALREADY_CHECKED' }

    const match = await tx.ogGtoonMatch.findUnique({ where: { id: matchId }, select: MATCH_SELECT })
    // Attributed to the window the match ENDED in, not "now": a retry or the reconcile cron after 8pm must not move a
    // 7:59pm win into the next window.
    const windowStart = getPackDailyWindowStart(match.endedAt)

    const cfgRow = await tx.gameConfig.findUnique({
      where: { gameName: 'OgGtoons' },
      select: {
        ogGtoonsWinPackId: true,
        ogGtoonsWinPackPerUserLimit: true,
        ogGtoonsWinPack: { select: { id: true, name: true, imagePath: true } }
      }
    })
    const config = { packId: cfgRow?.ogGtoonsWinPackId ?? null, perUserLimit: cfgRow?.ogGtoonsWinPackPerUserLimit ?? null }

    const setStatus = (status) => tx.ogGtoonMatch.update({ where: { id: matchId }, data: { rewardStatus: status, rewardWindowStart: windowStart } })

    // Cheap decisions first (no lookups needed).
    const early = decideReward({ match, config })
    // SKIPPED / OFF are final without looking anything else up; everything else needs the people and the window counts.
    if (early.status === 'SKIPPED' || early.status === 'OFF') {
      await setStatus(early.status)
      return { ...early, winnerUserId: match.winnerUserId, pack: cfgRow?.ogGtoonsWinPack ?? null }
    }

    const { userId: loserId } = loserOf(match)
    const winnerId = match.winnerUserId
    // Serialise this winner's awards. The (winner, loser, window) unique key and the match id unique key are the
    // backstop; this lock is what makes the per-window CAP exact under concurrent match ends. A key distinct from the
    // bare hashtext(userId) that gamePoints.js already takes, so the two never queue behind each other.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${winnerId}:ogpack`}))`

    const people = await tx.user.findMany({ where: { id: { in: [winnerId, loserId] } }, select: { id: true, banned: true, active: true } })
    const blockedOf = (id) => { const u = people.find(p => p.id === id); return !u || u.banned || !u.active }
    const [winnerInWindow, pairInWindow] = await Promise.all([
      tx.ogGtoonPackAward.count({ where: { winnerUserId: winnerId, windowStart } }),
      tx.ogGtoonPackAward.count({ where: { winnerUserId: winnerId, loserUserId: loserId, windowStart } })
    ])
    const decision = decideReward({
      match, config,
      blocked: { winnerBlocked: blockedOf(winnerId), loserBlocked: blockedOf(loserId) },
      counts: { winnerInWindow, pairInWindow }
    })

    if (decision.status !== 'AWARDED') {
      await setStatus(decision.status)
      return { ...decision, winnerUserId: winnerId, pack: cfgRow?.ogGtoonsWinPack ?? null }
    }

    // Paid. One row set, all in this transaction: the pack, the award record, the history row, the match status.
    const pack = await tx.userPack.create({
      data: { userId: winnerId, packId: config.packId, opened: false, source: 'OG_GTOONS_PVP', sourceRef: matchId, sourceOrdinal: 0 },
      select: { id: true }
    })
    await tx.ogGtoonPackAward.create({
      data: { matchId, winnerUserId: winnerId, loserUserId: loserId, packId: config.packId, userPackId: pack.id, windowStart }
    })
    await tx.packOwnerLog.create({
      data: { userPackId: pack.id, packId: config.packId, userId: winnerId, method: 'OG_GTOONS_PVP', counterpartyUserId: loserId }
    })
    await setStatus('AWARDED')
    packForNotification = cfgRow.ogGtoonsWinPack
    winnerForNotification = winnerId
    return { ...decision, winnerUserId: winnerId, pack: cfgRow.ogGtoonsWinPack }
  }, { timeout: 15000, maxWait: 5000 })

  if (result.status === 'ALREADY_CHECKED') return { status: 'ALREADY_CHECKED' }

  // After the commit, with the plain client (see notifyPvpPackWon). Best effort: the pack is already in their collection.
  if (winnerForNotification) {
    await notifyPvpPackWon(db, { userId: winnerForNotification, packName: packForNotification?.name }).catch(() => {})
  }

  return {
    status: result.status,
    reason: result.reason ?? null,
    winnerUserId: result.winnerUserId,
    notice: noticeFor(result, result.pack)
  }
}

/**
 * The safety net behind the live award: evaluates every finished match that nobody has evaluated yet (the process died
 * between persisting the match and awarding it, or the award transaction failed). Matches younger than `minAgeMs` are left
 * for the live path. Bounded per run; per-match errors are logged and the sweep continues.
 */
export async function reconcilePackRewards (db, { minAgeMs = 120000, limit = 200 } = {}) {
  const cutoff = new Date(Date.now() - minAgeMs)
  const pending = await db.ogGtoonMatch.findMany({
    where: { rewardCheckedAt: null, endedAt: { not: null, lt: cutoff } },
    orderBy: { endedAt: 'asc' },
    take: limit,
    select: { id: true }
  })
  const counts = {}
  for (const { id } of pending) {
    try {
      const r = await evaluatePackReward(db, id)
      counts[r.status] = (counts[r.status] || 0) + 1
    } catch (err) {
      counts.ERROR = (counts.ERROR || 0) + 1
      console.error(`[ogGtoons] pack reward reconcile failed for match ${id}:`, err?.message || err)
    }
  }
  return { checked: pending.length, counts }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Turns the admin form's two reward settings into what should be saved, or an error. Pure.
 *
 * `key in body` semantics, like the other GameConfig saves: a stale tab that doesn't send these fields must NOT wipe them,
 * and a field that IS sent overrides the stored value. The pair is all-or-nothing — a pack without a limit (or the
 * reverse) is refused rather than guessed at: a missing limit must never mean "unlimited".
 *
 * @param {object} body    the request body
 * @param {{ ogGtoonsWinPackId?:string|null, ogGtoonsWinPackPerUserLimit?:number|null }|null} before  the stored row
 * @returns {{ changed:false } | { changed:true, packId:string|null, limit:number|null, error?:string }}
 */
export function resolveWinPackSettings (body, before) {
  const has = (k) => !!body && Object.prototype.hasOwnProperty.call(body, k)
  if (!has('ogGtoonsWinPackId') && !has('ogGtoonsWinPackPerUserLimit')) return { changed: false }

  const rawPack = has('ogGtoonsWinPackId') ? body.ogGtoonsWinPackId : (before?.ogGtoonsWinPackId ?? null)
  const rawLimit = has('ogGtoonsWinPackPerUserLimit') ? body.ogGtoonsWinPackPerUserLimit : (before?.ogGtoonsWinPackPerUserLimit ?? null)
  const packId = rawPack == null || rawPack === '' ? null : String(rawPack).trim()
  const limit = rawLimit == null || rawLimit === '' ? null : Number(rawLimit)

  if ((packId == null) !== (limit == null)) {
    return { changed: true, packId, limit, error: 'Set both a reward pack and a per-player limit, or clear both to turn the reward off.' }
  }
  if (packId != null && !UUID_RE.test(packId)) {
    return { changed: true, packId, limit, error: 'The reward pack is not a valid pack.' }
  }
  if (limit != null && (!Number.isInteger(limit) || limit < 1 || limit > MAX_PER_USER_LIMIT)) {
    return { changed: true, packId, limit, error: `The per-player limit must be a whole number from 1 to ${MAX_PER_USER_LIMIT}.` }
  }
  return { changed: true, packId, limit }
}
