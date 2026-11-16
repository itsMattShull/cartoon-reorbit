import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMyOrbitTileBody, parseMyOrbitFurnitureBody } from '../server/utils/myOrbitAssets.js'

// ── parseMyOrbitTileBody ────────────────────────────────────────────────────

test('tile: requires a non-empty name', () => {
  const result = parseMyOrbitTileBody({ name: '' })
  assert.equal(result.ok, false)
  assert.match(result.message, /name/i)
})

test('tile: rejects a name over 80 characters', () => {
  const result = parseMyOrbitTileBody({ name: 'x'.repeat(81) })
  assert.equal(result.ok, false)
})

test('tile: trims the name', () => {
  const result = parseMyOrbitTileBody({ name: '  Checker Floor  ' })
  assert.equal(result.ok, true)
  assert.equal(result.data.name, 'Checker Floor')
})

test('tile: walkable accepts a real boolean or a multipart "true"/"false" string', () => {
  assert.equal(parseMyOrbitTileBody({ name: 'A', walkable: true }).data.walkable, true)
  assert.equal(parseMyOrbitTileBody({ name: 'A', walkable: false }).data.walkable, false)
  assert.equal(parseMyOrbitTileBody({ name: 'A', walkable: 'true' }).data.walkable, true)
  assert.equal(parseMyOrbitTileBody({ name: 'A', walkable: 'false' }).data.walkable, false)
})

test('tile: an unrecognized walkable value is rejected rather than silently coerced', () => {
  const result = parseMyOrbitTileBody({ name: 'A', walkable: 'yes' })
  assert.equal(result.ok, false)
  assert.match(result.message, /walkable/i)
})

test('tile: defaults walkable to true on create when omitted', () => {
  assert.equal(parseMyOrbitTileBody({ name: 'A' }).data.walkable, true)
})

test('tile: on update, an omitted field keeps the existing row\'s value rather than resetting to the create default', () => {
  const existing = { name: 'Old Name', walkable: false }
  const result = parseMyOrbitTileBody({}, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.name, 'Old Name')
  assert.equal(result.data.walkable, false)
})

test('tile: on update, a present field overrides the existing value', () => {
  const existing = { name: 'Old Name', walkable: false }
  const result = parseMyOrbitTileBody({ walkable: 'true' }, existing)
  assert.equal(result.data.walkable, true)
  assert.equal(result.data.name, 'Old Name')
})

// ── parseMyOrbitFurnitureBody ───────────────────────────────────────────────

test('furniture: requires a non-empty name', () => {
  assert.equal(parseMyOrbitFurnitureBody({ name: '' }).ok, false)
})

test('furniture: defaults footprint to 1x1, blocksWalk true, zOffset 0 on create', () => {
  const result = parseMyOrbitFurnitureBody({ name: 'Sofa' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { name: 'Sofa', footprintW: 1, footprintH: 1, blocksWalk: true, zOffset: 0 })
})

test('furniture: footprint must be a whole number within 1-10', () => {
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', footprintW: 0 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', footprintW: 11 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', footprintW: 1.5 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', footprintH: 0 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', footprintH: 11 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', footprintW: 2, footprintH: 3 }).ok, true)
})

test('furniture: zOffset must be a whole number within -999..999', () => {
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', zOffset: -1000 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', zOffset: 1000 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', zOffset: 2.5 }).ok, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', zOffset: -50 }).ok, true)
})

test('furniture: blocksWalk accepts a real boolean or a multipart string, rejects junk', () => {
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', blocksWalk: false }).data.blocksWalk, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', blocksWalk: 'false' }).data.blocksWalk, false)
  assert.equal(parseMyOrbitFurnitureBody({ name: 'A', blocksWalk: 'nah' }).ok, false)
})

test('furniture: on update, every omitted field keeps the existing row\'s value', () => {
  const existing = { name: 'Old Sofa', footprintW: 2, footprintH: 1, blocksWalk: false, zOffset: 5 }
  const result = parseMyOrbitFurnitureBody({}, existing)
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, existing)
})

test('furniture: never returns assetPath - that is only ever set by the route handler after a file is actually written', () => {
  const result = parseMyOrbitFurnitureBody({ name: 'Sofa', assetPath: '/evil/path.png' })
  assert.equal(result.ok, true)
  assert.equal('assetPath' in result.data, false)
})
