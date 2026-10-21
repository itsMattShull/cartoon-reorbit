// server/api/game/oggtoons/meta.get.js
// The OG gToons Meta tab: which decks and which gToons are winning, for human-vs-human games only
// (practice is never stored with decks, so it cannot appear here). Same shape of page as gToons
// Clash's Meta, but aggregated in SQL — see ogGtoonBoardsSql.js — and cached for an hour per
// (days, filter); sort / minGames / limit are applied per request. Rules: ogGtoonBoards.js.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'
import { cachedJson } from '@/server/utils/cache'
import { CACHE_TTL_SEC, normalizeMetaParams, metaCacheKey, buildMetaResponse } from '@/server/utils/ogGtoonBoards'
import { loadMetaAggregate } from '@/server/utils/ogGtoonBoardsSql'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Meta rides on the Leaderboard switch: it is the same standings data, just by deck.
  const { leaderboardEnabled } = await getOgGtoonsConfig()
  if (!leaderboardEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'The gToons leaderboard is currently unavailable.' })
  }

  const params = normalizeMetaParams(getQuery(event))
  const aggregate = await cachedJson(metaCacheKey(params), CACHE_TTL_SEC, () => loadMetaAggregate(params))
  return buildMetaResponse(aggregate, params)
})
