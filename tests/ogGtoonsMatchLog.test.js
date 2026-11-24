import test from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  listOgGtoonMatches, buildOgGtoonsLogWhere, describeOgGtoonsResult, OG_GTOONS_LOG_PAGE_SIZE
} = await import(join(root, 'server/utils/ogGtoonsMatchLog.js'))

function fakeDelegate (rows, total = rows.length) {
  const calls = { count: [], findMany: [] }
  return {
    calls,
    async count (args) { calls.count.push(args); return total },
    async findMany (args) { calls.findMany.push(args); return rows }
  }
}

const alice = { id: 'a', username: 'alice' }
const bob = { id: 'b', username: 'bob' }

function row (over = {}) {
  return {
    id: 'm1',
    startedAt: new Date('2026-11-20T01:00:00Z'),
    endedAt: new Date('2026-11-20T01:10:00Z'),
    player1Points: 50,
    player2Points: 50,
    player1Score: 41,
    player2Score: 37,
    outcome: 'PLAYER1',
    winReason: 'POINTS',
    isChallenge: false,
    tournamentMatchId: null,
    whoLeftUserId: null,
    player1: alice,
    player2: bob,
    winner: alice,
    whoLeft: null,
    ...over
  }
}

test('lists newest first with the four fields admins asked for', async () => {
  const db = fakeDelegate([row()])
  const res = await listOgGtoonMatches(db, {})
  const args = db.calls.findMany[0]
  assert.deepEqual(args.orderBy, [{ startedAt: 'desc' }, { id: 'desc' }])
  assert.equal(args.take, OG_GTOONS_LOG_PAGE_SIZE)
  assert.equal(args.skip, 0)
  const m = res.matches[0]
  assert.equal(m.player1.username, 'alice')
  assert.equal(m.player2.username, 'bob')
  assert.equal(m.winner, 'alice')
  assert.equal(m.player1Staked, 50)
  assert.equal(m.player2Staked, 50)
  assert.equal(m.pot, 100)
  assert.equal(m.score, '41-37')
  assert.equal(m.result, 'Won on points')
  assert.equal(m.type, 'Queue')
})

test('pages server-side', async () => {
  const db = fakeDelegate([], 120)
  const res = await listOgGtoonMatches(db, { page: '3' })
  assert.equal(db.calls.findMany[0].skip, 2 * OG_GTOONS_LOG_PAGE_SIZE)
  assert.equal(res.page, 3)
  assert.equal(res.totalPages, Math.ceil(120 / OG_GTOONS_LOG_PAGE_SIZE))
  const bad = await listOgGtoonMatches(fakeDelegate([]), { page: 'x' })
  assert.equal(bad.page, 1)
})

test('username matches either player, exact and case-insensitive', () => {
  const where = buildOgGtoonsLogWhere({ username: '  Alice ' })
  const f = { username: { equals: 'Alice', mode: 'insensitive' } }
  assert.deepEqual(where.OR, [{ player1: f }, { player2: f }])
  assert.deepEqual(buildOgGtoonsLogWhere({ username: '   ' }), {})
})

test('date range covers whole days and fixes a swapped range', () => {
  const where = buildOgGtoonsLogWhere({ from: '2026-11-01', to: '2026-11-05' })
  assert.equal(where.startedAt.gte.toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(where.startedAt.lte.toISOString(), '2026-11-05T23:59:59.999Z')
  const swapped = buildOgGtoonsLogWhere({ from: '2026-11-05', to: '2026-11-01' })
  assert.equal(swapped.startedAt.gte.toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(swapped.startedAt.lte.toISOString(), '2026-11-05T23:59:59.999Z')
  assert.deepEqual(buildOgGtoonsLogWhere({ from: 'nope', to: '2026-13-99' }), {})
})

test('ties, forfeits, incomplete and tournament games read clearly', async () => {
  assert.equal(describeOgGtoonsResult(row({ outcome: 'TIE', winner: null, winReason: null })), 'Tie')
  assert.equal(describeOgGtoonsResult(row({ outcome: 'INCOMPLETE' })), 'Incomplete')
  assert.equal(describeOgGtoonsResult(row({ outcome: 'PLAYER2', whoLeftUserId: 'a', whoLeft: alice, winReason: null })), 'Forfeit (alice left)')
  assert.equal(describeOgGtoonsResult(row({ winReason: 'COLOR' })), 'Won on color')

  const res = await listOgGtoonMatches(fakeDelegate([
    row({ id: 't', outcome: 'TIE', winner: null, player1Points: 0, player2Points: 0 }),
    row({ id: 'c', outcome: 'PLAYER2', winner: bob, isChallenge: true }),
    row({ id: 'r', tournamentMatchId: 'tm1', isChallenge: true })
  ]), {})
  const [tie, challenge, tourney] = res.matches
  assert.equal(tie.winner, null)
  assert.equal(tie.pot, 0)
  assert.equal(challenge.winner, 'bob')
  assert.equal(challenge.type, 'Challenge')
  assert.equal(tourney.type, 'Tournament')
})
