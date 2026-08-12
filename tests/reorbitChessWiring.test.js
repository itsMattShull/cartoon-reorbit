import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { clampConfig, CONFIG_LIMITS, CHARACTERS, CHARACTER_IDS, LINES, isSquare, isPromotionPiece } from '../lib/reorbitChess.js'
import { COMBAT_POOL_GAME_NAMES } from '../server/utils/gamePoints.js'

// Adding a game to this codebase means repeating two strings across a handful of files that
// have no reference to each other: the GameConfig.gameName ('ReOrbitChess') and the tile slot
// key ('reorbitchess'). Nothing at runtime checks they agree, and each mismatch fails
// somewhere far from the typo — a wrong gameName silently pays from the wrong daily pool, a
// wrong slot key gives the admin an upload button whose image never appears.
//
// This mirrors tests/edRpsWiring.test.js, which exists for exactly the same reason.

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const GAME_NAME = 'ReOrbitChess'
const SLOT = 'reorbitchess'

test('the gameName string agrees everywhere it is duplicated', () => {
  // The points pool is the one that costs real money to get wrong: this constant is both the
  // inclusion list for combat games and the exclusion list for the arcade pool.
  assert.ok(
    COMBAT_POOL_GAME_NAMES.includes(GAME_NAME),
    'ReOrbitChess must be in COMBAT_POOL_GAME_NAMES or its wins are charged to both daily pools'
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
    read('server/utils/reorbitChessRuntime.js').includes(`const GAME_NAME = '${GAME_NAME}'`),
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

  // The upload endpoint and the read endpoint must name the SAME column. The casing is a real
  // trap: the column is gameTile + the SLOT capitalised, not the gameName.
  const column = 'gameTileReorbitchessImagePath'
  for (const file of [
    'server/api/game-tile-images.get.js',
    'server/api/admin/game-tile-image.post.js',
    'server/api/admin/game-tile-image.delete.js',
    'prisma/schema.prisma'
  ]) {
    assert.ok(read(file).includes(column), `${file} does not name the ${column} column`)
  }
})

test('the socket runtime is registered and swept', () => {
  const server = read('server/socket-server.js')
  assert.ok(server.includes('registerReOrbitChess(io, socket, resolveSocketUser)'),
    'the chess runtime is never registered onto a connection')
  assert.ok(server.includes('startReOrbitChessSweep(io)'),
    'without the sweep, an orphaned game pins both players out of starting another')
})

test('both copies of the admin games screen carry the tab AND its panel', () => {
  // pages/admin/games.vue is a near-identical fallback of the console component and nothing
  // keeps the two in sync. A tab whose panel is missing renders blank with no error.
  for (const file of [
    'components/newsite/admin/legacy/AdminLegacyGames.vue',
    'pages/admin/games.vue'
  ]) {
    const src = read(file)
    assert.ok(src.includes(`{ key: '${GAME_NAME}'`), `${file} has no ${GAME_NAME} tab`)
    assert.ok(src.includes(`activeTab === '${GAME_NAME}'`), `${file} has a ${GAME_NAME} tab with no panel`)
    assert.ok(src.includes('saveChessConfig'), `${file} cannot save the chess settings`)
    assert.ok(src.includes(`slot: '${SLOT}'`), `${file} is missing the ${SLOT} tile upload slot`)
  }
})

test('the admin log section resolves to a component that exists', () => {
  const sections = read('utils/adminSections.js')
  assert.ok(sections.includes("S('reorbitChessLogs'"), 'no admin console section for the chess logs')
  assert.ok(
    existsSync(join(root, 'components/newsite/AdminReOrbitChessLogs.vue')),
    'the admin section points at a component that does not exist'
  )
  assert.ok(
    existsSync(join(root, 'server/api/admin/reorbitchess-matches.get.js')),
    'the log component fetches an endpoint that does not exist'
  )
})

test('the leaderboard is registered and its endpoint exists', () => {
  assert.ok(
    read('components/newsite/Leaderboards.vue').includes("key: 'reorbitchess'"),
    'the chess leaderboard is not in the Leaderboards registry'
  )
  assert.ok(
    existsSync(join(root, 'server/api/game/reorbitchess/leaderboard.get.js')),
    'the registry points at a leaderboard endpoint that does not exist'
  )
})

test('the migration matches the schema it claims to create', () => {
  const migration = read('prisma/migrations/20260812000000_add_reorbit_chess/migration.sql')
  const schema = read('prisma/schema.prisma')

  // Every tuning column has to exist in both, or a fresh database and a migrated one disagree.
  for (const col of [
    'reorbitChessInitialSeconds',
    'reorbitChessIncrementSeconds',
    'reorbitChessPairDailyAwardLimit',
    'reorbitChessMinPliesForAward',
    'reorbitChessGraceSeconds'
  ]) {
    assert.ok(migration.includes(col), `migration is missing ${col}`)
    assert.ok(schema.includes(col), `schema.prisma is missing ${col}`)
  }

  // The partial and expression indexes Prisma cannot express live only in the migration. The
  // pair index in particular is what keeps the per-pair award check off a table scan.
  assert.ok(migration.includes('ReOrbitChessMatch_pair_paid_idx'), 'the pair award index is missing')
  assert.ok(migration.includes('LEAST("whiteUserId", "blackUserId")'),
    'the pair index must order the ids or the unordered-pair count cannot use it')
})

test('admin config ranges match the limits the engine clamps to', () => {
  // The admin rejects out of range so a human sees an error; the runtime clamps again so a
  // value that got in another way cannot break a live game. The two must agree, or the admin
  // saves values the game silently ignores.
  const post = read('server/api/admin/game-config.post.js')
  const pairs = [
    ['reorbitChessInitialSeconds', CONFIG_LIMITS.initialSeconds],
    ['reorbitChessIncrementSeconds', CONFIG_LIMITS.incrementSeconds],
    ['reorbitChessPairDailyAwardLimit', CONFIG_LIMITS.pairDailyAwardLimit],
    ['reorbitChessMinPliesForAward', CONFIG_LIMITS.minPliesForAward],
    ['reorbitChessGraceSeconds', CONFIG_LIMITS.graceSeconds]
  ]
  for (const [field, limit] of pairs) {
    assert.ok(
      post.includes(`['${field}', ${limit.min}, ${limit.max}]`),
      `${field} is validated against a different range than CONFIG_LIMITS declares`
    )
  }
})

test('clampConfig keeps a hostile or empty config playable', () => {
  const d = clampConfig({})
  assert.equal(d.initialSeconds, CONFIG_LIMITS.initialSeconds.default)
  assert.equal(d.incrementSeconds, CONFIG_LIMITS.incrementSeconds.default)

  // A zero clock would flag both players before either could move.
  const zero = clampConfig({ initialSeconds: 0, incrementSeconds: -5 })
  assert.equal(zero.initialSeconds, CONFIG_LIMITS.initialSeconds.min)
  assert.equal(zero.incrementSeconds, 0)

  const huge = clampConfig({ initialSeconds: 999999, minPliesForAward: 10000 })
  assert.equal(huge.initialSeconds, CONFIG_LIMITS.initialSeconds.max)
  assert.equal(huge.minPliesForAward, CONFIG_LIMITS.minPliesForAward.max)

  const junk = clampConfig({ initialSeconds: 'banana', graceSeconds: null })
  assert.equal(junk.initialSeconds, CONFIG_LIMITS.initialSeconds.default)
  assert.equal(junk.graceSeconds, CONFIG_LIMITS.graceSeconds.default)
})

test('wire-format validators reject what they are there to reject', () => {
  // These guard the boundary in front of chess.js in the socket runtime.
  assert.ok(isSquare('a1') && isSquare('h8') && isSquare('e4'))
  assert.ok(!isSquare('i1'), 'file i is off the board')
  assert.ok(!isSquare('a9'), 'rank 9 is off the board')
  assert.ok(!isSquare('a'), 'a bare file is not a square')
  assert.ok(!isSquare(''), 'empty string is not a square')
  assert.ok(!isSquare('a1 '), 'trailing whitespace must not pass')
  assert.ok(!isSquare(null) && !isSquare(undefined) && !isSquare(42))

  assert.ok(isPromotionPiece('q') && isPromotionPiece('n'))
  // A king or a pawn is not a legal promotion and must never reach chess.js.
  assert.ok(!isPromotionPiece('k'), 'promoting to a king is not a thing')
  assert.ok(!isPromotionPiece('p'), 'promoting to a pawn is not a thing')
  assert.ok(!isPromotionPiece('Q'), 'the wire format is lowercase')
})

test('every character has art dimensions and a full set of dialogue', () => {
  assert.equal(CHARACTERS.length, 3)
  const EVENTS = [
    'greeting', 'move', 'capture', 'check', 'lostPiece', 'inCheck', 'playerBlunder',
    'losing', 'winning', 'win', 'loss', 'draw', 'slow', 'playerPromote', 'aiPromote'
  ]
  for (const c of CHARACTERS) {
    // Explicit intrinsic dimensions go on the <img> so the scene never reflows while art
    // decodes — the same discipline lib/edRps.js documents.
    assert.ok(c.width > 0 && c.height > 0, `${c.id} has no art dimensions`)
    assert.ok(c.art.startsWith('/games/chess/'), `${c.id} art is not a bundled asset`)
    assert.ok(c.elo > 0 && c.difficulty, `${c.id} has no advertised strength`)

    const lines = LINES[c.id]
    assert.ok(lines, `${c.id} has no dialogue at all`)
    for (const ev of EVENTS) {
      assert.ok(Array.isArray(lines[ev]) && lines[ev].length > 0, `${c.id} has no "${ev}" line`)
      for (const line of lines[ev]) {
        // The bubble is a fixed-height strip that truncates rather than wraps, so length is a
        // real constraint and not a style note.
        assert.ok(line.length <= 60, `${c.id}.${ev} line is too long for the bubble: "${line}"`)
      }
    }
  }
  assert.deepEqual(CHARACTER_IDS, ['ed', 'computer', 'mandark'])
})
