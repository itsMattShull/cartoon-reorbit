// Shared isometric projection math for MyOrbit rooms — built ONCE here so the admin room
// builder (components/newsite/AdminMyOrbitRoomBuilder.vue) and the player-facing room renderer
// (a later phase) can never drift apart on how a (col, row) grid cell maps to screen pixels.
// Plain JS, no Vue/Nuxt imports, so it's usable from either component and from a bare
// `node --test` run.
//
// Standard 2:1 diamond projection: each tile is twice as wide as it is tall on screen.
export const TILE_WIDTH = 64
export const TILE_HEIGHT = 32

// Z-index layers, in back-to-front render order. Multiplied into depthIndex() below so cells at
// the same (col+row) depth always stack floor < furniture < avatar regardless of grid size.
export const MYORBIT_LAYER = Object.freeze({ FLOOR: 0, FURNITURE: 1, AVATAR: 2 })
const LAYER_COUNT = Object.keys(MYORBIT_LAYER).length

/**
 * Top-left CSS position (in an UNOFFSET coordinate space - see gridStageSize/tileScreenPosition
 * below for the version actually safe to render with) of the tile at (col, row). Both
 * coordinates can legitimately end up negative before offsetting: the top-right corner of a
 * grid (row 0, the far column) projects to a negative screenY-free but positive-only x in some
 * orientations depending on grid shape, which is exactly why every renderer must go through
 * gridStageSize's offsetX/offsetY rather than calling this directly.
 */
function rawTileOrigin(col, row) {
  return {
    x: (col - row) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2)
  }
}

/**
 * The full pixel size of a gridWidth x gridHeight room's stage, plus the (offsetX, offsetY)
 * every tile position must be shifted by so the whole grid renders at non-negative coordinates
 * inside a container of exactly this size. Call once per room (grid size rarely changes while
 * painting) and reuse for every tile/furniture/avatar position in that room.
 */
export function gridStageSize(gridWidth, gridHeight) {
  const w = Math.max(1, gridWidth | 0)
  const h = Math.max(1, gridHeight | 0)
  // The four grid corners are where the projection's x/y extremes occur - no need to scan every
  // cell.
  const corners = [
    rawTileOrigin(0, 0),
    rawTileOrigin(w - 1, 0),
    rawTileOrigin(0, h - 1),
    rawTileOrigin(w - 1, h - 1)
  ]
  const minX = Math.min(...corners.map(c => c.x))
  const maxX = Math.max(...corners.map(c => c.x))
  const minY = Math.min(...corners.map(c => c.y))
  const maxY = Math.max(...corners.map(c => c.y))
  return {
    // `|| 0` normalizes a possible -0 (e.g. when minX/minY is already 0) to plain 0 - harmless
    // either way numerically, but keeps debug output/serialization unsurprising.
    offsetX: -minX || 0,
    offsetY: -minY || 0,
    // + TILE_WIDTH/HEIGHT: every corner above is a tile's own top-left origin, not its
    // rendered extent - the stage must also fit that last tile's own width/height.
    width: (maxX - minX) + TILE_WIDTH,
    height: (maxY - minY) + TILE_HEIGHT
  }
}

/** The actual CSS { left, top } (in px, unrounded) to render a tile/furniture/avatar element
 * anchored at grid cell (col, row), given the room's own gridStageSize() result. */
export function tileScreenPosition(col, row, stage) {
  const raw = rawTileOrigin(col, row)
  return { left: raw.x + stage.offsetX, top: raw.y + stage.offsetY }
}

/**
 * Stacking order for an element covering a footprint anchored at (col, row) with the given
 * (already rotation-adjusted - see effectiveFootprint below) width/height, in the given layer.
 * Uses the footprint's bottom-right-most cell (col + w - 1, row + h - 1): in this projection
 * that is the cell closest to the viewer, so a piece anchored there occludes whatever is
 * "behind" it (smaller col+row) exactly the way an isometric room should, independent of its
 * own footprint size. Multiplying by LAYER_COUNT and adding the layer index keeps every layer's
 * ordering interleaved per-depth rather than all floors first then all furniture - without that,
 * a tall piece of furniture at depth 5 would wrongly render behind a floor tile at depth 6.
 */
export function depthIndex(col, row, width, height, layer) {
  const frontCol = col + Math.max(1, width) - 1
  const frontRow = row + Math.max(1, height) - 1
  return (frontCol + frontRow) * LAYER_COUNT + layer
}

/**
 * A furniture piece's EFFECTIVE blocked/rendered footprint once its rotation is applied —
 * 90/270 swap width and height (see MyOrbitRoomFurniture.rotation's own schema comment: this is
 * the one function that implements that contract, so the admin builder, the player renderer, and
 * a later phase's pathfinder all read it identically). `footprintW`/`footprintH` are the
 * library item's own UNROTATED values (MyOrbitFurniture); `rotation` is 0/90/180/270.
 */
export function effectiveFootprint(footprintW, footprintH, rotation) {
  const normalized = ((rotation % 360) + 360) % 360
  return normalized === 90 || normalized === 270
    ? { width: footprintH, height: footprintW }
    : { width: footprintW, height: footprintH }
}

/** True if every cell of a footprint anchored at (x, y) with the given width/height fits inside
 * a gridWidth x gridHeight grid (0 <= x, 0 <= y, and the far edge doesn't overrun). */
export function footprintFitsGrid(x, y, width, height, gridWidth, gridHeight) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 &&
    x + width <= gridWidth && y + height <= gridHeight
}

/** True if two footprints (each { x, y, width, height }) overlap any cell. */
export function footprintsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height
}
