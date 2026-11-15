// Pure movement-engine logic for MyOrbit: builds a room's walkable-cell set from its persisted
// layout, and finds a path across it. No Prisma/Redis/socket.io imports — this file is also
// usable from a bare `node --test` run and is the one place both the live socket runtime
// (server/utils/myOrbitSocket.js) and anything else that needs "can X reach Y" go to answer it,
// so the walkable-mask rules never drift between them.
//
// Relative import, NOT the `@/` alias: this module runs inside server/socket-server.js, a plain
// `node server/socket-server.js` process that cannot resolve Nuxt/Vite's `@/` alias (see the
// import-rules header comment in server/utils/notifications.js for the same constraint).
import { effectiveFootprint } from '../../utils/myOrbitIsometric.js'

/**
 * Builds the set of walkable "x,y" cells for a room from its painted tiles and placed
 * furniture. `tiles` is `[{x, y, walkable}, ...]` (the room's MyOrbitRoomTile rows, joined with
 * their MyOrbitTile's own `walkable` flag — see server/api/admin/myorbit-rooms/[id].get.js's
 * response shape). `furniture` is `[{x, y, rotation, footprintW, footprintH, blocksWalk}, ...]`
 * (same response shape's `furniture` array — footprintW/footprintH are the library item's own
 * UNROTATED values). A cell is walkable iff it has a walkable tile AND no furniture footprint
 * covering it has blocksWalk=true — exactly MyOrbitFurniture.blocksWalk's own "can only ADD a
 * block, never remove one" contract (see that model's schema comment).
 */
export function buildWalkableSet(tiles, furniture) {
  const walkable = new Set()
  for (const t of tiles || []) {
    if (t.walkable) walkable.add(`${t.x},${t.y}`)
  }
  for (const f of furniture || []) {
    if (!f.blocksWalk) continue
    const { width, height } = effectiveFootprint(f.footprintW, f.footprintH, f.rotation)
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        walkable.delete(`${f.x + dx},${f.y + dy}`)
      }
    }
  }
  return walkable
}

// 8-directional grid movement (a player can step onto any of their cell's neighbors, including
// diagonals) — this is what actually gives an isometric room the "walk freely" feel, since a
// screen-diagonal-looking step is a single-axis grid move and a screen-horizontal/vertical-
// looking step is a diagonal grid move. Diagonal cost is sqrt(2), matching true distance, so the
// heuristic below (octile distance) stays admissible.
const DIRECTIONS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
]

function octileHeuristic(a, b) {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
}

/**
 * A* over `walkable` (a Set of "x,y" strings, e.g. from buildWalkableSet above) within a
 * gridWidth x gridHeight grid. Returns the path as an array of `{x, y}` waypoints INCLUDING both
 * `start` and `end`, or `null` if `end` is unwalkable / unreachable / outside the grid, or the
 * search exceeds `maxVisited` (a safety cap — irrelevant for any room this feature's own admin
 * builder can create, capped at 30x30=900 cells, but cheap insurance against a future much
 * larger grid). A diagonal step is refused when it would cut through a blocked corner (both
 * orthogonal neighbors of that diagonal must themselves be walkable), the same rule most grid
 * games use to stop a mover clipping through a wall corner-to-corner.
 */
export function findPath(walkable, gridWidth, gridHeight, start, end, maxVisited = 2000) {
  const key = (x, y) => `${x},${y}`
  const endKey = key(end.x, end.y)
  const startKey = key(start.x, start.y)
  if (end.x < 0 || end.y < 0 || end.x >= gridWidth || end.y >= gridHeight) return null
  if (!walkable.has(endKey) || !walkable.has(startKey)) return null
  if (startKey === endKey) return [{ x: start.x, y: start.y }]

  const gScore = new Map([[startKey, 0]])
  const fScore = new Map([[startKey, octileHeuristic(start, end)]])
  const cameFrom = new Map()
  const open = new Set([startKey])
  const closed = new Set()

  let visited = 0
  while (open.size && visited < maxVisited) {
    let currentKey = null
    let currentF = Infinity
    for (const k of open) {
      const f = fScore.get(k)
      if (f < currentF) { currentF = f; currentKey = k }
    }
    open.delete(currentKey)
    closed.add(currentKey)
    visited++

    if (currentKey === endKey) {
      const path = []
      let k = currentKey
      while (k !== undefined) {
        const [x, y] = k.split(',').map(Number)
        path.unshift({ x, y })
        k = cameFrom.get(k)
      }
      return path
    }

    const [cx, cy] = currentKey.split(',').map(Number)
    const currentG = gScore.get(currentKey)
    for (const [dx, dy, cost] of DIRECTIONS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue
      const nKey = key(nx, ny)
      if (closed.has(nKey) || !walkable.has(nKey)) continue
      if (dx !== 0 && dy !== 0) {
        if (!walkable.has(key(cx + dx, cy)) || !walkable.has(key(cx, cy + dy))) continue
      }
      const tentativeG = currentG + cost
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey)
        gScore.set(nKey, tentativeG)
        fScore.set(nKey, tentativeG + octileHeuristic({ x: nx, y: ny }, end))
        open.add(nKey)
      }
    }
  }
  return null
}

/** The first walkable cell found, scanning in (y, then x) order — used to place a newly-joined
 * player somewhere valid without needing a dedicated "spawn point" concept on MyOrbitRoom.
 * Returns null if the room has no walkable cells at all (e.g. nothing painted yet). */
export function firstWalkableCell(walkable, gridWidth, gridHeight) {
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (walkable.has(`${x},${y}`)) return { x, y }
    }
  }
  return null
}
