import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMyOrbitRoomBody, parseMyOrbitRoomTiles, parseMyOrbitRoomFurniturePlacements } from '../server/utils/myOrbitRoom.js'

// ── parseMyOrbitRoomBody ─────────────────────────────────────────────────

test('room: requires a non-empty name', () => {
  assert.equal(parseMyOrbitRoomBody({ name: '' }).ok, false)
})

test('room: defaults on create: 10x10, capacity 20, inactive, sortOrder 0', () => {
  const result = parseMyOrbitRoomBody({ name: 'Lobby' })
  assert.deepEqual(result.data, { name: 'Lobby', gridWidth: 10, gridHeight: 10, capacity: 20, active: false, sortOrder: 0 })
})

test('room: grid dimensions must be whole numbers within 3-30', () => {
  assert.equal(parseMyOrbitRoomBody({ name: 'A', gridWidth: 2 }).ok, false)
  assert.equal(parseMyOrbitRoomBody({ name: 'A', gridWidth: 31 }).ok, false)
  assert.equal(parseMyOrbitRoomBody({ name: 'A', gridHeight: 2.5 }).ok, false)
  assert.equal(parseMyOrbitRoomBody({ name: 'A', gridWidth: 30, gridHeight: 3 }).ok, true)
})

test('room: capacity must be within 1-100', () => {
  assert.equal(parseMyOrbitRoomBody({ name: 'A', capacity: 0 }).ok, false)
  assert.equal(parseMyOrbitRoomBody({ name: 'A', capacity: 101 }).ok, false)
})

test('room: on update, an omitted field keeps the existing value', () => {
  const existing = { name: 'Old', gridWidth: 5, gridHeight: 8, capacity: 12, active: true, sortOrder: 3 }
  const result = parseMyOrbitRoomBody({ capacity: 15 }, existing)
  assert.deepEqual(result.data, { name: 'Old', gridWidth: 5, gridHeight: 8, capacity: 15, active: true, sortOrder: 3 })
})

test('room: grid size is immutable once a room exists, even via a direct API call bypassing the admin UI\'s disabled fields', () => {
  const existing = { name: 'Old', gridWidth: 5, gridHeight: 8, capacity: 12, active: true, sortOrder: 3 }
  let result = parseMyOrbitRoomBody({ gridWidth: 6 }, existing)
  assert.equal(result.ok, false)
  assert.match(result.message, /[Gg]rid width/)
  result = parseMyOrbitRoomBody({ gridHeight: 9 }, existing)
  assert.equal(result.ok, false)
  assert.match(result.message, /[Gg]rid height/)
  // Sending back the SAME value it already has is not a change, so it's fine.
  result = parseMyOrbitRoomBody({ gridWidth: 5, gridHeight: 8, capacity: 20 }, existing)
  assert.equal(result.ok, true)
})

test('room: grid size can be anything on create (no existing row to compare against)', () => {
  const result = parseMyOrbitRoomBody({ name: 'New', gridWidth: 20, gridHeight: 25 })
  assert.equal(result.ok, true)
  assert.equal(result.data.gridWidth, 20)
  assert.equal(result.data.gridHeight, 25)
})

// ── parseMyOrbitRoomTiles ────────────────────────────────────────────────

const room5x5 = { gridWidth: 5, gridHeight: 5 }

test('tiles: rejects a cell outside the grid', () => {
  const result = parseMyOrbitRoomTiles({ cells: [{ x: 5, y: 0, tileId: 't1' }] }, room5x5)
  assert.equal(result.ok, false)
  assert.match(result.message, /outside/)
})

test('tiles: rejects a negative coordinate', () => {
  assert.equal(parseMyOrbitRoomTiles({ cells: [{ x: -1, y: 0, tileId: 't1' }] }, room5x5).ok, false)
})

test('tiles: rejects a cell missing a tileId', () => {
  assert.equal(parseMyOrbitRoomTiles({ cells: [{ x: 0, y: 0 }] }, room5x5).ok, false)
})

test('tiles: repainting the same cell twice in one save keeps the LAST value, not an error', () => {
  const result = parseMyOrbitRoomTiles({ cells: [{ x: 0, y: 0, tileId: 't1' }, { x: 0, y: 0, tileId: 't2' }] }, room5x5)
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, [{ x: 0, y: 0, tileId: 't2' }])
})

test('tiles: an empty cell list is valid (clears the whole floor)', () => {
  assert.deepEqual(parseMyOrbitRoomTiles({ cells: [] }, room5x5).data, [])
})

test('tiles: rejects more cells than the grid can physically hold', () => {
  const tooMany = Array.from({ length: 26 }, (_, i) => ({ x: i % 5, y: 0, tileId: 't1' }))
  assert.equal(parseMyOrbitRoomTiles({ cells: tooMany }, room5x5).ok, false)
})

test('tiles: cells must be an array', () => {
  assert.equal(parseMyOrbitRoomTiles({ cells: 'nope' }, room5x5).ok, false)
  assert.equal(parseMyOrbitRoomTiles({}, room5x5).ok, false)
})

// ── parseMyOrbitRoomFurniturePlacements ──────────────────────────────────

function painted(...coords) {
  return new Set(coords.map(([x, y]) => `${x},${y}`))
}

/** furnitureById map builder - the authoritative library data the route handler reads fresh
 * from the DB, never from the request body. */
function library(entries) {
  return new Map(Object.entries(entries).map(([id, [footprintW, footprintH]]) => [id, { footprintW, footprintH }]))
}

test('furniture: a 1x1 piece on a painted cell is accepted', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'f1', x: 1, y: 1, rotation: 0 }] },
    room5x5, painted([1, 1]), library({ f1: [1, 1] })
  )
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, [{ furnitureId: 'f1', x: 1, y: 1, rotation: 0 }])
})

test('furniture: rejects a piece covering an unpainted cell', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'f1', x: 1, y: 1, rotation: 0 }] },
    room5x5, painted([0, 0]), library({ f1: [1, 1] })
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /unpainted/)
})

test('furniture: a 2x1 piece rotated 90 degrees needs its SWAPPED footprint painted, not the unrotated one', () => {
  // Unrotated 2x1 at (0,0) would need (0,0) and (1,0) painted. Rotated 90, the effective
  // footprint is 1x2, needing (0,0) and (0,1) instead - this pins that the validator actually
  // reads the rotated footprint, not the raw library footprintW/footprintH.
  const paintedForRotated = painted([0, 0], [0, 1])
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'f1', x: 0, y: 0, rotation: 90 }] },
    room5x5, paintedForRotated, library({ f1: [2, 1] })
  )
  assert.equal(result.ok, true)
})

test('furniture: rejects a rotation that is not 0/90/180/270', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'f1', x: 0, y: 0, rotation: 45 }] },
    room5x5, painted([0, 0]), library({ f1: [1, 1] })
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /[Rr]otation/)
})

test('furniture: rejects a footprint that does not fit the grid', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'f1', x: 4, y: 4, rotation: 0 }] },
    room5x5, painted([4, 4]), library({ f1: [2, 2] })
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /fit/)
})

test('furniture: rejects two placements whose footprints overlap', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    {
      placements: [
        { furnitureId: 'f1', x: 0, y: 0, rotation: 0 },
        { furnitureId: 'f2', x: 1, y: 1, rotation: 0 }
      ]
    },
    room5x5, painted([0, 0], [0, 1], [1, 0], [1, 1]), library({ f1: [2, 2], f2: [1, 1] })
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /overlaps/)
})

test('furniture: two non-overlapping placements are both accepted', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    {
      placements: [
        { furnitureId: 'f1', x: 0, y: 0, rotation: 0 },
        { furnitureId: 'f2', x: 2, y: 2, rotation: 0 }
      ]
    },
    room5x5, painted([0, 0], [2, 2]), library({ f1: [1, 1], f2: [1, 1] })
  )
  assert.equal(result.ok, true)
  assert.equal(result.data.length, 2)
})

test('furniture: rejects a missing furnitureId', () => {
  const result = parseMyOrbitRoomFurniturePlacements({ placements: [{ x: 0, y: 0 }] }, room5x5, painted([0, 0]), library({}))
  assert.equal(result.ok, false)
})

test('furniture: a furnitureId absent from the library map is rejected outright, not silently trusted', () => {
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'ghost', x: 0, y: 0, rotation: 0 }] },
    room5x5, painted([0, 0]), library({})
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /does not exist/)
})

test('furniture: client-supplied footprintW/footprintH in the body are IGNORED - the library map is the only source of truth', () => {
  // A caller lies about a 3x3 piece being 1x1: the real footprint (from the library map) still
  // governs the fit/overlap checks, so this still gets validated (and would be rejected) at its
  // TRUE 3x3 size, not the fabricated 1x1 - here asserting it still OVERFLOWS the grid at (4,4)
  // even though the lie would have fit.
  const result = parseMyOrbitRoomFurniturePlacements(
    { placements: [{ furnitureId: 'f1', x: 4, y: 4, rotation: 0, footprintW: 1, footprintH: 1 }] },
    room5x5, painted([4, 4]), library({ f1: [3, 3] })
  )
  assert.equal(result.ok, false)
  assert.match(result.message, /fit/)
})

test('furniture: placements must be an array', () => {
  assert.equal(parseMyOrbitRoomFurniturePlacements({ placements: 'nope' }, room5x5, painted(), library({})).ok, false)
})

// ── parseMyOrbitRoomTiles protecting existing furniture ─────────────────

test('tiles: rejects erasing a cell that existing furniture is standing on', () => {
  const existingFootprints = [{ x: 0, y: 0, width: 2, height: 1 }] // covers (0,0) and (1,0)
  const result = parseMyOrbitRoomTiles({ cells: [{ x: 0, y: 0, tileId: 't1' }] }, room5x5, existingFootprints)
  assert.equal(result.ok, false)
  assert.match(result.message, /standing on \(1, 0\)/)
})

test('tiles: accepts a save that keeps every cell existing furniture needs', () => {
  const existingFootprints = [{ x: 0, y: 0, width: 2, height: 1 }]
  const result = parseMyOrbitRoomTiles(
    { cells: [{ x: 0, y: 0, tileId: 't1' }, { x: 1, y: 0, tileId: 't1' }, { x: 4, y: 4, tileId: 't1' }] },
    room5x5, existingFootprints
  )
  assert.equal(result.ok, true)
  assert.equal(result.data.length, 3)
})

test('tiles: with no existing furniture, any cell can be freely erased', () => {
  const result = parseMyOrbitRoomTiles({ cells: [] }, room5x5, [])
  assert.equal(result.ok, true)
})
