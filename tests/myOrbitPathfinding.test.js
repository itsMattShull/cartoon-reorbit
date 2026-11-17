import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWalkableSet, findPath, firstWalkableCell } from '../server/utils/myOrbitPathfinding.js'

function openRoom(w, h) {
  const tiles = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push({ x, y, walkable: true })
  return tiles
}

// ── buildWalkableSet ─────────────────────────────────────────────────────

test('buildWalkableSet: only walkable tiles are included', () => {
  const tiles = [{ x: 0, y: 0, walkable: true }, { x: 1, y: 0, walkable: false }]
  const set = buildWalkableSet(tiles, [])
  assert.ok(set.has('0,0'))
  assert.ok(!set.has('1,0'))
})

test('buildWalkableSet: furniture with blocksWalk removes its footprint from an otherwise walkable floor', () => {
  const tiles = openRoom(3, 3)
  const set = buildWalkableSet(tiles, [{ x: 0, y: 0, rotation: 0, footprintW: 2, footprintH: 1, blocksWalk: true }])
  assert.ok(!set.has('0,0'))
  assert.ok(!set.has('1,0'))
  assert.ok(set.has('2,0')) // outside the footprint, untouched
})

test('buildWalkableSet: blocksWalk=false furniture never removes a cell (can only ADD a block, never remove one)', () => {
  const tiles = openRoom(2, 2)
  const set = buildWalkableSet(tiles, [{ x: 0, y: 0, rotation: 0, footprintW: 1, footprintH: 1, blocksWalk: false }])
  assert.ok(set.has('0,0'))
})

test('buildWalkableSet: a 2x1 footprint rotated 90 degrees blocks its SWAPPED cells, not the unrotated ones', () => {
  const tiles = openRoom(3, 3)
  const set = buildWalkableSet(tiles, [{ x: 0, y: 0, rotation: 90, footprintW: 2, footprintH: 1, blocksWalk: true }])
  // unrotated 2x1 would block (0,0),(1,0); rotated 90 it's 1x2, blocking (0,0),(0,1) instead.
  assert.ok(!set.has('0,0'))
  assert.ok(!set.has('0,1'))
  assert.ok(set.has('1,0'))
})

test('buildWalkableSet: an unwalkable (void) tile under furniture stays unwalkable regardless of blocksWalk', () => {
  const tiles = [{ x: 0, y: 0, walkable: false }]
  const set = buildWalkableSet(tiles, [{ x: 0, y: 0, rotation: 0, footprintW: 1, footprintH: 1, blocksWalk: false }])
  assert.ok(!set.has('0,0'))
})

// ── findPath ─────────────────────────────────────────────────────────────

test('findPath: a straight horizontal line in an open room', () => {
  const w = buildWalkableSet(openRoom(5, 5), [])
  const path = findPath(w, 5, 5, { x: 0, y: 0 }, { x: 4, y: 0 }, 2000)
  assert.deepEqual(path, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }])
})

test('findPath: a diagonal move takes the direct diagonal, not an L-shaped detour', () => {
  const w = buildWalkableSet(openRoom(5, 5), [])
  const path = findPath(w, 5, 5, { x: 0, y: 0 }, { x: 4, y: 4 }, 2000)
  assert.equal(path.length, 5) // 4 diagonal steps, not 8 orthogonal ones
  for (let i = 1; i < path.length; i++) {
    assert.equal(Math.abs(path[i].x - path[i - 1].x), 1)
    assert.equal(Math.abs(path[i].y - path[i - 1].y), 1)
  }
})

test('findPath: requesting the current cell returns a single-point path', () => {
  const w = buildWalkableSet(openRoom(5, 5), [])
  assert.deepEqual(findPath(w, 5, 5, { x: 2, y: 2 }, { x: 2, y: 2 }), [{ x: 2, y: 2 }])
})

test('findPath: null when the destination is outside the grid', () => {
  const w = buildWalkableSet(openRoom(5, 5), [])
  assert.equal(findPath(w, 5, 5, { x: 0, y: 0 }, { x: 10, y: 10 }), null)
})

test('findPath: null when the destination cell itself is unwalkable', () => {
  const tiles = openRoom(3, 3).filter(t => !(t.x === 2 && t.y === 2))
  const w = buildWalkableSet(tiles, [])
  assert.equal(findPath(w, 3, 3, { x: 0, y: 0 }, { x: 2, y: 2 }), null)
})

test('findPath: null when the start cell itself is unwalkable', () => {
  const w = buildWalkableSet(openRoom(3, 3), [])
  assert.equal(findPath(w, 3, 3, { x: -1, y: -1 }, { x: 0, y: 0 }), null)
})

test('findPath: detours around a wall through the one open gap', () => {
  // Column x=2 is blocked except at y=4 - the only way from the left half to the right half.
  const tiles = openRoom(5, 5).filter(t => !(t.x === 2 && t.y < 4))
  const w = buildWalkableSet(tiles, [])
  const path = findPath(w, 5, 5, { x: 0, y: 0 }, { x: 4, y: 0 }, 2000)
  assert.ok(path, 'a path should exist through the gap')
  assert.ok(path.some(p => p.x === 2 && p.y === 4), 'the path must pass through the only gap at (2,4)')
})

test('findPath: a fully walled-off destination is unreachable', () => {
  const tiles = [
    { x: 0, y: 0, walkable: true },
    { x: 2, y: 2, walkable: true } // isolated - no path of walkable cells connects to (0,0)
  ]
  const w = buildWalkableSet(tiles, [])
  assert.equal(findPath(w, 5, 5, { x: 0, y: 0 }, { x: 2, y: 2 }), null)
})

test('findPath: refuses to cut a diagonal through a blocked corner', () => {
  // (0,0) and (1,1) are walkable, but BOTH (1,0) and (0,1) are blocked - a diagonal step from
  // (0,0) to (1,1) would clip through that blocked corner and must be refused even though both
  // endpoints are individually walkable.
  const tiles = [{ x: 0, y: 0, walkable: true }, { x: 1, y: 1, walkable: true }]
  const w = buildWalkableSet(tiles, [])
  assert.equal(findPath(w, 2, 2, { x: 0, y: 0 }, { x: 1, y: 1 }, 2000), null)
})

test('findPath: allows the diagonal once BOTH flanking orthogonal cells are walkable', () => {
  const tiles = openRoom(2, 2)
  const w = buildWalkableSet(tiles, [])
  const path = findPath(w, 2, 2, { x: 0, y: 0 }, { x: 1, y: 1 }, 2000)
  assert.deepEqual(path, [{ x: 0, y: 0 }, { x: 1, y: 1 }])
})

test('findPath: respects furniture obstruction by routing around it', () => {
  const w = buildWalkableSet(openRoom(5, 1).concat(openRoom(5, 1).map(t => ({ ...t, y: 1 }))), [
    { x: 2, y: 0, rotation: 0, footprintW: 1, footprintH: 1, blocksWalk: true }
  ])
  const path = findPath(w, 5, 2, { x: 1, y: 0 }, { x: 3, y: 0 }, 2000)
  assert.ok(path, 'a path should exist via row y=1')
  assert.ok(!path.some(p => p.x === 2 && p.y === 0), 'the blocked cell must not appear in the path')
})

// ── firstWalkableCell ────────────────────────────────────────────────────

test('firstWalkableCell: scans in (y, then x) order', () => {
  const tiles = [{ x: 2, y: 1, walkable: true }, { x: 0, y: 2, walkable: true }]
  const w = buildWalkableSet(tiles, [])
  assert.deepEqual(firstWalkableCell(w, 5, 5), { x: 2, y: 1 })
})

test('firstWalkableCell: null when nothing is walkable', () => {
  assert.equal(firstWalkableCell(new Set(), 5, 5), null)
})
