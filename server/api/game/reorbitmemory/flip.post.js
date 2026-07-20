import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { FLIP_SCRIPT, MIN_FLIP_INTERVAL_MS } from '@/server/utils/reorbitMemoryEngine'

const MAX_BODY_BYTES = 1024 // tiny payload — just a card index

function sessionKey(userId) { return `reorbitmemory:session:${userId}` }

const ERROR_STATUS = {
  no_session: [409, 'Game session not found or expired. Start a new game.'],
  bad_index: [400, 'Invalid card index'],
  too_fast: [429, 'Flips submitted too fast'],
  already_matched: [400, 'That card is already matched'],
  already_pending: [400, 'That card is already face up']
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const contentLength = Number(event.node.req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  const index = Number(body?.index)
  if (!Number.isInteger(index) || index < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  // No per-request lock here — FLIP_SCRIPT is a single atomic Lua script (one Redis round
  // trip), so Redis's own single-threaded execution IS the lock. An app-level lock would
  // only add latency to every tap without closing any race the script doesn't already close.
  let raw
  try {
    raw = await redis.eval(FLIP_SCRIPT, 1, sessionKey(userId), String(index), String(MIN_FLIP_INTERVAL_MS))
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }

  let result
  try {
    result = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unexpected game state' })
  }

  if (result.error) {
    const [statusCode, statusMessage] = ERROR_STATUS[result.error] || [400, 'Invalid flip']
    throw createError({ statusCode, statusMessage })
  }

  // Field-limited response — only what this flip revealed, never the rest of the board.
  if (result.firstFlip) {
    return {
      firstFlip: true,
      index: result.index,
      assetPath: result.assetPath,
      moves: result.moves,
      gameOver: false
    }
  }

  return {
    firstFlip: false,
    index: result.index,
    assetPath: result.assetPath,
    firstIndex: result.firstIndex,
    firstAssetPath: result.firstAssetPath,
    matched: result.matched,
    moves: result.moves,
    gameOver: result.gameOver
  }
})
