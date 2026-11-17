// Frozen decks: a locked deck's copies cannot leave a player's collection while they are still in the tournament.
// Pure tests over a fake `db` (no Postgres); the real queries are exercised in ogGtoonTournament.db.test.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshotCopyIds, frozenCopyMap, frozenAmong, isOutOfBracket, FREEZE_STATUSES } from '../server/utils/ogGtoonTournamentFreeze.js'

const deck = (prefix) => Array.from({ length: 12 }, (_, i) => ({ position: i, ctoonId: `c${i}`, userCtoonId: `${prefix}${i}` }))

/** A fake db that answers the two queries the helper makes. */
function fakeDb({ entries = [], bracketMatches = [] } = {}) {
  return {
    ogGtoonTournamentOptIn: {
      findMany: async ({ where }) => entries.filter(e =>
        e.userId === where.userId && e.isActive && !e.disqualified && where.tournament.status.in.includes(e.tournament.status))
    },
    ogGtoonTournamentMatch: {
      findMany: async ({ where }) => bracketMatches.filter(m =>
        m.tournamentId === where.tournamentId && (m.playerAUserId === where.OR[0].playerAUserId || m.playerBUserId === where.OR[1].playerBUserId))
    }
  }
}

const entry = (over = {}, tournament = {}) => ({
  userId: 'u1', isActive: true, disqualified: false, deckSnapshotJson: deck('uc'),
  tournament: { id: 't1', name: 'Cup', status: 'SWISS_ACTIVE', format: 'SWISS_THEN_TOP8', ...tournament }, ...over
})

test('snapshotCopyIds reads the copies out of a locked deck and ignores junk', () => {
  assert.deepEqual(snapshotCopyIds(deck('x')).length, 12)
  assert.deepEqual(snapshotCopyIds(null), [])
  assert.deepEqual(snapshotCopyIds([{ position: 0 }, null, { userCtoonId: 'a' }]), ['a'])
})

test('every copy in the locked deck of an active entrant is frozen, from the moment they lock in', async () => {
  for (const status of FREEZE_STATUSES) {
    const m = await frozenCopyMap(fakeDb({ entries: [entry({}, { status, format: 'BRACKET_8_OR_LESS' })] }), 'u1')
    assert.equal(m.size, 12, status)
    assert.equal(m.get('uc0').tournamentName, 'Cup')
  }
})

test('a player with no tournament entry (the common case) has nothing frozen', async () => {
  const db = fakeDb({ entries: [] })
  assert.equal((await frozenCopyMap(db, 'u1')).size, 0)
  assert.deepEqual(await frozenAmong(db, 'u1', ['uc0']), [])
  assert.deepEqual(await frozenAmong(db, 'u1', []), [])
})

test('released when the tournament ends, is cancelled, or the player leaves or is disqualified', async () => {
  for (const status of ['COMPLETE', 'CANCELLED', 'DRAFT']) {
    assert.equal((await frozenCopyMap(fakeDb({ entries: [entry({}, { status })] }), 'u1')).size, 0, status)
  }
  assert.equal((await frozenCopyMap(fakeDb({ entries: [entry({ isActive: false })] }), 'u1')).size, 0, 'opted out')
  assert.equal((await frozenCopyMap(fakeDb({ entries: [entry({ disqualified: true })] }), 'u1')).size, 0, 'disqualified')
})

test('only copies in the deck are frozen, and another player\'s copies never are', async () => {
  const db = fakeDb({ entries: [entry()] })
  assert.deepEqual(await frozenAmong(db, 'u1', ['uc3', 'not-in-deck', 'uc11']), ['uc3', 'uc11'])
  assert.deepEqual(await frozenAmong(db, 'someone-else', ['uc3']), [])
})

test('in the bracket a lost match releases the deck; a won or open one keeps it frozen', async () => {
  const t = { status: 'BRACKET_ACTIVE', format: 'BRACKET_8_OR_LESS' }
  const lost = fakeDb({ entries: [entry({}, t)], bracketMatches: [{ tournamentId: 't1', playerAUserId: 'u1', playerBUserId: 'u2', status: 'COMPLETE', winnerUserId: 'u2' }] })
  assert.equal((await frozenCopyMap(lost, 'u1')).size, 0)
  const won = fakeDb({ entries: [entry({}, t)], bracketMatches: [{ tournamentId: 't1', playerAUserId: 'u1', playerBUserId: 'u2', status: 'COMPLETE', winnerUserId: 'u1' }] })
  assert.equal((await frozenCopyMap(won, 'u1')).size, 12)
  const open = fakeDb({ entries: [entry({}, t)], bracketMatches: [{ tournamentId: 't1', playerAUserId: 'u1', playerBUserId: 'u2', status: 'PENDING', winnerUserId: null }] })
  assert.equal((await frozenCopyMap(open, 'u1')).size, 12)
})

test('a Swiss player who missed the Top 8 cut is released once the bracket starts, but a straight bracket entrant is not', async () => {
  const swissCut = fakeDb({ entries: [entry({}, { status: 'BRACKET_ACTIVE', format: 'SWISS_THEN_TOP8' })], bracketMatches: [] })
  assert.equal((await frozenCopyMap(swissCut, 'u1')).size, 0)
  assert.equal(await isOutOfBracket(swissCut, { id: 't1', status: 'BRACKET_ACTIVE', format: 'SWISS_THEN_TOP8' }, 'u1'), true)
  const straight = fakeDb({ entries: [entry({}, { status: 'BRACKET_ACTIVE', format: 'BRACKET_8_OR_LESS' })], bracketMatches: [] })
  assert.equal((await frozenCopyMap(straight, 'u1')).size, 12, 'a straight bracket gives everyone a match, so none is out yet')
  const swiss = fakeDb({ entries: [entry({}, { status: 'SWISS_ACTIVE' })] })
  assert.equal(await isOutOfBracket(swiss, { id: 't1', status: 'SWISS_ACTIVE', format: 'SWISS_THEN_TOP8' }, 'u1'), false, 'Swiss is never out')
})

/* ── wiring: every user-initiated way a card can leave is guarded, and repair is gone ──── */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => readFileSync(join(root, p), 'utf8')

test('trade create/counter, trade accept, auction create, wishlist accept and holiday open all consult the freeze', () => {
  for (const [file, needle] of [
    ['server/utils/tradeOffer.js', /frozenAmong\(prisma, initiatorId, resolvedOffered\)/],
    ['server/utils/tradeOffer.js', /frozenAmong\(prisma, recipient\.id, resolvedRequested\)/],
    ['server/api/trade/offers/[id]/accept.post.js', /frozenAmong\(tx, offer\.initiatorId, offeredIds\)/],
    ['server/api/trade/offers/[id]/accept.post.js', /frozenAmong\(tx, offer\.recipientId, requestedIds\)/],
    ['server/api/auctions.post.js', /frozenAmong\(tx, userId, \[resolvedUserCtoonId\]\)/],
    ['server/api/wishlist/accept/[id].post.js', /frozenCopyMap\(prisma, recipientId\)/],
    ['server/api/wishlist/accept/[id].post.js', /frozenCopyMap\(tx, recipientId\)/],
    ['server/api/holiday/redeem.post.js', /frozenAmong\(prisma, userId, \[userCtoonId\]\)/],
    ['server/workers/holiday-redeem.worker.js', /frozenAmong\(prisma, userId, \[userCtoonId\]\)/]
  ]) {
    assert.match(src(file), needle, `${file} must consult the tournament freeze`)
  }
})

test('deck repair is gone: no endpoint, no orchestration function, no panel UI', () => {
  assert.equal(existsSync(join(root, 'server/api/game/oggtoons/tournaments/[id]/repair-deck.post.js')), false)
  assert.doesNotMatch(src('server/utils/ogGtoonTournament.js'), /export async function repairLockedDeck/)
  assert.doesNotMatch(src('components/oggtoons/OgGtoonTournamentPanel.vue'), /repair-deck|openRepair|submitRepair/)
})
