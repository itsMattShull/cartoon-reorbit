// Pure validators + grid-layout helpers for MyOrbitRoom and its two batch-save children
// (MyOrbitRoomTile, MyOrbitRoomFurniture). Same import-free, DB-free contract as
// server/utils/myOrbitAssets.js — plain validators the route handlers call, never importing
// Prisma/Redis themselves, so they stay importable from a bare `node --test` run.
//
// Relative import, NOT the `@/` alias: this module is also imported from
// server/utils/myOrbitSocket.js, which runs inside server/socket-server.js — a plain
// `node server/socket-server.js` process that cannot resolve Nuxt/Vite's `@/` alias (see the
// import-rules header comment in server/utils/notifications.js for the same constraint).
import { effectiveFootprint, footprintFitsGrid, footprintsOverlap } from '../../utils/myOrbitIsometric.js'

export const MYORBIT_ROOM_NAME_MAX_LENGTH = 80
export const MYORBIT_GRID_MIN = 3
export const MYORBIT_GRID_MAX = 30
export const MYORBIT_CAPACITY_MIN = 1
export const MYORBIT_CAPACITY_MAX = 100
export const MYORBIT_SORT_ORDER_MIN = -9999
export const MYORBIT_SORT_ORDER_MAX = 9999

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

function toBoolean(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

/** `existing` is the current row on an update (undefined on create). Same "omitted field keeps
 * the existing value (or create default)" convention as parseMyOrbitTileBody. Grid size is
 * immutable once a room exists — enforced HERE, not just by the admin builder disabling those
 * inputs, since a direct API call bypasses any client-side-only restriction. Shrinking/growing
 * the grid after painting would silently orphan existing MyOrbitRoomTile/MyOrbitRoomFurniture
 * rows outside the new bounds (this validator doesn't touch those rows at all), so it's rejected
 * outright rather than left as an undocumented footgun; delete and recreate the room to resize. */
export function parseMyOrbitRoomBody(body, existing) {
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : (typeof body.name === 'string' ? body.name.trim() : '')
  const gridWidth = body?.gridWidth === undefined
    ? (existing ? existing.gridWidth : 10)
    : toNumber(body.gridWidth)
  const gridHeight = body?.gridHeight === undefined
    ? (existing ? existing.gridHeight : 10)
    : toNumber(body.gridHeight)

  if (existing && body?.gridWidth !== undefined && toNumber(body.gridWidth) !== existing.gridWidth) {
    return { ok: false, message: 'Grid width cannot be changed after a room is created — delete and recreate it to resize' }
  }
  if (existing && body?.gridHeight !== undefined && toNumber(body.gridHeight) !== existing.gridHeight) {
    return { ok: false, message: 'Grid height cannot be changed after a room is created — delete and recreate it to resize' }
  }
  const capacity = body?.capacity === undefined
    ? (existing ? existing.capacity : 20)
    : toNumber(body.capacity)
  const active = toBoolean(body?.active, existing ? !!existing.active : false)
  const sortOrder = body?.sortOrder === undefined
    ? (existing ? existing.sortOrder : 0)
    : toNumber(body.sortOrder)

  if (!name || name.length > MYORBIT_ROOM_NAME_MAX_LENGTH) {
    return { ok: false, message: `Name is required (max ${MYORBIT_ROOM_NAME_MAX_LENGTH} characters)` }
  }
  if (!Number.isInteger(gridWidth) || gridWidth < MYORBIT_GRID_MIN || gridWidth > MYORBIT_GRID_MAX) {
    return { ok: false, message: `Grid width must be a whole number between ${MYORBIT_GRID_MIN} and ${MYORBIT_GRID_MAX}` }
  }
  if (!Number.isInteger(gridHeight) || gridHeight < MYORBIT_GRID_MIN || gridHeight > MYORBIT_GRID_MAX) {
    return { ok: false, message: `Grid height must be a whole number between ${MYORBIT_GRID_MIN} and ${MYORBIT_GRID_MAX}` }
  }
  if (!Number.isInteger(capacity) || capacity < MYORBIT_CAPACITY_MIN || capacity > MYORBIT_CAPACITY_MAX) {
    return { ok: false, message: `Capacity must be a whole number between ${MYORBIT_CAPACITY_MIN} and ${MYORBIT_CAPACITY_MAX}` }
  }
  if (active === null) return { ok: false, message: 'Active must be true or false' }
  if (!Number.isInteger(sortOrder) || sortOrder < MYORBIT_SORT_ORDER_MIN || sortOrder > MYORBIT_SORT_ORDER_MAX) {
    return { ok: false, message: `Sort order must be a whole number between ${MYORBIT_SORT_ORDER_MIN} and ${MYORBIT_SORT_ORDER_MAX}` }
  }

  return { ok: true, data: { name, gridWidth, gridHeight, capacity, active, sortOrder } }
}

/**
 * Validates a full tile-layout replacement payload (the body of PUT .../rooms/[id]/tiles) against
 * the room's CURRENT gridWidth/gridHeight. Returns `{ ok: true, data: [{x,y,tileId}, ...] }` (deduped
 * by (x,y), last one wins - matches "repainting the same cell twice in one save" being a no-op, not
 * an error) or `{ ok: false, message }`. Does NOT check that each tileId actually exists in
 * MyOrbitTile - the route handler's own DB insert (onDelete: Restrict FK) is the authoritative
 * check for that, same division of labor as every other parse* validator in this file.
 *
 * `existingFurnitureFootprints` (optional, default []) is the room's CURRENTLY PLACED furniture,
 * each as an already rotation-adjusted `{x, y, width, height}` (read fresh from the DB by the
 * route handler, joined with the real MyOrbitFurniture library row for its footprint). Every
 * cell any of them covers must still be present in the NEW cell list - tiles and furniture save
 * as two independent requests, but a floor repaint must never be allowed to strand furniture
 * that's standing on it, even via a direct API call that skips the admin builder's own
 * click-time guard against erasing a furnished cell.
 */
export function parseMyOrbitRoomTiles(body, room, existingFurnitureFootprints = []) {
  if (!Array.isArray(body?.cells)) return { ok: false, message: 'cells must be an array' }
  if (body.cells.length > room.gridWidth * room.gridHeight) {
    return { ok: false, message: 'More cells than the room\'s own grid can hold' }
  }

  const byKey = new Map()
  for (const cell of body.cells) {
    const x = toNumber(cell?.x)
    const y = toNumber(cell?.y)
    const tileId = typeof cell?.tileId === 'string' ? cell.tileId : ''
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= room.gridWidth || y >= room.gridHeight) {
      return { ok: false, message: `Cell (${cell?.x}, ${cell?.y}) is outside this room's ${room.gridWidth}x${room.gridHeight} grid` }
    }
    if (!tileId) return { ok: false, message: `Cell (${x}, ${y}) is missing a tileId` }
    byKey.set(`${x},${y}`, { x, y, tileId })
  }

  for (const fp of existingFurnitureFootprints) {
    for (let dx = 0; dx < fp.width; dx++) {
      for (let dy = 0; dy < fp.height; dy++) {
        if (!byKey.has(`${fp.x + dx},${fp.y + dy}`)) {
          return { ok: false, message: `Furniture is standing on (${fp.x + dx}, ${fp.y + dy}) - remove it before erasing that cell's floor` }
        }
      }
    }
  }

  return { ok: true, data: [...byKey.values()] }
}

/**
 * Validates a full furniture-layout replacement payload against the room's current grid AND its
 * CURRENTLY PERSISTED tiles (`paintedCells`, a Set of "x,y" strings read fresh from the DB by the
 * route handler) - furniture may only stand on cells that already have a floor tile painted, never
 * on unpainted void. Also rejects any two pieces in the same payload whose effective (rotation-
 * applied) footprints overlap.
 *
 * `furnitureById` is a `Map<furnitureId, {footprintW, footprintH}>` of the REAL library rows for
 * every furnitureId this payload references, read fresh from the DB by the route handler.
 * Footprint dimensions are deliberately never taken from the request body itself: trusting a
 * client-supplied footprintW/footprintH here would let a caller validate fit/overlap against a
 * fabricated size while the row actually gets rendered (server/api/admin/myorbit-rooms/[id].get.js)
 * at its REAL, authoritative footprint - silently defeating this exact check. A furnitureId
 * missing from the map (nonexistent, or the caller forgot to include it) is rejected outright
 * rather than falling through to the DB's own FK error on insert, since by then the fit/overlap
 * checks below would already have run against nothing.
 */
export function parseMyOrbitRoomFurniturePlacements(body, room, paintedCells, furnitureById) {
  if (!Array.isArray(body?.placements)) return { ok: false, message: 'placements must be an array' }

  const footprints = []
  const data = []
  for (const p of body.placements) {
    const x = toNumber(p?.x)
    const y = toNumber(p?.y)
    const rotation = p?.rotation === undefined ? 0 : toNumber(p.rotation)
    const furnitureId = typeof p?.furnitureId === 'string' ? p.furnitureId : ''

    if (!furnitureId) return { ok: false, message: 'A placement is missing a furnitureId' }
    const libraryItem = furnitureById?.get(furnitureId)
    if (!libraryItem) return { ok: false, message: `Furniture ${furnitureId} does not exist` }
    if (![0, 90, 180, 270].includes(rotation)) {
      return { ok: false, message: `Rotation must be 0, 90, 180, or 270 (got ${p?.rotation})` }
    }

    const { width, height } = effectiveFootprint(libraryItem.footprintW, libraryItem.footprintH, rotation)
    if (!footprintFitsGrid(x, y, width, height, room.gridWidth, room.gridHeight)) {
      return { ok: false, message: `${furnitureId} at (${p?.x}, ${p?.y}) does not fit inside this room's ${room.gridWidth}x${room.gridHeight} grid` }
    }
    const footprint = { x, y, width, height }
    for (const other of footprints) {
      if (footprintsOverlap(footprint, other)) {
        return { ok: false, message: `${furnitureId} at (${x}, ${y}) overlaps another placed furniture piece` }
      }
    }
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        if (!paintedCells.has(`${x + dx},${y + dy}`)) {
          return { ok: false, message: `${furnitureId} at (${x}, ${y}) covers an unpainted cell (${x + dx}, ${y + dy}) - paint the floor there first` }
        }
      }
    }
    footprints.push(footprint)
    data.push({ furnitureId, x, y, rotation })
  }

  return { ok: true, data }
}
