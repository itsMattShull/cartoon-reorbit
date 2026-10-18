import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadOgGtoonCtoons } from './helpers/ogGtoonCsv.js'

// prisma/createOgGtoonsPack.js runs on import, so read its rarity config as text and the card list from its JSON.
const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'createOgGtoonsPack.js'), 'utf8')
const names = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'ogGtoonsData', 'pack-card-names.json'), 'utf8'))
const rarityConfigs = [...src.matchAll(/\{ rarity: '([^']+)', count: (\d+), probabilityPercent: (\d+) \}/g)]
  .map(m => ({ rarity: m[1], count: +m[2], probabilityPercent: +m[3] }))

const catalog = loadOgGtoonCtoons()
test('pack script: the card list has no duplicates and every card is an imported original gToon', () => {
  assert.equal(names.length, 103)
  assert.equal(new Set(names).size, names.length)
  for (const n of names) assert.ok(catalog.has(n), `${n} is not in the import CSV`)
})

test('pack script: each configured rarity has enough cards, and at least one is a sure thing', () => {
  const have = {}
  for (const n of names) have[catalog.get(n).rarity] = (have[catalog.get(n).rarity] || 0) + 1
  assert.ok(rarityConfigs.length >= 1)
  for (const rc of rarityConfigs) assert.ok((have[rc.rarity] || 0) >= rc.count, `${rc.rarity} has ${have[rc.rarity] || 0}, needs ${rc.count}`)
  assert.ok(rarityConfigs.some(rc => rc.probabilityPercent === 100))
  assert.deepEqual(Object.keys(have).filter(r => !rarityConfigs.some(rc => rc.rarity === r)), [], 'every rarity in the pack is drawn by a config')
})

test('pack script: the pack is kept out of the C-mart and uses the placeholder image', () => {
  assert.match(src, /inCmart: false/)
  assert.match(src, /placeholder\.png/)
  assert.doesNotMatch(src, /inCmart: true/)
})

/* ── GOODBYECLASHYOULLBEMISSED code script ───────────────────────────────────────────────── */

const codeSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'createGoodbyeClashCode.js'), 'utf8')

test('code script: the code, claim limit, pooled count and schedule are the requested ones', () => {
  assert.match(codeSrc, /const CODE = 'GOODBYECLASHYOULLBEMISSED'/)
  assert.match(codeSrc, /const MAX_CLAIMS = 99999/)
  assert.match(codeSrc, /const POOL_UNIQUE_COUNT = 12/)
  assert.match(codeSrc, /const POOL_RARITY = 'Common'/)
  assert.match(codeSrc, /\{ y: 2026, m: 10, d: 19, h: 20, mi: 0 \}/)
  // No prerequisites, fixed cToon rewards or backgrounds are created.
  assert.match(codeSrc, /prereqMinOwned: null/)
  assert.doesNotMatch(codeSrc, /prerequisites:\s*\{/)
  assert.doesNotMatch(codeSrc, /\bctoons:\s*\{/)
  assert.doesNotMatch(codeSrc, /backgrounds:\s*\{/)
  assert.match(codeSrc, /weight: 1/)
})

test('code script: the Common cards in the list can fill a pool of 12', () => {
  const commons = names.filter(n => catalog.get(n).rarity === 'Common')
  assert.equal(commons.length, 42)
  assert.ok(commons.length >= 12)
})
