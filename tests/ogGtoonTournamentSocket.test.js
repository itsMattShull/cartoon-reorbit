import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { serializeMatch } = await import(join(root, 'server/utils/ogGtoonsMatchSerialize.js'))
const { publicMatchView } = await import(join(root, 'server/utils/ogGtoonMatchCore.js'))

const tournament = { matchId: 'tm1', tournamentId: 't1', name: 'Cup', stage: 'BRACKET', label: 'Final', bestOf: 3, gameNumber: 2 }

function baseMatch(extra = {}) {
  return {
    id: 'm1', players: ['u1', 'u2'], usernames: ['A', 'B'], deckOrder: [[], []], hand: [[], []], undealt: [[], []],
    discarded: [[], []], placements: [[], []], phase: 'play', discardReady: [false, false], goalColor: ['RED', 'BLUE'],
    goalCardIdx: [11, 11], swapUsed: [false, false], gameLog: [], swapReady: [false, false], pendingSwap: [null, null],
    colorReady: [false, false], pendingColor: [null, null], silverColor: [null, null], colorDone: false, deadline: null,
    ready: [false, false], held: [null, null], revealed: [[], []], stake: [0, 0], currentRound: 1, isChallenge: false,
    startedAt: 1, lastActivity: 1, ...extra
  }
}

test('the Redis mirror keeps the tournament tag, so a restart cannot turn a tournament game into a casual one', () => {
  const restored = JSON.parse(JSON.stringify(serializeMatch(baseMatch({ tournament }))))
  assert.deepEqual(restored.tournament, tournament)
  assert.equal(JSON.parse(JSON.stringify(serializeMatch(baseMatch()))).tournament, null)
})

test('a tournament game tells both players which pairing it belongs to; casual games are unchanged', () => {
  const view = publicMatchView(baseMatch({ tournament }), 'u1')
  assert.deepEqual(view.tournament, tournament)
  assert.equal('tournament' in publicMatchView(baseMatch(), 'u1'), false)
})

test('socket-server wires the tournament module and every tournament event name is used by the client composable too', () => {
  const server = readFileSync(join(root, 'server/utils/ogGtoonsSocket.js'), 'utf8')
  assert.match(server, /registerOgGtoonsTournament\(io, socket,/)
  const mod = readFileSync(join(root, 'server/utils/ogGtoonsTournamentSocket.js'), 'utf8')
  for (const ev of ['tournamentReady', 'tournamentUnready', 'tournamentSync', 'tournamentState', 'tournamentOpponentReady']) {
    assert.match(mod, new RegExp(`EV\\('${ev}'\\)`), `${ev} handled/emitted by the server module`)
  }
})
