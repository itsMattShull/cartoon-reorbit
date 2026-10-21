// server/api/game/oggtoons/player.get.js
// GET /api/game/oggtoons/player?username=…&timeframe=… — one player's deeper OG gToons stats, shown in the
// modal that opens from a Leaderboard row: their human-match record (tournament vs not, how they win,
// most-played decks, recent form) and their practice record by difficulty. Same switch and the same
// rules as the Leaderboard (see ogGtoonBoards.js); cached for an hour per (player, timeframe).
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'
import { cachedJson } from '@/server/utils/cache'
import { CACHE_TTL_SEC, normalizePlayerParams, playerCacheKey, buildPlayerStats } from '@/server/utils/ogGtoonBoards'
import { loadPlayerStats } from '@/server/utils/ogGtoonBoardsSql'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { leaderboardEnabled } = await getOgGtoonsConfig()
  if (!leaderboardEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'The gToons leaderboard is currently unavailable.' })
  }

  const params = normalizePlayerParams(getQuery(event))
  if (!params.username) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  // Looked up before the cache, so a made-up name can never create cache entries.
  const user = await prisma.user.findUnique({ where: { username: params.username }, select: { id: true, username: true } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Player not found' })

  const cached = await cachedJson(playerCacheKey(user.id, params.timeframe), CACHE_TTL_SEC, async () => ({
    generatedAt: new Date().toISOString(),
    raw: await loadPlayerStats(user.id, params.timeframe)
  }))
  return buildPlayerStats(cached.raw, { username: user.username, timeframe: params.timeframe }, cached.generatedAt)
})
