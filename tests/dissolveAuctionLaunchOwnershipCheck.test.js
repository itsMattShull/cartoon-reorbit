import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Read as text rather than imported, same reasoning as tests/cmoonPlayerCombatMaxHp.test.js:
// server/workers/dissolve-auction-launch.worker.js constructs a real BullMQ Worker (connects to
// Redis) at module load time, which this suite must not do. The actual end-to-end behavior (a
// real worker process, a real stale queue entry, asserting no bogus auction gets created and a
// DissolveMisfireLog row is written) was verified directly against real Postgres + Redis during
// development — this test exists to keep that fix from silently regressing afterward.
const __dirname = dirname(fileURLToPath(import.meta.url))
const workerSrc = readFileSync(join(__dirname, '../server/workers/dissolve-auction-launch.worker.js'), 'utf8')

test('the launch worker re-verifies current ownership before creating an auction', () => {
  // Isolate the body between the dissolveAuctionQueue delete (which always runs) and the
  // auction.create call, so this test fails if the re-check is ever moved outside that window
  // (e.g. after auction creation, which would defeat the whole point).
  const deleteIdx = workerSrc.indexOf('tx.dissolveAuctionQueue.delete')
  const createIdx = workerSrc.indexOf('tx.auction.create')
  assert.ok(deleteIdx > -1, 'the queue-entry delete is missing — has the worker been restructured?')
  assert.ok(createIdx > deleteIdx, 'tx.auction.create must come after the queue-entry delete')
  const between = workerSrc.slice(deleteIdx, createIdx)

  assert.match(between, /tx\.userCtoon\.findUnique/, 'must re-read the cToon\'s current owner inside the same transaction as the delete')
  assert.match(between, /currentOwner\.userId\s*!==\s*officialUser\.id/, 'must compare the current owner against the official account before creating an auction')
  assert.match(between, /misfirePrevented\s*:\s*true/, 'must signal the caller when it skips creating an auction, so the misfire gets logged')
})

test('a prevented misfire gets logged via recordPreventedMisfire, not silently dropped', () => {
  assert.match(workerSrc, /import\s*\{\s*recordPreventedMisfire\s*\}\s*from\s*['"]\.\.\/utils\/dissolveMisfire\.js['"]/)
  assert.match(workerSrc, /recordPreventedMisfire\s*\(/)
})

test('a genuinely still-official-owned entry is unaffected (auction.create is still reachable)', () => {
  // Guards against a fix that accidentally always skips creation (e.g. an inverted comparison).
  assert.match(workerSrc, /return\s*\{\s*auctionId:\s*created\.id,\s*endAt\s*\}/)
})
