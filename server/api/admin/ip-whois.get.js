// Batch WHOIS / IP-geo lookups via ip-api.com (no API key, free tier:
// 45 req/min per origin, batch endpoint takes up to 100 IPs per call).
// 24h in-memory cache keyed by IP keeps repeat loads cheap.

import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'

const cache = new Map() // ip -> { data, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  // Admin auth (mirrors other /api/admin/* endpoints)
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const query = getQuery(event)
  const ipsParam = String(query.ips || '').trim()
  if (!ipsParam) return {}

  const unique = Array.from(new Set(
    ipsParam.split(',').map(s => s.trim()).filter(Boolean)
  ))

  const now = Date.now()
  const result = {}
  const toFetch = []

  for (const ip of unique) {
    const cached = cache.get(ip)
    if (cached && cached.expiresAt > now) {
      result[ip] = cached.data
    } else {
      toFetch.push(ip)
    }
  }

  if (toFetch.length) {
    const fields = 'status,message,query,country,regionName,city,isp,org'
    const BATCH = 100

    for (let i = 0; i < toFetch.length; i += BATCH) {
      const chunk = toFetch.slice(i, i + BATCH)
      try {
        const res = await $fetch('http://ip-api.com/batch', {
          method: 'POST',
          query: { fields },
          body: chunk
        })

        for (const entry of (Array.isArray(res) ? res : [])) {
          const ip = entry.query
          const data = entry.status === 'success'
            ? {
                country: entry.country || null,
                region: entry.regionName || null,
                city: entry.city || null,
                isp: entry.isp || null,
                org: entry.org || null
              }
            : { error: entry.message || 'lookup failed' }
          cache.set(ip, { data, expiresAt: now + CACHE_TTL_MS })
          result[ip] = data
        }
      } catch (e) {
        // network / rate limit failure — return error markers for this chunk
        // without caching, so a subsequent reload can retry.
        for (const ip of chunk) {
          if (!result[ip]) result[ip] = { error: 'lookup failed' }
        }
      }
    }
  }

  return result
})
