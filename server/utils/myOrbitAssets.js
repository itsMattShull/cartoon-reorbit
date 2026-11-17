// Pure validators for the two MyOrbit admin-authored art libraries (MyOrbitTile,
// MyOrbitFurniture) — same "body field undefined => keep existing (or default on create)"
// convention as parseEnemyMapBody (server/utils/cmoonEnemyMap.js), so a PUT that only means to
// change one field never clobbers the rest back to a default. Never imports anything that pulls
// in Prisma/Redis/BullMQ — these are called from plain route handlers that do their own DB
// access, and kept importable from a bare `node --test` run the same way cmoonEnemyMap.js is.

export const MYORBIT_NAME_MAX_LENGTH = 80
export const MYORBIT_FOOTPRINT_MIN = 1
export const MYORBIT_FOOTPRINT_MAX = 10
export const MYORBIT_Z_OFFSET_MIN = -999
export const MYORBIT_Z_OFFSET_MAX = 999

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

// Multipart form fields arrive as strings ("true"/"false"), unlike the JSON bodies
// parseEnemyMapBody validates — this accepts both a real boolean and that string form.
function toBoolean(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

/**
 * `existing` is the current row on an update (undefined on create). Returns
 * `{ ok: true, data }` or `{ ok: false, message }` — `data` never includes `assetPath`, since
 * that is only ever set by the route handler itself once an uploaded file has actually been
 * written (see server/api/admin/myorbit-tiles/*.js).
 */
export function parseMyOrbitTileBody(body, existing) {
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : (typeof body.name === 'string' ? body.name.trim() : '')
  const walkable = toBoolean(body?.walkable, existing ? !!existing.walkable : true)

  if (!name || name.length > MYORBIT_NAME_MAX_LENGTH) {
    return { ok: false, message: `Name is required (max ${MYORBIT_NAME_MAX_LENGTH} characters)` }
  }
  if (walkable === null) return { ok: false, message: 'Walkable must be true or false' }

  return { ok: true, data: { name, walkable } }
}

export function parseMyOrbitFurnitureBody(body, existing) {
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : (typeof body.name === 'string' ? body.name.trim() : '')
  const footprintW = body?.footprintW === undefined
    ? (existing ? existing.footprintW : 1)
    : toNumber(body.footprintW)
  const footprintH = body?.footprintH === undefined
    ? (existing ? existing.footprintH : 1)
    : toNumber(body.footprintH)
  const blocksWalk = toBoolean(body?.blocksWalk, existing ? !!existing.blocksWalk : true)
  const zOffset = body?.zOffset === undefined
    ? (existing ? existing.zOffset : 0)
    : toNumber(body.zOffset)

  if (!name || name.length > MYORBIT_NAME_MAX_LENGTH) {
    return { ok: false, message: `Name is required (max ${MYORBIT_NAME_MAX_LENGTH} characters)` }
  }
  if (!Number.isInteger(footprintW) || footprintW < MYORBIT_FOOTPRINT_MIN || footprintW > MYORBIT_FOOTPRINT_MAX) {
    return { ok: false, message: `Footprint width must be a whole number between ${MYORBIT_FOOTPRINT_MIN} and ${MYORBIT_FOOTPRINT_MAX}` }
  }
  if (!Number.isInteger(footprintH) || footprintH < MYORBIT_FOOTPRINT_MIN || footprintH > MYORBIT_FOOTPRINT_MAX) {
    return { ok: false, message: `Footprint height must be a whole number between ${MYORBIT_FOOTPRINT_MIN} and ${MYORBIT_FOOTPRINT_MAX}` }
  }
  if (blocksWalk === null) return { ok: false, message: 'Blocks walk must be true or false' }
  if (!Number.isInteger(zOffset) || zOffset < MYORBIT_Z_OFFSET_MIN || zOffset > MYORBIT_Z_OFFSET_MAX) {
    return { ok: false, message: `Z-offset must be a whole number between ${MYORBIT_Z_OFFSET_MIN} and ${MYORBIT_Z_OFFSET_MAX}` }
  }

  return { ok: true, data: { name, footprintW, footprintH, blocksWalk, zOffset } }
}
