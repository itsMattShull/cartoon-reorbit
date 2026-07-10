// server/utils/activeSaleCache.js
// Short-lived in-memory cache for the currently active cMart Sale, mirroring
// the pattern in upgradesConfigCache.js. Cleared from the admin sale
// create/update/delete routes so changes show up promptly; otherwise expires
// on its own so a sale's start/end boundary is never more than TTL stale.

export const CACHE_TTL_MS = 30 * 1000 // 30 seconds

let _cache = null
let _cacheAt = 0

export function clearActiveSaleCache() {
  _cache = null
  _cacheAt = 0
}

export function setActiveSaleCache(value) {
  _cache = value
  _cacheAt = Date.now()
}

export function getActiveSaleCache() {
  if (_cache !== null && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache
  }
  return undefined
}
