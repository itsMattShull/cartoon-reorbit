// Every Discord message about an OG gToons tournament links to the tournament's own page. If the helper and the page
// ever drift apart, every DM (pairing, "your opponent is ready", results) lands players on a 404 — and nothing else
// would notice. This pins them together without needing a database.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const TOURNAMENT = 'server/utils/ogGtoonTournament.js'

test('getOgTournamentUrl points at /newsite/gtoons-classic/tournaments/<id>, and that page exists', () => {
  const src = read(TOURNAMENT)
  const m = src.match(/export function getOgTournamentUrl\(tournamentId\) \{\s*return `([^`]+)`/)
  assert.ok(m, 'getOgTournamentUrl not found')
  assert.equal(m[1], '${baseUrl()}/newsite/gtoons-classic/tournaments/${tournamentId}')
  assert.ok(existsSync(new URL('../pages/newsite/gtoons-classic/tournaments/[tid].vue', import.meta.url)), 'the page the link points at must exist')
})

test('no tournament message builds its own URL: they all go through getOgTournamentUrl', () => {
  const src = read(TOURNAMENT)
  const code = src.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n') // comments may describe the route freely
  assert.equal((code.match(/gtoons-classic/g) || []).length, 1, 'only the helper itself may spell out the route')
  assert.ok((src.match(/getOgTournamentUrl\(/g) || []).length >= 6, 'pairing, decided, announcement, results, no-show and ready-up messages')
})

test('a link sent before the tournament page existed still lands somewhere useful', () => {
  // ?tab=tournaments&t=<id> opens the hub's Tournaments tab, which forwards to the tournament page.
  const tab = read('components/oggtoons/OgGtoonTournaments.vue')
  assert.match(tab, /route\.query\.t/)
  assert.match(tab, /router\.replace\(pageFor\(legacy\)\)/)
})

test('every hub tab is addressable: the URL follows the tab and the tab follows the URL', () => {
  // The behaviour itself is tested against a real router in tests/hubTabUrl.test.js; this checks the hub actually uses it.
  const hub = read('pages/newsite/gtoons-classic/index.vue')
  assert.match(hub, /import \{ syncTabWithUrl \} from '@\/utils\/hubTabUrl'/)
  assert.match(hub, /syncTabWithUrl\(\{ route, router, activeTab, ready,/)
  for (const id of ['decks', 'matchmaking', 'leaderboard', 'meta', 'tournaments']) assert.match(hub, new RegExp(`id: '${id}'`))
})

test('the tournament page takes players to the board when a game starts', () => {
  const page = read('pages/newsite/gtoons-classic/tournaments/[tid].vue')
  assert.match(page, /watch\(currentMatchId/)
  assert.match(page, /router\.push\(`\/newsite\/gtoons-classic\/\$\{id\}`\)/)
  assert.match(page, /OgGtoonTournamentPanel/)
})
