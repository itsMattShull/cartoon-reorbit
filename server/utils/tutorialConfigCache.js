// server/utils/tutorialConfigCache.js
// Shared in-memory cache for the tutorial page config — content edited a
// handful of times a year, read on every page view.
// Import this from both tutorial/index.get.js and any route that needs to bust it.

export const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

let _cache = null
let _cacheAt = 0

export function clearTutorialConfigCache() {
  _cache = null
  _cacheAt = 0
}

export function setTutorialConfigCache(value) {
  _cache = value
  _cacheAt = Date.now()
}

export function getTutorialConfigCache() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache
  }
  return null
}
