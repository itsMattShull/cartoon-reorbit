// server/api/game/oggtoons/leaderboard.get.js
// Leaderboards for original gToons (2002), computed on the fly (no persisted rating table, same
// pattern as gToons Clash's leaderboard). Two modes:
//   • human    — players against each other; `filter` = all | non_tournament (default) | tournament
//   • practice — finished matches against the bot; `difficulty` = all | easy | normal | hard
// The per-player aggregate is cached for an hour per (mode, filter/difficulty, timeframe); minGames and
// the top-10 cut are applied per request. The rules behind every number are in ogGtoonBoards.js.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'
import { cachedJson } from '@/server/utils/cache'
import {
  CACHE_TTL_SEC, normalizeLeaderboardParams, leaderboardCacheKey, buildLeaderboard
} from '@/server/utils/ogGtoonBoards'
import { loadHumanLeaderboardRows, loadPracticeLeaderboardRows } from '@/server/utils/ogGtoonBoardsSql'

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

  const params = normalizeLeaderboardParams(getQuery(event))
  const aggregate = await cachedJson(leaderboardCacheKey(params), CACHE_TTL_SEC, async () => ({
    generatedAt: new Date().toISOString(),
    rows: params.mode === 'practice'
      ? await loadPracticeLeaderboardRows(params)
      : await loadHumanLeaderboardRows(params)
  }))
  return buildLeaderboard(aggregate.rows, params, aggregate.generatedAt)
})
