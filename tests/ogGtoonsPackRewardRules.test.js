// The PvP pack reward's decisions, as a truth table (pure — no database). The transactional behaviour (idempotency, caps
// under concurrency, windows) is in tests/ogGtoonsPackReward.db.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ineligibleReason, loserOf, decideReward, noticeFor, resolveWinPackSettings,
  MIN_LOSER_MANUAL_COMMITS, MAX_PER_USER_LIMIT
} from '../server/utils/ogGtoonsPackReward.js'

const P1 = 'p1'; const P2 = 'p2'
const played = (over = {}) => ({
  outcome: 'PLAYER1', winnerUserId: P1, player1UserId: P1, player2UserId: P2, winReason: 'POINTS',
  whoLeftUserId: null, tournamentMatchId: null, player1ManualCommits: 3, player2ManualCommits: 3, ...over
})
const cfg = { packId: 'pack-1', perUserLimit: 2 }

test('a played-out win in a queue/challenge match is eligible', () => {
  assert.equal(ineligibleReason(played()), null)
  assert.equal(ineligibleReason(played({ outcome: 'PLAYER2', winnerUserId: P2 })), null)
})

test('NOT eligible: ties, incomplete games, forfeits, sweeps, tournaments, self-matches', () => {
  assert.equal(ineligibleReason(played({ outcome: 'TIE', winnerUserId: null })), 'not_a_win')
  assert.equal(ineligibleReason(played({ outcome: 'INCOMPLETE', winnerUserId: null })), 'not_a_win')
  assert.equal(ineligibleReason(played({ whoLeftUserId: P2 })), 'forfeit')
  assert.equal(ineligibleReason(played({ winReason: null })), 'not_played_out')
  assert.equal(ineligibleReason(played({ tournamentMatchId: 't1' })), 'tournament')
  assert.equal(ineligibleReason(played({ player2UserId: P1 })), 'self')
  assert.equal(ineligibleReason(played({ winnerUserId: null })), 'no_winner')
  assert.equal(ineligibleReason(null), 'no_match')
})

test('a forfeit where the winner stayed is still a forfeit (winner-by-leaving cannot be farmed in seconds)', () => {
  // A forfeit is persisted with score 0-0 and no winReason; even if winReason were somehow set, whoLeftUserId decides.
  assert.equal(ineligibleReason(played({ whoLeftUserId: P1, winReason: 'COLOR' })), 'forfeit')
})

test('loserOf picks the other player and THEIR commit count', () => {
  assert.deepEqual(loserOf(played({ player1ManualCommits: 5, player2ManualCommits: 1 })), { userId: P2, manualCommits: 1 })
  assert.deepEqual(loserOf(played({ outcome: 'PLAYER2', winnerUserId: P2, player1ManualCommits: 0, player2ManualCommits: 4 })), { userId: P1, manualCommits: 0 })
})

test('AWARDED when everything lines up', () => {
  const d = decideReward({ match: played(), config: cfg, blocked: {}, counts: { winnerInWindow: 0, pairInWindow: 0 } })
  assert.deepEqual([d.status, d.configured], ['AWARDED', true])
})

test('OFF when no pack or no limit — a missing limit is never "unlimited"', () => {
  for (const c of [{ packId: null, perUserLimit: 2 }, { packId: 'p', perUserLimit: null }, { packId: 'p', perUserLimit: 0 }, { packId: 'p', perUserLimit: -1 }, { packId: 'p', perUserLimit: 1.5 }, {}, null]) {
    const d = decideReward({ match: played(), config: c })
    assert.equal(d.status, 'OFF', JSON.stringify(c)); assert.equal(d.configured, false)
  }
})

test('an ineligible match is SKIPPED even when the reward is configured, and keeps its reason', () => {
  const d = decideReward({ match: played({ whoLeftUserId: P2 }), config: cfg })
  assert.deepEqual([d.status, d.reason, d.configured], ['SKIPPED', 'forfeit', true])
})

test('idle loser: needs MIN_LOSER_MANUAL_COMMITS rounds committed by their own hand', () => {
  assert.equal(MIN_LOSER_MANUAL_COMMITS, 2)
  const at = (n) => decideReward({ match: played({ player2ManualCommits: n }), config: cfg, counts: {} }).status
  assert.deepEqual([at(0), at(1), at(2), at(3)], ['IDLE_OPPONENT', 'IDLE_OPPONENT', 'AWARDED', 'AWARDED'])
  // it is the LOSER's commits that count, not the winner's
  assert.equal(decideReward({ match: played({ player1ManualCommits: 0, player2ManualCommits: 3 }), config: cfg, counts: {} }).status, 'AWARDED')
})

test('banned / inactive on either side blocks the reward', () => {
  assert.equal(decideReward({ match: played(), config: cfg, blocked: { winnerBlocked: true } }).status, 'BANNED')
  assert.equal(decideReward({ match: played(), config: cfg, blocked: { loserBlocked: true } }).status, 'BANNED')
})

test('one pack per (winner, loser) per window; the per-player cap applies across opponents', () => {
  assert.equal(decideReward({ match: played(), config: cfg, counts: { pairInWindow: 1, winnerInWindow: 1 } }).status, 'SAME_PAIR')
  assert.equal(decideReward({ match: played(), config: cfg, counts: { pairInWindow: 0, winnerInWindow: 1 } }).status, 'AWARDED')
  assert.equal(decideReward({ match: played(), config: cfg, counts: { pairInWindow: 0, winnerInWindow: 2 } }).status, 'CAPPED')
  assert.equal(decideReward({ match: played(), config: { packId: 'p', perUserLimit: 1 }, counts: { winnerInWindow: 1 } }).status, 'CAPPED')
})

test('precedence: banned beats idle beats same-pair beats cap', () => {
  const all = { match: played({ player2ManualCommits: 0 }), config: cfg, blocked: { winnerBlocked: true }, counts: { pairInWindow: 1, winnerInWindow: 9 } }
  assert.equal(decideReward(all).status, 'BANNED')
  assert.equal(decideReward({ ...all, blocked: {} }).status, 'IDLE_OPPONENT')
  assert.equal(decideReward({ ...all, blocked: {}, match: played() }).status, 'SAME_PAIR')
  assert.equal(decideReward({ ...all, blocked: {}, match: played(), counts: { pairInWindow: 0, winnerInWindow: 9 } }).status, 'CAPPED')
})

test('what the winner is told: pack on a win, the reason on a cap/pair/idle/forfeit, nothing otherwise', () => {
  const pack = { name: 'Starter Pack', imagePath: '/p.png' }
  const dec = (over) => ({ status: 'AWARDED', reason: null, configured: true, ...over })
  assert.deepEqual(noticeFor(dec({}), pack), { status: 'AWARDED', packName: 'Starter Pack', packImagePath: '/p.png' })
  assert.deepEqual(noticeFor(dec({ status: 'CAPPED' }), pack), { status: 'CAPPED' })
  assert.deepEqual(noticeFor(dec({ status: 'SAME_PAIR' }), pack), { status: 'SAME_PAIR' })
  assert.deepEqual(noticeFor(dec({ status: 'IDLE_OPPONENT' }), pack), { status: 'IDLE_OPPONENT' })
  assert.deepEqual(noticeFor(dec({ status: 'SKIPPED', reason: 'forfeit' }), pack), { status: 'FORFEIT' })
  // silent: reward off, banned opponent (never reveal why an opponent was filtered), ties/tournaments
  assert.equal(noticeFor(dec({ configured: false, status: 'OFF' }), pack), null)
  assert.equal(noticeFor(dec({ status: 'BANNED' }), pack), null)
  assert.equal(noticeFor(dec({ status: 'SKIPPED', reason: 'tournament' }), pack), null)
  assert.equal(noticeFor(dec({ status: 'SKIPPED', reason: 'not_a_win' }), pack), null)
})

// ── admin settings ─────────────────────────────────────────────────────────────────────────────────────────────────
const U = '11111111-1111-4111-8111-111111111111'
test('settings: a request that does not mention the reward leaves it alone (a stale tab cannot wipe it)', () => {
  assert.deepEqual(resolveWinPackSettings({ ogGtoonsMatchmakingEnabled: true }, { ogGtoonsWinPackId: U, ogGtoonsWinPackPerUserLimit: 3 }), { changed: false })
  assert.deepEqual(resolveWinPackSettings(null, null), { changed: false })
})

test('settings: pack and limit are all-or-nothing', () => {
  assert.match(resolveWinPackSettings({ ogGtoonsWinPackId: U }, null).error, /both/i)
  assert.match(resolveWinPackSettings({ ogGtoonsWinPackPerUserLimit: 2 }, null).error, /both/i)
  assert.match(resolveWinPackSettings({ ogGtoonsWinPackId: '', ogGtoonsWinPackPerUserLimit: 2 }, null).error, /both/i)
  // sending only one field combines it with the stored other
  assert.deepEqual(resolveWinPackSettings({ ogGtoonsWinPackPerUserLimit: 5 }, { ogGtoonsWinPackId: U, ogGtoonsWinPackPerUserLimit: 2 }), { changed: true, packId: U, limit: 5 })
})

test('settings: clearing both turns the reward off', () => {
  assert.deepEqual(resolveWinPackSettings({ ogGtoonsWinPackId: null, ogGtoonsWinPackPerUserLimit: null }, { ogGtoonsWinPackId: U, ogGtoonsWinPackPerUserLimit: 2 }), { changed: true, packId: null, limit: null })
  assert.deepEqual(resolveWinPackSettings({ ogGtoonsWinPackId: '', ogGtoonsWinPackPerUserLimit: '' }, null), { changed: true, packId: null, limit: null })
})

test('settings: limit must be a whole number from 1 to MAX_PER_USER_LIMIT; pack must be a UUID', () => {
  assert.equal(MAX_PER_USER_LIMIT, 100)
  for (const bad of [0, -1, 1.5, 101, 'abc', NaN]) {
    assert.ok(resolveWinPackSettings({ ogGtoonsWinPackId: U, ogGtoonsWinPackPerUserLimit: bad }, null).error, String(bad))
  }
  assert.ok(!resolveWinPackSettings({ ogGtoonsWinPackId: U, ogGtoonsWinPackPerUserLimit: 100 }, null).error)
  assert.ok(!resolveWinPackSettings({ ogGtoonsWinPackId: U, ogGtoonsWinPackPerUserLimit: '3' }, null).error, 'numeric strings from a form are accepted')
  assert.match(resolveWinPackSettings({ ogGtoonsWinPackId: 'not-a-uuid', ogGtoonsWinPackPerUserLimit: 2 }, null).error, /valid pack/)
})
