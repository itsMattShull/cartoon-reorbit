import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  clampConfig, compareHands, CHARACTERS, CHARACTER_IDS, isHand, HANDS, HAND_ART, ROUND_BREAK_MS
} from '../lib/edRps.js'
import { COMBAT_POOL_GAME_NAMES } from '../server/utils/gamePoints.js'

// Adding a game to this codebase means repeating two strings across a handful of files that
// have no reference to each other: the GameConfig.gameName ('EdRps') and the tile slot key
// ('edrps'). Nothing at runtime checks they agree, and each mismatch fails somewhere far from
// the typo — a wrong gameName silently pays from the wrong daily pool, a wrong slot key gives
// the admin an upload button whose image never appears on the Games page.

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const GAME_NAME = 'EdRps'
const SLOT = 'edrps'

test('the gameName string agrees everywhere it is duplicated', () => {
  // The points pool is the one that costs real money to get wrong: this constant is both the
  // inclusion list for combat games and the exclusion list for the arcade pool.
  assert.ok(
    COMBAT_POOL_GAME_NAMES.includes(GAME_NAME),
    'EdRps must be in COMBAT_POOL_GAME_NAMES or its wins are charged to both daily pools'
  )

  for (const file of [
    'server/api/admin/game-config.get.js',
    'server/api/admin/game-config.post.js',
    'prisma/seed.js'
  ]) {
    assert.ok(read(file).includes(`'${GAME_NAME}'`), `${file} is missing the ${GAME_NAME} branch`)
  }

  // The runtime is what actually writes GamePointLog.gameName.
  assert.ok(
    read('server/utils/edRpsRuntime.js').includes(`const GAME_NAME = '${GAME_NAME}'`),
    'the runtime writes a different gameName than the admin and seed use'
  )
})

test('the tile slot key is wired through all four places it has to appear', () => {
  const files = {
    'server/api/game-tile-images.get.js': `${SLOT}:`,
    'server/api/admin/game-tile-image.post.js': `${SLOT}:`,
    'server/api/admin/game-tile-image.delete.js': `${SLOT}:`,
    'components/newsite/GamesHome.vue': `tiles.${SLOT}`
  }
  for (const [file, needle] of Object.entries(files)) {
    assert.ok(read(file).includes(needle), `${file} is missing the "${SLOT}" tile slot`)
  }

  // The upload endpoint and the read endpoint must name the SAME column, or an uploaded tile
  // writes one field and the Games page reads another.
  const column = 'gameTileEdrpsImagePath'
  for (const file of [
    'server/api/game-tile-images.get.js',
    'server/api/admin/game-tile-image.post.js',
    'server/api/admin/game-tile-image.delete.js',
    'prisma/schema.prisma'
  ]) {
    assert.ok(read(file).includes(column), `${file} does not reference ${column}`)
  }
})

test('the Games page tile grid has a row for every tile', () => {
  const src = read('components/newsite/GamesHome.vue')
  const tiles = (src.match(/class="quadrant quadrant--/g) || []).length
  const rows = Number(/grid-template-rows: repeat\((\d+), 1fr\)/.exec(src)?.[1])
  // Two columns, so N tiles need ceil(N/2) explicit rows. A short grid drops the last tiles
  // into an implicit auto-height row, and because .tile-img is absolutely positioned that row
  // collapses to nothing — the tile is present but invisible.
  assert.equal(rows, Math.ceil(tiles / 2), `${tiles} tiles need ${Math.ceil(tiles / 2)} grid rows, found ${rows}`)
})

test('every Manage Games tab has a panel, and EdRps is one of them', () => {
  const src = read('pages/admin/games.vue')

  const tabsBlock = /const tabs = \[([\s\S]*?)\n\]/.exec(src)?.[1]
  assert.ok(tabsBlock, 'could not find the tabs array')
  const keys = [...tabsBlock.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1])

  assert.ok(keys.includes('EdRps'), 'Ed, Edd n Eddy RPS has no tab on the Manage Games page')

  // A tab whose key has no matching panel renders as a blank page rather than an error, so
  // nothing surfaces the mistake at runtime.
  for (const key of keys) {
    assert.ok(
      src.includes(`activeTab === '${key}'`),
      `tab "${key}" has no <section v-if="activeTab === '${key}'"> panel`
    )
  }
})

test("the EdRps config load cannot take the other games' settings down with it", () => {
  const src = read('pages/admin/games.vue')
  const fetchIdx = src.indexOf("game-config?gameName=EdRps")
  assert.notEqual(fetchIdx, -1, 'games.vue never loads the EdRps config')

  // loadSettings() is one unbroken await chain with no try/catch at its call site, and this
  // fetch is not the last link in it. Unguarded, a rejection here — a database that predates
  // the migration, say — silently abandons every config loaded after it, leaving those tabs
  // showing defaults that a save would then write over the real values.
  const before = src.slice(Math.max(0, fetchIdx - 400), fetchIdx)
  assert.ok(
    /try\s*\{[^}]*$/.test(before.replace(/\n/g, ' ')) || before.includes('try {'),
    'the EdRps game-config fetch is not inside a try block'
  )
})

test('the leaderboard endpoint the component points at exists', () => {
  const src = read('components/newsite/Leaderboards.vue')
  const match = /key: 'edrps'.*?endpoint: '([^']+)'/.exec(src)
  assert.ok(match, 'Leaderboards.vue has no edrps entry')
  const route = match[1].replace(/^\/api\//, 'server/api/') + '.get.js'
  assert.doesNotThrow(() => read(route), `${route} does not exist`)
})

test('round scoring is a correct rock-paper-scissors', () => {
  const [ROCK, PAPER, SCISSORS] = [0, 1, 2]
  assert.equal(compareHands(ROCK, SCISSORS), 1)
  assert.equal(compareHands(SCISSORS, PAPER), 1)
  assert.equal(compareHands(PAPER, ROCK), 1)
  assert.equal(compareHands(SCISSORS, ROCK), -1)
  assert.equal(compareHands(PAPER, SCISSORS), -1)
  assert.equal(compareHands(ROCK, PAPER), -1)
  for (const h of [ROCK, PAPER, SCISSORS]) assert.equal(compareHands(h, h), 0)

  // Every pairing must be decisive in exactly one direction. Stated as a sum rather than
  // `a === -b` so that the tie case compares 0 to 0 instead of 0 to -0, which strict equality
  // treats as different.
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      assert.equal(compareHands(a, b) + compareHands(b, a), 0, `${a} vs ${b} is not antisymmetric`)
    }
  }
})

test('hand validation rejects everything that is not a hand index', () => {
  for (const good of [0, 1, 2]) assert.equal(isHand(good), true)
  for (const bad of [-1, 3, 1.5, NaN, Infinity, null, undefined, '1', {}, []]) {
    assert.equal(isHand(bad), false, `${String(bad)} was accepted as a hand`)
  }
  assert.equal(HANDS.length, 3)
})

test('config clamping keeps a match finishable no matter what an admin saves', () => {
  // Out-of-range and junk values fall back to sane numbers rather than throwing.
  const junk = clampConfig({ roundSeconds: 9999, winsNeeded: 0, maxRounds: -5, pairDailyAwardLimit: 'x' })
  assert.equal(junk.roundSeconds, 60)
  assert.equal(junk.winsNeeded, 1)
  assert.equal(junk.pairDailyAwardLimit, 2)

  // The invariant that matters: a first-to-N match needs at least 2N-1 rounds, or a match
  // sitting at match point could never resolve and would hang until the sweeper killed it.
  for (let wins = 1; wins <= 10; wins++) {
    const cfg = clampConfig({ winsNeeded: wins, maxRounds: 1 })
    assert.ok(
      cfg.maxRounds >= cfg.winsNeeded * 2 - 1,
      `first-to-${cfg.winsNeeded} needs >= ${cfg.winsNeeded * 2 - 1} rounds, got ${cfg.maxRounds}`
    )
  }

  const dflt = clampConfig({})
  assert.equal(dflt.winsNeeded, 4)
  assert.equal(dflt.maxRounds, 7)
})

test('each hand has art on disk, indexed to match HANDS', () => {
  assert.equal(HAND_ART.length, HANDS.length, 'HAND_ART and HANDS have drifted out of step')
  for (const [i, hand] of HAND_ART.entries()) {
    // The index IS the wire value, so a reordering here silently draws the wrong hand for a
    // throw rather than failing.
    assert.ok(hand.art.includes(HANDS[i]), `HAND_ART[${i}] is "${hand.art}" but HANDS[${i}] is "${HANDS[i]}"`)
    assert.doesNotThrow(
      () => readFileSync(join(root, 'public', hand.art)),
      `${HANDS[i]} art missing at public${hand.art}`
    )
    assert.ok(hand.width > 0 && hand.height > 0, `${HANDS[i]} art has no intrinsic dimensions`)
  }
})

test('the throw UI does not depend on emoji glyphs', () => {
  // Emoji are a font, not a guarantee. The game shipped with ✊/✋/✌️ and they rendered as
  // nothing in a real match on a device without the coverage — the throws were invisible.
  // Everything load-bearing in the match UI is an image or a CSS shape now.
  const page = read('pages/newsite/edrps.vue')
  const templateEnd = page.indexOf('</template>')
  const template = page.slice(0, templateEnd)
  const emoji = template.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu) || []
  assert.deepEqual(
    emoji, [],
    `the match template still contains emoji (${emoji.join(' ')}) — use art or a CSS shape`
  )
})

test('the round-result beat is shared by both sides', () => {
  assert.ok(ROUND_BREAK_MS >= 1500, 'the pause is too short to read the round result')
  // The server owns the pause between rounds; the client holds its match-over panel for the
  // same span. Hard-coding either separately lets them drift, and the final round's result
  // then either flashes past or lingers after the next round has already started.
  assert.ok(
    read('server/utils/edRpsRuntime.js').includes('ROUND_BREAK_MS'),
    'the server does not use the shared round-break constant'
  )
  assert.ok(
    read('pages/newsite/edrps.vue').includes('ROUND_BREAK_MS'),
    'the page does not use the shared round-break constant'
  )
})

test('every character has art on disk and a full set of reaction lines', () => {
  assert.deepEqual(CHARACTER_IDS, ['ed', 'edd', 'eddy'])
  for (const c of CHARACTERS) {
    assert.doesNotThrow(
      () => readFileSync(join(root, 'public', c.art)),
      `${c.id} art missing at public${c.art}`
    )
    for (const key of ['win', 'lose', 'tie']) {
      assert.ok(c.lines[key]?.length > 0, `${c.id} has no ${key} lines`)
    }
    // The sprites are trimmed to their own bounding box, so these differ per character and
    // are what stop the scene reflowing while the art decodes.
    assert.ok(c.width > 0 && c.height > 0, `${c.id} is missing intrinsic dimensions`)
  }
})
