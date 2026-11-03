import test from 'node:test'
import assert from 'node:assert/strict'
import { introScenario, targetColors, avatarCells, avatarColor } from '../utils/ogGtoonIntro.js'

test('intro: two different goal colors -> most cards of both wins, otherwise points', () => {
  const s = introScenario(['RED', 'BLUE'])
  assert.equal(s.key, 'two')
  assert.equal(s.title, 'Two colors revealed')
  assert.deepEqual(s.colors, ['RED', 'BLUE'])
  assert.match(s.lines[0], /more cards of each color/i)
  assert.match(s.lines[1], /decided by points/i)
})

test('intro: the same goal color on both sides, or only one real color, is a one-color game (+15 bonus)', () => {
  for (const goals of [['GREEN', 'GREEN'], ['GREEN', 'BLACK'], ['SILVER', 'GREEN']]) {
    const s = introScenario(goals)
    assert.equal(s.key, 'one', goals.join('/'))
    assert.deepEqual(s.colors, ['GREEN'])
    assert.match(s.lines.join(' '), /15 bonus points/)
  }
})

test('intro: Black / Silver / missing goals are never a target color -> points only', () => {
  assert.deepEqual(targetColors(['BLACK', 'SILVER', null, undefined]), [])
  const s = introScenario(['BLACK', 'SILVER'])
  assert.equal(s.key, 'none')
  assert.deepEqual(s.colors, [])
  assert.equal(introScenario(undefined).key, 'none')
})

test('intro: the pixel avatar is stable per name, mirrored left-right, and never empty', () => {
  for (const name of ['Computer', 'Informal Muddy Western', '', undefined, 'x']) {
    const a = avatarCells(name)
    assert.deepEqual(a, avatarCells(name))
    assert.ok(a.length >= 5)
    const set = new Set(a.map(c => `${c.x},${c.y}`))
    for (const c of a) {
      assert.ok(c.x >= 0 && c.x <= 4 && c.y >= 0 && c.y <= 4)
      // Symmetric, except for the fallback column that is itself centred.
      assert.ok(set.has(`${4 - c.x},${c.y}`), `${name}: ${c.x},${c.y} has no mirror`)
    }
    assert.match(avatarColor(name), /^hsl\(\d+ 62% 48%\)$/)
  }
  assert.notDeepEqual(avatarCells('Computer'), avatarCells('Informal Muddy Western'))
})
