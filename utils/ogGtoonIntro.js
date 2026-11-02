// utils/ogGtoonIntro.js
//
// Pure helpers for the pre-match screen of Original gToons (components/oggtoons/OgGtoonMatchIntro.vue):
// which "how this game is decided" text applies to a pair of goal colors, and a deterministic pixel
// avatar for a username. No Vue / DOM, so tests/ogGtoonIntro.test.js can cover them.

const REAL_COLORS = ['BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK']

/** The distinct target colors for a pair of goal colors (Black / Silver are never a target). */
export function targetColors(goalColors) {
  return [...new Set((goalColors || []).filter(c => REAL_COLORS.includes(c)))]
}

/**
 * What decides the game, for the middle box of the intro:
 *   two different colors -> most cards of BOTH combined wins outright (a tie is decided by points)
 *   one color (or both the same) -> points decide, with +15 for the player holding more of that color
 *   none -> points only
 * @returns {{ key: 'two'|'one'|'none', title: string, colors: string[], lines: string[] }}
 */
export function introScenario(goalColors) {
  const colors = targetColors(goalColors)
  if (colors.length >= 2) {
    return {
      key: 'two',
      title: 'Two colors revealed',
      colors,
      lines: [
        'If a player has more cards of both colors, he or she wins automatically.',
        'If neither player has more of both colors, the game will be decided by points.'
      ]
    }
  }
  if (colors.length === 1) {
    return {
      key: 'one',
      title: 'One color revealed',
      colors,
      lines: [
        'This game will be decided by points.',
        'The player with more cards of this color earns 15 bonus points.'
      ]
    }
  }
  return {
    key: 'none',
    title: 'No colors revealed',
    colors,
    lines: ['This game will be decided by points only.']
  }
}

/** Small stable string hash (FNV-1a, 32-bit). */
function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * A 5x5 left-right symmetric pixel pattern for `name`: the list of filled cells { x, y }. The same name always
 * gives the same pattern, and at least a few cells are always filled.
 */
export function avatarCells(name) {
  let h = hash(String(name || '?'))
  const cells = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = (h >>> ((y * 3 + x) % 31)) & 1
      if (on) {
        cells.push({ x, y })
        if (x < 2) cells.push({ x: 4 - x, y })
      }
    }
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  }
  if (cells.length < 5) cells.push({ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 })
  return cells
}

/** A deterministic, readable color for a username's avatar. */
export function avatarColor(name) {
  const hue = hash(`c:${name || '?'}`) % 360
  return `hsl(${hue} 62% 48%)`
}
