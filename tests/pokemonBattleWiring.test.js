import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  TYPES, isType, compareTypes, counterOf, POKEMON, POKEMON_BY_TYPE, battleText,
  hpFraction, hpState, chooseAiMove, clampConfig, CONFIG_LIMITS,
  lineBudgetMs, TIE_BREAK_MS, DECISIVE_BREAK_MS, intermissionMs,
  PALETTE, CONTRAST_PAIRS, HP_LUMINANCE_GAP, AI_TIERS
} from '../lib/pokemonBattle.js'
import { COMBAT_POOL_GAME_NAMES } from '../server/utils/gamePoints.js'
import { DUEL_PAIR_SCOPE } from '../server/utils/duelPairScope.js'

// Adding a game to this codebase means repeating a handful of strings across files that have no
// reference to each other. Nothing at runtime checks they agree, and each mismatch fails
// somewhere far from the typo: a wrong gameName pays from the wrong daily pool, a wrong tile key
// gives the admin an upload button whose image never appears.

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

// Source-contract assertions must look at CODE, not prose. Every file here documents the
// mistake it is avoiding, so a naive substring check matches the comment explaining why
// Math.random is wrong and fails the very file that got it right.
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:'"`\\])\/\/.*$/gm, '$1')

const GAME_NAME = 'PokemonBattle'
const SLOT = 'pokemonbattle'

/* ── Rules ─────────────────────────────────────────────────────────────────────────────── */

test('the type chart is a correct three-way cycle', () => {
  const [FIRE, WATER, GRASS] = [0, 1, 2]
  assert.equal(compareTypes(WATER, FIRE), 1, 'water must beat fire')
  assert.equal(compareTypes(FIRE, GRASS), 1, 'fire must beat grass')
  assert.equal(compareTypes(GRASS, WATER), 1, 'grass must beat water')
  assert.equal(compareTypes(FIRE, WATER), -1)
  assert.equal(compareTypes(GRASS, FIRE), -1)
  assert.equal(compareTypes(WATER, GRASS), -1)
  for (const t of TYPES.keys()) assert.equal(compareTypes(t, t), 0)

  // Every pairing decisive in exactly one direction. Stated as a sum so the tie case compares
  // 0 to 0 rather than 0 to -0, which strict equality treats as different.
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      assert.equal(compareTypes(a, b) + compareTypes(b, a), 0, `${a} vs ${b} is not antisymmetric`)
    }
  }
  for (let t = 0; t < 3; t++) assert.equal(compareTypes(counterOf(t), t), 1, 'counterOf must beat its argument')
})

test('type validation rejects everything that is not a type index', () => {
  for (const good of [0, 1, 2]) assert.equal(isType(good), true)
  for (const bad of [-1, 3, 1.5, NaN, Infinity, null, undefined, '1', {}, []]) {
    assert.equal(isType(bad), false, `${String(bad)} was accepted as a type`)
  }
  assert.equal(TYPES.length, 3)
})

test('each Pokemon is indexed to its own type', () => {
  // The index IS the wire value, so a reordering here would silently draw the wrong Pokemon
  // for a move rather than failing.
  assert.equal(POKEMON_BY_TYPE.length, TYPES.length)
  for (const [i, mon] of POKEMON_BY_TYPE.entries()) {
    assert.ok(mon, `no Pokemon for type index ${i}`)
    assert.equal(mon.type, i, `${mon.name} is at index ${i} but claims type ${mon.type}`)
    assert.ok(mon.moves.length > 0, `${mon.name} has no moves`)
    for (const key of ['win', 'lose', 'tie']) {
      assert.ok(mon.lines[key]?.length > 0, `${mon.name} has no ${key} lines`)
    }
  }
  assert.equal(new Set(POKEMON.map(p => p.id)).size, POKEMON.length, 'duplicate Pokemon id')
})

test('config clamping keeps a battle finishable no matter what an admin saves', () => {
  const junk = clampConfig({ roundSeconds: 9999, winsNeeded: 0, maxRounds: -5, pairDailyAwardLimit: 'x' })
  assert.equal(junk.roundSeconds, CONFIG_LIMITS.roundSeconds.max)
  assert.equal(junk.winsNeeded, CONFIG_LIMITS.winsNeeded.min)
  assert.equal(junk.pairDailyAwardLimit, CONFIG_LIMITS.pairDailyAwardLimit.default)

  // The invariant that matters: a first-to-N battle needs at least 2N-1 rounds, or a match at
  // match point could never resolve and would hang until the sweeper killed it.
  for (let wins = CONFIG_LIMITS.winsNeeded.min; wins <= CONFIG_LIMITS.winsNeeded.max; wins++) {
    const cfg = clampConfig({ winsNeeded: wins, maxRounds: 1 })
    assert.ok(cfg.maxRounds >= cfg.winsNeeded * 2 - 1,
      `first-to-${cfg.winsNeeded} needs >= ${cfg.winsNeeded * 2 - 1} rounds, got ${cfg.maxRounds}`)
  }
})

/* ── HP ────────────────────────────────────────────────────────────────────────────────── */

test('HP is a fraction that degrades across the whole configurable range', () => {
  for (let w = CONFIG_LIMITS.winsNeeded.min; w <= CONFIG_LIMITS.winsNeeded.max; w++) {
    assert.equal(hpFraction(0, w), 1, 'full HP at zero losses')
    assert.equal(hpFraction(w, w), 0, 'empty HP at winsNeeded losses')
    // Clamped at both ends: a stale score must never produce a bar wider than its track or a
    // negative scaleX.
    assert.equal(hpFraction(w + 10, w), 0)
    assert.equal(hpFraction(-5, w), 1)
    let prev = 1
    for (let l = 1; l <= w; l++) {
      const f = hpFraction(l, w)
      assert.ok(f < prev, 'HP must fall monotonically')
      assert.ok(f >= 0 && f <= 1)
      prev = f
    }
  }
  assert.equal(hpState(1), 'ok')
  assert.equal(hpState(0.4), 'low')
  assert.equal(hpState(0), 'critical')
})

/* ── Timing ────────────────────────────────────────────────────────────────────────────── */

test('the reveal text fits inside the intermission the server enforces', () => {
  // The server owns the pause between rounds and ships it as an absolute nextRoundAt. If the
  // client's text sequence runs longer, the next round's timer starts while the loser is still
  // reading -- which costs them rounds, not just polish. Recomputed from the real move names so
  // adding a longer move name fails here rather than in a match.
  let worst = ''
  for (const p of POKEMON) {
    for (const mv of p.moves) {
      const line = `${p.name} used ${mv}!`
      if (line.length > worst.length) worst = line
    }
  }
  const decisive = lineBudgetMs(`Foe ${worst}`) + lineBudgetMs(worst) + lineBudgetMs("It's not very effective...", 600)
  const tie = lineBudgetMs(`Foe ${worst}`) + lineBudgetMs(worst) + lineBudgetMs('Both moves collided!', 600)

  assert.ok(decisive <= DECISIVE_BREAK_MS,
    `decisive text needs ${decisive}ms but the intermission is ${DECISIVE_BREAK_MS}ms`)
  assert.ok(tie <= TIE_BREAK_MS,
    `tie text needs ${tie}ms but the intermission is ${TIE_BREAK_MS}ms`)

  assert.equal(intermissionMs(0), TIE_BREAK_MS)
  assert.equal(intermissionMs(1), DECISIVE_BREAK_MS)
  assert.equal(intermissionMs(-1), DECISIVE_BREAK_MS)
})

test('battle text carries no username, so the text box can be a fixed height', () => {
  // The box is a fixed grid track -- it has to be, or it reflows the move buttons under the
  // player's thumb the instant a round resolves -- and a fixed box needs a bounded string.
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      const t = battleText(a, b, 0)
      assert.ok(t.attack.length < 40, `attack line too long: ${t.attack}`)
      assert.ok(t.verdict.length < 40, `verdict too long: ${t.verdict}`)
      assert.equal(t.cmp, compareTypes(a, b))
    }
  }
})

/* ── Text renderability ────────────────────────────────────────────────────────────────── */

test('every player-visible string is renderable in the Futura face', () => {
  // The self-hosted Futura Bold Condensed maps 336 codepoints and contains no U+00E9, U+2019,
  // U+2026, U+2014 or U+00D7. A missing glyph is drawn by a per-glyph fallback mid-word, at the
  // wrong weight and width -- so the accent in "Pokemon" belongs in the logo art, not in copy.
  const strings = []
  for (const p of POKEMON) {
    strings.push(p.name, ...p.moves, ...p.lines.win, ...p.lines.lose, ...p.lines.tie)
  }
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      const t = battleText(a, b, 0)
      strings.push(t.attack, t.verdict)
    }
  }
  for (const t of AI_TIERS) strings.push(t.label)
  strings.push(...TYPES)

  for (const s of strings) {
    const bad = [...s].filter(ch => ch.codePointAt(0) > 0x7e)
    assert.deepEqual(bad, [], `"${s}" contains non-ASCII (${bad.join(' ')}) the game font cannot draw`)
  }
})

/* ── AI ────────────────────────────────────────────────────────────────────────────────── */

test('the AI cannot see the current round and never reports to the server', () => {
  const page = read('pages/newsite/pokemonbattle.vue')
  const section = page.slice(page.indexOf('/* ── Single player'), page.indexOf('/* ── Keyboard'))
  assert.ok(section.length > 200, 'could not locate the single-player section')

  // Comments stripped: the section's own comment describes the guarantee and would otherwise
  // match every needle below.
  const code = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const needle of ['socket', 'emit', 'fetch', 'XMLHttpRequest', 'sendBeacon']) {
    assert.ok(!code.includes(needle),
      `the single-player path references "${needle}" -- it must never be able to report a result`)
  }

  // The runtime has no concept of an AI at all: a match can only be built from two distinct
  // authenticated sockets, and that is the structural half of the same guarantee.
  const runtime = read('server/utils/pokemonBattleRuntime.js').replace(/\/\/.*$/gm, '')
  assert.ok(!/\b(bot|cpu|practice|solo)\b/i.test(runtime),
    'the PvP runtime mentions a bot/CPU concept; the award path must have no such seat')
})

test('the AI commits before the player moves, and is beatable', () => {
  // A predictive AI that receives the player's pick is literally cheating. chooseAiMove takes
  // history, tier, streak and a random source -- and no current pick, by design.
  const seq = [0, 1, 2, 0, 1, 2, 0, 1]
  const counts = [0, 0, 0]
  for (let i = 0; i < 3000; i++) counts[chooseAiMove(seq, 'champion', 0)]++
  // A perfect cycler is the most predictable input there is, so the top tier should counter it
  // most of the time -- but never all of the time, or the player has no way back in.
  const best = Math.max(...counts) / 3000
  assert.ok(best > 0.5, `champion barely reads a perfect cycle (${best.toFixed(2)})`)
  assert.ok(best < 0.95, `champion is unbeatable against a cycle (${best.toFixed(2)})`)

  // Rookie is pure chance whatever the history.
  const rookie = [0, 0, 0]
  for (let i = 0; i < 3000; i++) rookie[chooseAiMove([0, 0, 0, 0, 0, 0], 'rookie', 0)]++
  for (const c of rookie) assert.ok(Math.abs(c / 3000 - 1 / 3) < 0.06, 'rookie must be uniform')

  // Streak cap: three straight losses in a blind game reads as cheating whether or not it is.
  const capped = [0, 0, 0]
  for (let i = 0; i < 3000; i++) capped[chooseAiMove([0, 0, 0, 0, 0, 0], 'champion', 9)]++
  for (const c of capped) {
    assert.ok(Math.abs(c / 3000 - 1 / 3) < 0.06, 'the streak cap must force a uniform pick')
  }

  // Always a legal move, for every tier and any junk history.
  for (const tier of [...AI_TIERS.map(t => t.id), 'nonsense']) {
    for (const hist of [[], [0], [null, 'x', 7, 1], [2, 2, 2, 2]]) {
      const pick = chooseAiMove(hist, tier, 0)
      assert.ok(isType(pick), `tier ${tier} produced a non-type ${String(pick)}`)
    }
  }
})

/* ── Contrast ──────────────────────────────────────────────────────────────────────────── */

test('the HP palette clears WCAG and survives with hue removed', () => {
  // The repo's two contrast tests scan Tailwind class literals, which cannot see this page at
  // all -- it is scoped CSS. Without a computed check here nothing catches a bad HP palette.
  const lum = (hex) => {
    const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
  }
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  for (const p of CONTRAST_PAIRS) {
    const r = ratio(p.fg, p.bg)
    assert.ok(r >= p.min, `${p.name} is ${r.toFixed(2)}:1, needs ${p.min}:1`)
  }

  // Green/yellow/red is the deuteranopia confusion pair, so the three states must also be
  // separable by lightness alone.
  const ls = [PALETTE.hpCritical, PALETTE.hpLow, PALETTE.hpOk].map(lum).sort((a, b) => a - b)
  for (let i = 1; i < ls.length; i++) {
    assert.ok(ls[i] - ls[i - 1] >= HP_LUMINANCE_GAP,
      `HP states are only ${(ls[i] - ls[i - 1]).toFixed(3)} apart in luminance`)
  }
})

/* ── Wiring ────────────────────────────────────────────────────────────────────────────── */

test('the gameName string agrees everywhere it is duplicated', () => {
  // The points pool costs real money to get wrong: this constant is both the inclusion list for
  // combat games and the exclusion list for the arcade pool, so omitting a game charges its
  // wins to BOTH.
  assert.ok(COMBAT_POOL_GAME_NAMES.includes(GAME_NAME),
    `${GAME_NAME} must be in COMBAT_POOL_GAME_NAMES or its wins are charged to both daily pools`)

  for (const file of [
    'server/api/admin/game-config.get.js',
    'server/api/admin/game-config.post.js',
    'prisma/seed.js'
  ]) {
    assert.ok(read(file).includes(`'${GAME_NAME}'`), `${file} is missing the ${GAME_NAME} branch`)
  }

  const spec = read('server/utils/pokemonBattleRuntime.js')
  assert.ok(spec.includes(`gameName: '${GAME_NAME}'`), 'the runtime writes a different gameName')
  // The delegate and the SQL table name are the pair nothing else can check: a wrong delegate
  // counts another game's rows for the pair limit. duelRuntime asserts it at boot too.
  assert.ok(spec.includes("matchDelegate: 'pokemonBattleMatch'"), 'wrong Prisma delegate')
  assert.ok(spec.includes("matchTable: 'PokemonBattleMatch'"), 'wrong SQL table')
})

test('the per-pair award budget is shared across every duel game', () => {
  // The daily cap bounds what one PLAYER earns; the pair limit bounds what one PAIR can pay
  // each other, so a farmer must find distinct partners. A per-game budget defeats that
  // entirely -- the same two accounts trade their quota once per game.
  assert.ok(DUEL_PAIR_SCOPE.includes('EdRpsMatch'), 'RPS is missing from the shared pair scope')
  assert.ok(DUEL_PAIR_SCOPE.includes('PokemonBattleMatch'), 'Pokemon is missing from the shared pair scope')
  for (const file of ['server/utils/edRpsRuntime.js', 'server/utils/pokemonBattleRuntime.js']) {
    assert.ok(read(file).includes('pairScopeTables: DUEL_PAIR_SCOPE'),
      `${file} does not use the shared pair scope`)
  }
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
  const column = 'gameTilePokemonbattleImagePath'
  for (const file of [
    'server/api/game-tile-images.get.js',
    'server/api/admin/game-tile-image.post.js',
    'server/api/admin/game-tile-image.delete.js',
    'prisma/schema.prisma'
  ]) {
    assert.ok(read(file).includes(column), `${file} does not reference ${column}`)
  }
})

test('every Manage Games tab has a panel, and PokemonBattle is one of them', () => {
  const src = read('components/newsite/admin/legacy/AdminLegacyGames.vue')
  const tabsBlock = /const tabs = \[([\s\S]*?)\n\]/.exec(src)?.[1]
  assert.ok(tabsBlock, 'could not find the tabs array')
  const keys = [...tabsBlock.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1])
  assert.ok(keys.includes(GAME_NAME), 'Pokemon: Fire, Water, Grass! has no tab on the Manage Games page')
  // A tab whose key has no panel renders as a blank page rather than an error.
  for (const key of keys) {
    assert.ok(src.includes(`activeTab === '${key}'`), `tab "${key}" has no matching panel`)
  }
})

test("the config load cannot take the other games' settings down with it", () => {
  const src = read('components/newsite/admin/legacy/AdminLegacyGames.vue')
  const idx = src.indexOf('game-config?gameName=PokemonBattle')
  assert.notEqual(idx, -1, 'the admin page never loads the PokemonBattle config')
  // loadSettings() is one unbroken await chain with no try/catch at its call site, and this
  // fetch is not the last link. Unguarded, a rejection here silently abandons every config
  // loaded after it, leaving those tabs showing defaults a save would write over.
  const before = src.slice(Math.max(0, idx - 500), idx)
  assert.ok(before.includes('try {'), 'the PokemonBattle game-config fetch is not inside a try block')
})

test('the leaderboard endpoint the component points at exists', () => {
  const src = read('components/newsite/Leaderboards.vue')
  const match = /key: 'pokemonbattle'.*?endpoint: '([^']+)'/.exec(src)
  assert.ok(match, 'Leaderboards.vue has no pokemonbattle entry')
  const route = match[1].replace(/^\/api\//, 'server/api/') + '.get.js'
  assert.doesNotThrow(() => read(route), `${route} does not exist`)
})

test('the Games page tile grid derives its rows from the tiles that render', () => {
  // Two columns, so N tiles need ceil(N/2) rows: a short grid drops the last tiles into an
  // implicit auto-height row which collapses to nothing, because .tile-img is absolutely
  // positioned -- present but invisible. This used to be a literal with a comment asking people
  // to bump it. Now that a tile can be hidden at runtime no literal can be right in both
  // states, so the count is computed instead and only TOTAL_TILES has to match reality.
  const src = read('components/newsite/GamesHome.vue')
  const tiles = (src.match(/class="quadrant quadrant--/g) || []).length
  const total = Number(/const TOTAL_TILES = (\d+)/.exec(src)?.[1])
  assert.equal(total, tiles, `TOTAL_TILES is ${total} but the template renders ${tiles} tiles`)
  // Exposed as a --total-rows custom property, not a direct gridTemplateRows binding: an inline
  // style always outranks a stylesheet rule, so binding the property itself would permanently
  // pin the desktop row count and defeat the mobile breakpoint's own grid-template-rows
  // override, collapsing every tile to ~0px height on mobile.
  assert.ok(/'--total-rows':\s*Math\.ceil\(/.test(src),
    'the grid row count is no longer derived from the visible tile count')
  assert.ok(/grid-template-rows:\s*repeat\(var\(--total-rows/.test(src),
    'the desktop grid no longer reads the row count from --total-rows')
})

test('the admin tile panel can reach every tile slot the endpoint accepts', () => {
  // Shipped broken twice by the same mechanism: the slot list was duplicated across the
  // rendered list, three state maps and a block of hand-written assignments in loadSettings().
  // Blackjack fell out of the loader, then Fruit Samurai did -- both showed "not set" forever
  // even with an image uploaded -- and Pokemon was missing from the list entirely, so its tile
  // could not be changed at all. Everything is derived from one list now; this holds it there.
  const admin = read('components/newsite/admin/legacy/AdminLegacyGames.vue')
  const endpoint = read('server/api/admin/game-tile-image.post.js')

  const endpointSlots = [...(/const SLOT_FIELD = \{([\s\S]*?)\n\}/.exec(endpoint)?.[1] || '')
    .matchAll(/^\s*([a-z]+):\s*'([A-Za-z]+)'/gm)].map(m => ({ slot: m[1], column: m[2] }))
  assert.ok(endpointSlots.length >= 15, `expected the tile slots, found ${endpointSlots.length}`)

  const listed = [...(/const gameTileSlots = \[([\s\S]*?)\n\]/.exec(admin)?.[1] || '')
    .matchAll(/slot: '([a-z]+)'[^}]*column: '([A-Za-z]+)'/g)].map(m => ({ slot: m[1], column: m[2] }))

  for (const { slot, column } of endpointSlots) {
    const hit = listed.find(l => l.slot === slot)
    assert.ok(hit, `the admin tile panel cannot manage the "${slot}" tile`)
    assert.equal(hit.column, column,
      `"${slot}" reads ${hit.column} in the panel but the endpoint writes ${column}`)
  }

  // And nothing may hand-write the per-slot assignments again, which is what drifted.
  assert.ok(/for \(const t of gameTileSlots\) gameTileImages\.value/.test(admin),
    'the tile loader is hand-written again rather than driven by gameTileSlots')
})

test('switching the game off takes it off the site, not just off the Games page', () => {
  // "Not visible" has to mean "not playable": the route is reachable by URL and a head-to-head
  // win pays points, so hiding the tile alone would leave an off game quietly earning.
  const runtime = read('server/utils/pokemonBattleRuntime.js')
  assert.ok(runtime.includes('isEnabled:'), 'the runtime has no enabled gate')

  const duel = code('server/utils/duelRuntime.js')
  assert.ok(/createRoom[\s\S]{0,400}await offline\(\)/.test(duel), 'createRoom is not gated on the switch')
  assert.ok(/joinRoom[\s\S]{0,400}await offline\(\)/.test(duel),
    'joinRoom is not gated -- a room made before the game went off would still be joinable')

  // The page renders its own closed state rather than trusting the tile to be hidden.
  const page = read('pages/newsite/pokemonbattle.vue')
  assert.ok(page.includes('v-if="!enabled"'), 'the game page has no closed state')
  assert.ok(page.includes('if (enabled.value) connectSocket()'),
    'a switched-off game still opens a socket')

  // A missing column or an unreadable config must fail OPEN, or a migration lag takes the game
  // down on its own.
  const assets = code('server/utils/pokemonBattleAssets.js')
  assert.ok(assets.includes('!== false'), 'the enabled flag does not default to on')
  assert.ok(code('server/api/game-tile-images.get.js').includes('hidden'),
    'the tile endpoint does not report hidden games')
})

test('the admin log component and its endpoint agree', () => {
  const comp = read('components/newsite/AdminPokemonBattleLogs.vue')
  assert.ok(comp.includes('/api/admin/pokemonbattle-matches'), 'the log component points elsewhere')
  assert.doesNotThrow(() => read('server/api/admin/pokemonbattle-matches.get.js'))
  assert.ok(read('utils/adminSections.js').includes("nu('AdminPokemonBattleLogs')"),
    'the log component is not registered in the admin nav')
})

/* ── Client safety ─────────────────────────────────────────────────────────────────────── */

test('the battle UI depends on no emoji glyph', () => {
  // Emoji are a font, not a guarantee. The RPS game shipped with hand emoji that rendered as
  // nothing on a real device -- the throws were invisible. Everything load-bearing here is an
  // image or a CSS shape, including the mute button.
  const page = read('pages/newsite/pokemonbattle.vue')
  const template = page.slice(0, page.indexOf('</template>'))
  const emoji = template.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu) || []
  assert.deepEqual(emoji, [], `the template contains emoji (${emoji.join(' ')}) -- use art or a CSS shape`)
})

test('the lobby can reach the socket without a click it cannot make', () => {
  // Shipped broken once: the "Create a battle" button was disabled until `connected`, and the
  // only caller of connectSocket() was that button's own click handler. The socket could
  // therefore never open, and the lobby sat on "Connecting..." forever. The room list was
  // permanently empty for the same reason.
  const page = read('pages/newsite/pokemonbattle.vue')
  const mounted = page.slice(page.indexOf('onMounted('), page.indexOf('onBeforeUnmount('))
  assert.ok(mounted.includes('connectSocket()'),
    'nothing connects the socket on mount, so a lobby gated on `connected` can never enable itself')

  // And the gate itself still has to be a gate: if the button stops being disabled while
  // disconnected, the emit silently no-ops instead.
  assert.ok(/createRoom"[^>]*:disabled="!connected"/.test(page) || page.includes(':disabled="!connected"'),
    'the create button no longer reflects connection state')
})

test('every uploadable asset slot is actually consumed by the game', () => {
  // Shipped broken once: `menubg` was accepted by the upload endpoint, offered in the admin
  // panel, stored, and served by the config API -- and rendered by nothing. The admin uploaded
  // a menu background and it silently went nowhere. An upload slot with no consumer is worse
  // than a missing feature, because it looks like a working one.
  const endpoint = read('server/api/admin/pokemonbattle-asset.post.js')
  const audio = read('server/api/admin/pokemonbattle-audio.post.js')
  const page = read('pages/newsite/pokemonbattle.vue')

  const imageSlots = [...(/const SLOTS = \{([\s\S]*?)\n\}/.exec(endpoint)?.[1] || '')
    .matchAll(/^\s*'?([a-z-]+)'?:/gm)].map(m => m[1])
  assert.ok(imageSlots.length >= 9, `expected the asset slots, found ${imageSlots.length}`)

  const audioSlots = [...(/const SLOTS = new Set\(\[([^\]]*)\]/.exec(audio)?.[1] || '')
    .matchAll(/'([a-z]+)'/g)].map(m => m[1])
  assert.ok(audioSlots.length === 2, `expected two audio slots, found ${audioSlots.length}`)

  for (const slot of [...imageSlots, ...audioSlots]) {
    // The six Pokemon sprites are looked up dynamically as `${mon.id}-front` / `-back`, so a
    // literal match will not find them; everything else must appear literally.
    const dynamic = /^(charizard|blastoise|venusaur)-(front|back)$/.test(slot)
    if (dynamic) continue
    assert.ok(page.includes(`'${slot}'`), `nothing in the game renders the "${slot}" upload slot`)
  }
  // And the dynamic pair really is built, or all six sprite slots would be dead at once.
  assert.ok(page.includes('-back') && page.includes('-front'),
    'the page no longer builds the sprite slot names, so every sprite upload is dead')

  // The admin panel must offer exactly what the endpoints accept -- a slot in the panel that
  // the endpoint rejects is an upload button that always errors.
  const admin = read('components/newsite/admin/legacy/AdminLegacyGames.vue')
  for (const slot of [...imageSlots, ...audioSlots]) {
    assert.ok(admin.includes(`key: '${slot}'`), `the admin panel cannot upload the "${slot}" slot`)
  }
})

test('the menu backdrop stays legible under any uploaded image', () => {
  // The title, chips and notes sit directly on an admin-supplied image that is as likely to be
  // bright as dark, so the scrim is what guarantees the text survives. Worst case is a pure
  // white upload; the alpha is computed rather than eyeballed.
  const page = read('pages/newsite/pokemonbattle.vue')
  const scrim = Number(/const MENU_SCRIM = ([\d.]+)/.exec(page)?.[1])
  assert.ok(Number.isFinite(scrim), 'the menu scrim constant is gone')

  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const rel = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
  const scrimRgb = (/rgba\((\d+),\s*(\d+),\s*(\d+),/.exec(page) || []).slice(1).map(Number)
  assert.equal(scrimRgb.length, 3, 'could not read the scrim colour')

  // White image under the scrim, composited in sRGB.
  const composited = scrimRgb.map(c => scrim * c + (1 - scrim) * 255)
  const ratio = (rel([248, 248, 248]) + 0.05) / (rel(composited) + 0.05)
  assert.ok(ratio >= 4.5,
    `body text over a pure-white menu upload is only ${ratio.toFixed(2)}:1; raise MENU_SCRIM`)
})

test('the battlefield is sized from width, never from height', () => {
  // Shipped broken once, in both directions. The layout gives .main-content `height: auto` on
  // mobile, so a height-driven field has nothing definite to resolve against and collapses to
  // a 0px sliver. Deriving width from height instead overflows: at a 2.14 ratio a 280px-tall
  // stage wants a 600px-wide field, which a 375px phone crops via `overflow: hidden` rather
  // than scrolling. Width is the only dimension that is definite in every context.
  const page = read('pages/newsite/pokemonbattle.vue')
  const rule = /\.pfwg-field \{([\s\S]*?)\}/.exec(page)?.[1]
  assert.ok(rule, 'could not find the .pfwg-field rule')
  // Anchored so `max-width` / `max-height` are not mistaken for the real properties -- the
  // field legitimately carries a `max-height: 100%` letterbox guard.
  const prop = (name) => new RegExp(`(^|[;{\\s])${name}:\\s*([^;]+)`, 'm').exec(rule)?.[2]?.trim()
  assert.equal(prop('width'), '100%', '.pfwg-field must take its width from its container')
  assert.equal(prop('height'), 'auto', '.pfwg-field must derive its height from its width')
  assert.ok(/aspect-ratio/.test(rule), '.pfwg-field lost its aspect ratio')

  // The base (mobile) grid must not hand the stage a flexible track either -- `1fr` of an
  // indefinite parent is zero.
  const battle = /\.pfwg-battle \{([\s\S]*?)\}/.exec(page)?.[1]
  assert.ok(battle, 'could not find the .pfwg-battle rule')
  assert.ok(!/grid-template-rows:[^;]*1fr/.test(battle),
    'the base battle grid uses a 1fr track; on mobile that resolves to zero height')
})

test('the page never renders admin-supplied text as HTML', () => {
  // Trainer names are admin-supplied and reach every visitor, including logged-out ones. The
  // natural way to bold a name inside a battle line is exactly the edit that would add v-html.
  const page = read('pages/newsite/pokemonbattle.vue')
  assert.ok(!page.includes('v-html'), 'the battle page uses v-html')
  assert.ok(!read('components/newsite/AdminPokemonBattleLogs.vue').includes('v-html'),
    'the admin log uses v-html')
})

test('the public config endpoint exposes no farming intelligence', () => {
  const src = code('server/api/game/pokemonbattle/config.get.js')
  // This route is unauthenticated so single-player works logged out. None of these are needed
  // to draw a battle, and together they map where the farming limits sit.
  for (const secret of ['pointsPerWin', 'pairDailyAwardLimit', 'dailyCap', 'tkoDailyPointLimit']) {
    assert.ok(!src.includes(secret), `the public config endpoint references ${secret}`)
  }
  // Allowlisted selects, never the whole row: GameConfig carries every other game's tuning.
  const assets = code('server/utils/pokemonBattleAssets.js')
  assert.ok(assets.includes('select: {'), 'the asset read does not use an explicit select')
  assert.ok(code('server/utils/pokemonBattleConfig.js').includes('select: {'),
    'the roster read does not use an explicit select')
})

test('the audio upload derives everything server-side', () => {
  // The pre-existing winwheel endpoint took its format from the client MIME type and its
  // extension from the client filename, which wrote attacker-named files into a directory this
  // origin serves. Neither pattern may come back.
  for (const file of [
    'server/api/admin/pokemonbattle-audio.post.js',
    'server/api/admin/winwheel-sound.post.js'
  ]) {
    const src = code(file)
    assert.ok(!src.includes('extname('), `${file} still derives an extension from the filename`)
    assert.ok(!src.includes('filePart.type'), `${file} still trusts the client MIME type`)
    assert.ok(src.includes('sniffAudioType'), `${file} does not sniff the audio magic bytes`)
    assert.ok(src.includes('assertInside'), `${file} does not contain its write path`)
  }
})

test('image uploads sniff bytes and never accept SVG', () => {
  // An SVG served from this origin executes script with the viewer's session, and the site
  // sets no CSP.
  for (const file of [
    'server/api/admin/pokemonbattle-asset.post.js',
    'server/api/admin/pokemonbattle-trainers.post.js',
    'server/api/admin/game-tile-image.post.js'
  ]) {
    const src = code(file)
    assert.ok(src.includes('sniffImageType'), `${file} does not sniff image magic bytes`)
    assert.ok(!src.includes('svg+xml'), `${file} still accepts SVG`)
  }
  // Animated input is a decompression-bomb vector: file size is no proxy for decoded size, and
  // libvips loads an animation as one strip of height x pages.
  const asset = code('server/api/admin/pokemonbattle-asset.post.js')
  assert.ok(asset.includes('MAX_FRAMES'), 'the asset upload does not cap frame count')
  assert.ok(asset.includes('MAX_TOTAL_PIXELS'), 'the asset upload does not cap total pixels')
  assert.ok(asset.includes('.metadata()'), 'the asset upload does not probe metadata before decoding')
})

test('admin endpoints refuse suspended admins', () => {
  // The prevailing pattern checked only isAdmin via a loopback call to /api/auth/me, which let
  // a banned or deactivated admin upload.
  for (const file of [
    'server/api/admin/pokemonbattle-asset.post.js',
    'server/api/admin/pokemonbattle-audio.post.js',
    'server/api/admin/pokemonbattle-trainers.post.js',
    'server/api/admin/pokemonbattle-trainers.delete.js',
    'server/api/admin/pokemonbattle-trainers.get.js',
    'server/api/admin/pokemonbattle-matches.get.js',
    'server/api/admin/winwheel-sound.post.js'
  ]) {
    assert.ok(read(file).includes('requireAdmin'), `${file} does not use the shared admin gate`)
  }
  assert.ok(read('server/utils/requireAdmin.js').includes('banned'),
    'requireAdmin does not check the banned flag')
})

/* ── Runtime invariants ────────────────────────────────────────────────────────────────── */

test('the shared runtime keeps its money-path invariants', () => {
  const src = code('server/utils/duelRuntime.js')

  // Single-shot round resolution: `resolving` is set synchronously before the first await, so
  // the timer path and the both-moves-in path cannot interleave and score a round twice.
  const resolveIdx = src.indexOf('r.resolving = true')
  assert.notEqual(resolveIdx, -1, 'the resolve guard is gone')
  const guardIdx = src.lastIndexOf('r.resolving || r.resolved', resolveIdx)
  assert.notEqual(guardIdx, -1, 'the resolve guard check is gone')
  assert.ok(!src.slice(guardIdx, resolveIdx).includes('await'),
    'an await was introduced between the resolve guard and resolving = true')

  // The award claim is a compare-and-set on a null pointsAwardedAt. GamePointLog has no unique
  // constraint, so nothing else makes the award idempotent.
  assert.ok(src.includes('pointsAwardedAt: null'), 'the award claim no longer compares-and-sets')
  assert.ok(src.includes('claim.count !== 1'), 'the award claim no longer checks it won the race')

  // Timeout fills use a CSPRNG: the player chooses when to trigger this by stalling, and V8's
  // PRNG state is recoverable from a handful of observed outputs.
  assert.ok(src.includes('randomInt(spec.choiceCount)'), 'the timeout fill no longer uses crypto randomInt')
  assert.ok(!src.includes('Math.random'), 'the runtime uses Math.random somewhere')

  // Room ids are server-generated and validated against an anchored full-uuid pattern before
  // socket.join -- a loosened prefix match would let a caller join other features' rooms.
  assert.ok(src.includes('ROOM_ID_RE.test'), 'room ids are no longer validated')
  assert.ok(/\^\$\{spec\.key\}:\[0-9a-f\]\{8\}/.test(src), 'the room id pattern is not anchored with a full uuid')

  // Identity comes from the session cookie and is namespaced, never written to the shared
  // socket.data.userId that Clash's disconnect cleanup consumes.
  assert.ok(!/socket\.data\.userId\s*=/.test(src), 'the runtime assigns the shared socket.data.userId')
})

test('every socket handler goes through the auth and rate-limit choke point', () => {
  // allowEvent lives inside auth(), so a handler that skips auth "because it does not need
  // identity" also skips the rate limiter.
  const src = code('server/utils/duelRuntime.js')
  const handlers = [...src.matchAll(/socket\.on\(EV\('([^']+)'\),\s*(async\s*)?\([^)]*\)\s*=>\s*\{([\s\S]{0,200})/g)]
  assert.ok(handlers.length >= 6, `expected the duel handlers, found ${handlers.length}`)
  for (const h of handlers) {
    const [, name, , body] = h
    if (name === 'unsubscribe') continue // leaves a room only; touches no state and pays nothing
    assert.ok(body.includes('await auth()'), `handler "${name}" does not start with await auth()`)
  }
})
