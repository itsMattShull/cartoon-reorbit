// server/utils/upgradesConfigCache.js
// Shared in-memory cache for cMart upgrade config.
// Import this from both upgrades-config.get.js and any route that needs to bust the cache.

export const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export let _cache = null
export let _cacheAt = 0

export function clearUpgradesConfigCache() {
  _cache = null
  _cacheAt = 0
}

export function setUpgradesConfigCache(value) {
  _cache = value
  _cacheAt = Date.now()
}

export function getUpgradesConfigCache() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache
  }
  return null
}
