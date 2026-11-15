import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TILE_WIDTH, TILE_HEIGHT, MYORBIT_LAYER,
  gridStageSize, tileScreenPosition, depthIndex, effectiveFootprint, footprintFitsGrid, footprintsOverlap
} from '../utils/myOrbitIsometric.js'

test('gridStageSize: every grid corner projects within [0, width/height] after offsetting', () => {
  for (const [w, h] of [[3, 3], [10, 10], [30, 3], [3, 30], [15, 22]]) {
    const stage = gridStageSize(w, h)
    for (const [col, row] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
      const pos = tileScreenPosition(col, row, stage)
      assert.ok(pos.left >= 0, `left >= 0 for ${w}x${h} at (${col},${row})`)
      assert.ok(pos.top >= 0, `top >= 0 for ${w}x${h} at (${col},${row})`)
      assert.ok(pos.left + TILE_WIDTH <= stage.width, `fits width for ${w}x${h} at (${col},${row})`)
      assert.ok(pos.top + TILE_HEIGHT <= stage.height, `fits height for ${w}x${h} at (${col},${row})`)
    }
  }
})

test('gridStageSize: never returns a negative zero offset', () => {
  const stage = gridStageSize(5, 5)
  assert.ok(!Object.is(stage.offsetX, -0))
  assert.ok(!Object.is(stage.offsetY, -0))
})

test('depthIndex: a cell further along (col+row) always sorts above one closer in, same layer', () => {
  assert.ok(depthIndex(0, 0, 1, 1, MYORBIT_LAYER.FLOOR) < depthIndex(5, 5, 1, 1, MYORBIT_LAYER.FLOOR))
  assert.ok(depthIndex(2, 2, 1, 1, MYORBIT_LAYER.FLOOR) < depthIndex(2, 3, 1, 1, MYORBIT_LAYER.FLOOR))
})

test('depthIndex: furniture always sorts above floor at the exact same depth', () => {
  assert.ok(depthIndex(3, 3, 1, 1, MYORBIT_LAYER.FLOOR) < depthIndex(3, 3, 1, 1, MYORBIT_LAYER.FURNITURE))
})

test('depthIndex: a multi-tile footprint sorts by its FRONT (bottom-right) cell, not its anchor', () => {
  // A 2x1 piece anchored at (0,0) occupies (0,0) and (1,0); its front cell is (1,0) - same depth
  // as a 1x1 piece actually anchored there.
  assert.equal(depthIndex(0, 0, 2, 1, MYORBIT_LAYER.FURNITURE), depthIndex(1, 0, 1, 1, MYORBIT_LAYER.FURNITURE))
})

test('effectiveFootprint: 0 and 180 keep the unrotated width/height; 90 and 270 swap them', () => {
  assert.deepEqual(effectiveFootprint(2, 1, 0), { width: 2, height: 1 })
  assert.deepEqual(effectiveFootprint(2, 1, 180), { width: 2, height: 1 })
  assert.deepEqual(effectiveFootprint(2, 1, 90), { width: 1, height: 2 })
  assert.deepEqual(effectiveFootprint(2, 1, 270), { width: 1, height: 2 })
})

test('effectiveFootprint: a square footprint is unaffected by rotation', () => {
  for (const r of [0, 90, 180, 270]) {
    assert.deepEqual(effectiveFootprint(2, 2, r), { width: 2, height: 2 })
  }
})

test('footprintFitsGrid: rejects negative coordinates and overruns, accepts a flush fit', () => {
  assert.equal(footprintFitsGrid(-1, 0, 1, 1, 5, 5), false)
  assert.equal(footprintFitsGrid(0, -1, 1, 1, 5, 5), false)
  assert.equal(footprintFitsGrid(4, 4, 2, 2, 5, 5), false)
  assert.equal(footprintFitsGrid(3, 3, 2, 2, 5, 5), true)
  assert.equal(footprintFitsGrid(1.5, 0, 1, 1, 5, 5), false)
})

test('footprintsOverlap: detects overlap and non-overlap, including edge-adjacent (not overlapping)', () => {
  assert.equal(footprintsOverlap({ x: 0, y: 0, width: 2, height: 2 }, { x: 1, y: 1, width: 2, height: 2 }), true)
  assert.equal(footprintsOverlap({ x: 0, y: 0, width: 2, height: 2 }, { x: 2, y: 0, width: 2, height: 2 }), false)
  assert.equal(footprintsOverlap({ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }), true)
})
