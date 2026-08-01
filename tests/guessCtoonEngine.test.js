import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeName,
  parseName,
  isEligibleAnswer,
  tierForIndex,
  quotaForTier,
  buildCatalogContext,
  buildQuestion,
  buildRun,
  scoreCadence,
  MAX_CHOICE_LEN
} from '../server/utils/guessCtoonEngine.js'

// A slice of the real catalog shape: modifier+character names, parenthetical poses,
// positional slices, numbered items, second editions and duplicate art.
const CATALOG = [
  ['Watcher Dexter', 'Dexters Lab'],
  ['Cybersuit Dexter', 'Dexters Lab'],
  ['Valentine Mandark', 'Dexters Lab'],
  ['Dee Dee', 'Dexters Lab'],
  ['Lazy Scooby', 'Scooby Doo'],
  ['Shaggy', 'Scooby Doo'],
  ['Velma', 'Scooby Doo'],
  ['Fearless Flash', 'Justice League'],
  ['Undaunted Hawkgirl', 'Justice League'],
  ['The Batman', 'Justice League'],
  ['Private John Stewart', 'Justice League'],
  ['Space Outlaw Ed', 'Ed Edd n Eddy'],
  ['Space Outlaw Edd', 'Ed Edd n Eddy'],
  ['Space Outlaw Eddy', 'Ed Edd n Eddy'],
  ['Ed (Run)', 'Ed Edd n Eddy'],
  ['Funky Blue Bubbles', 'Powerpuff Girls'],
  ['Funky Green Buttercup', 'Powerpuff Girls'],
  ['Funky Pink Blossom', 'Powerpuff Girls'],
  ['Goku', 'Dragon Ball Z'],
  ['Charizard', 'Pokemon'],
  ['Hamtaro', 'Hamtaro'],
  ['Skeletor', 'He-Man'],
  ['Johnny Bravo', 'Johnny Bravo'],
  ['Schoolgirl Sakura', 'Cardcaptors'],
  ['Space Ghost (Flying)', 'Space Ghost'],
  ['Huckleberry (Waving)', 'The Huckleberry Hound Show'],
  ['Fred Flintstone (Mowing)', 'Flintstones'],
  ['Watcher Yogi', 'Yogi Bear'],
  ['Obi-Wan Kenobi', 'Star Wars'],
  ['Kungfu Hong Kong Phooey', 'Hong Kong Phooey']
]

function makeRows (extra = []) {
  const rows = CATALOG.map(([name, series], i) => ({
    id: `id-${i}`,
    name,
    series,
    set: 'Original',
    assetPath: `/cToons/${series}/${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.gif`,
    rarity: 'Common',
    inCmart: true,
    totalMinted: 100 - i,
    isSecondEdition: false,
    guessCtoonExcluded: false
  }))
  return rows.concat(extra)
}

test('normalizeName collapses punctuation, case and spacing', () => {
  assert.equal(normalizeName("Dexter's Lab"), 'dexterslab')
  assert.equal(normalizeName('DEXTERS  LAB'), 'dexterslab')
  assert.equal(normalizeName('Obi-Wan Kenobi'), 'obiwankenobi')
  assert.equal(normalizeName(null), '')
})

test('parseName splits modifiers, head and pose suffix', () => {
  const a = parseName('Space Outlaw Eddy')
  assert.deepEqual(a.modifiers, ['Space', 'Outlaw'])
  assert.equal(a.head, 'Eddy')
  assert.equal(a.pose, null)

  const b = parseName('Fred Flintstone (Mowing)')
  assert.equal(b.pose, 'Mowing')
  assert.equal(b.base, 'Fred Flintstone')
  assert.equal(b.head, 'Flintstone')
})

test('answer eligibility bars image slices, numbered items and exclusions', () => {
  const base = { name: 'Goku', assetPath: '/a.gif', isSecondEdition: false, guessCtoonExcluded: false }
  assert.equal(isEligibleAnswer(base), true)
  assert.equal(isEligibleAnswer({ ...base, name: 'Bat Signal (Middle)' }), false)
  assert.equal(isEligibleAnswer({ ...base, name: 'Bat Signal (Top)' }), false)
  assert.equal(isEligibleAnswer({ ...base, name: 'Christmas Present 3' }), false)
  assert.equal(isEligibleAnswer({ ...base, isSecondEdition: true }), false)
  assert.equal(isEligibleAnswer({ ...base, guessCtoonExcluded: true }), false)
  assert.equal(isEligibleAnswer({ ...base, name: 'x'.repeat(MAX_CHOICE_LEN + 1) }), false)
})

test('catalog context dedupes answers by assetPath and keeps second editions as distractors', () => {
  // make-second-edition copies BOTH name and assetPath from the original, so without
  // dedupe a question could offer the same string twice.
  const dupe = {
    id: 'dupe',
    name: 'Goku',
    series: 'Dragon Ball Z',
    set: 'Second',
    assetPath: '/cToons/Dragon Ball Z/goku.gif',
    rarity: 'Common',
    inCmart: false,
    totalMinted: 5,
    isSecondEdition: true,
    guessCtoonExcluded: false
  }
  const rows = makeRows([dupe])
  const ctx = buildCatalogContext(rows)

  const gokuAnswers = ctx.answerRows.filter(r => normalizeName(r.name) === 'goku')
  assert.equal(gokuAnswers.length, 1, 'only one Goku may be an answer')
  assert.equal(ctx.answerRows.some(r => r.isSecondEdition), false)
})

test('tier and quota ramp difficulty through the distractors', () => {
  assert.equal(tierForIndex(0), 1)
  assert.equal(tierForIndex(4), 1)
  assert.equal(tierForIndex(5), 2)
  assert.equal(tierForIndex(15), 3)
  assert.equal(tierForIndex(30), 4)

  assert.deepEqual(quotaForTier(1, 3), ['sameSeries', 'cross', 'cross'])
  assert.deepEqual(quotaForTier(3, 3), ['sameSeries', 'sameSeries', 'sameSeries'])
  // A larger choice count still gets every slot filled.
  assert.equal(quotaForTier(1, 5).length, 5)
})

test('buildQuestion never repeats a choice and always points at the real name', () => {
  const ctx = buildCatalogContext(makeRows())
  let built = 0

  for (let seed = 0; seed < 60; seed++) {
    const rng = seededRng(seed)
    for (const answerRow of ctx.answerRows) {
      const q = buildQuestion(answerRow, ctx, rng, { index: seed % 35, choiceCount: 4 })
      if (!q) continue
      built++

      assert.equal(q.choices.length, 4)
      assert.equal(q.choices[q.correctIndex], answerRow.name)

      const norms = q.choices.map(normalizeName)
      assert.equal(new Set(norms).size, 4, `duplicate choice in [${q.choices.join(' | ')}]`)

      for (const c of q.choices) {
        assert.ok(c.length <= MAX_CHOICE_LEN, `choice too long to render: ${c}`)
        assert.ok(c.trim().length > 0)
      }
    }
  }

  assert.ok(built > 500, `expected plenty of questions, built ${built}`)
})

test('buildQuestion allows at most one wrong answer sharing the character', () => {
  const ctx = buildCatalogContext(makeRows())
  const dexter = ctx.answerRows.find(r => r.name === 'Watcher Dexter')

  for (let seed = 0; seed < 40; seed++) {
    const q = buildQuestion(dexter, ctx, seededRng(seed), { index: 20, choiceCount: 4 })
    if (!q) continue
    const answerHead = normalizeName(parseName(dexter.name).head)
    const sharers = q.choices
      .filter((_, i) => i !== q.correctIndex)
      .filter(c => normalizeName(parseName(c).head) === answerHead)
    assert.ok(sharers.length <= 1, `too many same-character choices: ${q.choices.join(' | ')}`)
  }
})

test('buildRun produces a full, non-repeating batch', () => {
  const ctx = buildCatalogContext(makeRows())
  const questions = buildRun(ctx, 'deadbeefcafe0123', { count: 20, choiceCount: 4 })

  assert.ok(questions.length >= 15, `expected a near-full run, got ${questions.length}`)

  const ids = questions.map(q => q.ctoonId)
  assert.equal(new Set(ids).size, ids.length, 'a run must not repeat a cToon')

  for (const q of questions) {
    assert.equal(q.choices[q.correctIndex], q.name)
    assert.ok(q.assetPath)
  }
})

test('scoreCadence flags metronomic and superhuman answering', () => {
  // Too few samples to judge.
  assert.equal(scoreCadence([900, 1200]).suspicious, false)

  // Human-looking spread.
  assert.equal(scoreCadence([2400, 1100, 3800, 900, 2600, 1750]).suspicious, false)

  // Bot: near-zero variance.
  assert.equal(scoreCadence([1000, 1001, 999, 1000, 1002, 1000]).suspicious, true)

  // Bot: faster than a human can read four names.
  assert.equal(scoreCadence([310, 420, 280, 500, 350, 390]).suspicious, true)

  assert.equal(scoreCadence(null).suspicious, false)
  assert.equal(scoreCadence(['x', NaN, -5]).suspicious, false)
})

// Small deterministic RNG so failures reproduce.
function seededRng (seed) {
  let s = (seed + 1) * 0x9e3779b9
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
