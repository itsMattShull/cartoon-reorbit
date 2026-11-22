import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ogGtoonsWinsWhere, getOgGtoonsWinCount } from '../server/utils/ogGtoonWins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8')

/* ── What counts as a win ─────────────────────────────────────────────────────────────── */

// A tiny in-memory stand-in for prisma.ogGtoonMatch.count that understands the one `where`
// shape ogGtoonsWinsWhere builds, so the definition is tested against real-looking rows.
function fakeDb(rows) {
  const matches = (row, cond) => Object.entries(cond).every(([k, v]) => row[k] === v)
  return {
    ogGtoonMatch: {
      count: async ({ where }) => rows.filter(r => where.OR.some(c => matches(r, c))).length
    }
  }
}

const ME = 'user-me'
const THEM = 'user-them'

test('counts wins on either side, and nothing else', async () => {
  const rows = [
    { player1UserId: ME, player2UserId: THEM, outcome: 'PLAYER1', winnerUserId: ME },   // win as P1
    { player1UserId: THEM, player2UserId: ME, outcome: 'PLAYER2', winnerUserId: ME },   // win as P2
    { player1UserId: ME, player2UserId: THEM, outcome: 'PLAYER2', winnerUserId: THEM }, // loss
    { player1UserId: ME, player2UserId: THEM, outcome: 'TIE', winnerUserId: null },     // tie
    // An admin-voided / swept tournament game keeps its old winnerUserId but is not a win.
    { player1UserId: ME, player2UserId: THEM, outcome: 'INCOMPLETE', winnerUserId: ME },
    { player1UserId: THEM, player2UserId: 'someone-else', outcome: 'PLAYER1', winnerUserId: THEM }
  ]
  assert.equal(await getOgGtoonsWinCount(fakeDb(rows), ME), 2)
  assert.equal(await getOgGtoonsWinCount(fakeDb(rows), THEM), 2)
})

test('reads the winner from outcome, never from winnerUserId', () => {
  const where = ogGtoonsWinsWhere(ME)
  assert.deepEqual(where, {
    OR: [
      { player1UserId: ME, outcome: 'PLAYER1' },
      { player2UserId: ME, outcome: 'PLAYER2' }
    ]
  })
  assert.ok(!JSON.stringify(where).includes('winnerUserId'))
})

test('a missing user id counts zero without touching the database', async () => {
  const db = { ogGtoonMatch: { count: async () => { throw new Error('should not query') } } }
  assert.equal(await getOgGtoonsWinCount(db, null), 0)
})

/* ── Wiring: the criterion is stored, editable by admins, and evaluated ───────────────── */
// server/utils/achievements.js pulls in BullMQ queues and Discord transitively, so it is read as
// text rather than imported — same approach as tests/cmoonTierClaimSameAchievementExcluded.test.js.

test('Achievement has an ogGtoonsWinsGte column with a migration', () => {
  const schema = read('prisma/schema.prisma')
  const model = schema.slice(schema.indexOf('model Achievement {'), schema.indexOf('model AchievementClaimOption'))
  assert.match(model, /ogGtoonsWinsGte\s+Int\?/)
  const migration = read('prisma/migrations/20261122000000_og_gtoons_wins_achievement/migration.sql')
  assert.match(migration, /ALTER TABLE "Achievement" ADD COLUMN "ogGtoonsWinsGte" INTEGER;/)
})

test('evaluateUserAgainstAchievement checks ogGtoonsWinsGte against the shared win count', () => {
  const src = read('server/utils/achievements.js')
  assert.match(src, /import \{ getOgGtoonsWinCount \} from '..\/..\/server\/utils\/ogGtoonWins\.js'/)
  const start = src.indexOf('export async function evaluateUserAgainstAchievement')
  const body = src.slice(start, src.indexOf('\nexport ', start + 1))
  assert.match(body, /if \(ach\.ogGtoonsWinsGte != null\)/)
  assert.match(body, /getOgGtoonsWinCount\(db, userId\)/)
  assert.match(body, /wins < ach\.ogGtoonsWinsGte\) return false/)
})

test('admin create, update and list endpoints carry ogGtoonsWinsGte', () => {
  for (const p of ['server/api/admin/achievements.post.js', 'server/api/admin/achievements/[id].put.js']) {
    assert.match(read(p), /ogGtoonsWinsGte: criteria\?\.ogGtoonsWinsGte \?\? null/, p)
  }
  assert.match(read('server/api/admin/achievements.get.js'), /ogGtoonsWinsGte: a\.ogGtoonsWinsGte/)
})

test('the admin achievement form has an OG gToons Wins field', () => {
  const vue = read('components/newsite/admin/legacy/AdminLegacyAchievements.vue')
  assert.match(vue, /OG gToons Wins ≥/)
  assert.match(vue, /v-model\.number="form\.criteria\.ogGtoonsWinsGte"/)
  assert.match(vue, /ogGtoonsWinsGte: null/)                    // blank form
  assert.match(vue, /ogGtoonsWinsGte: a\.ogGtoonsWinsGte \?\? null/) // editing an existing one
})
