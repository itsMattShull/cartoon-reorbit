// server/api/admin/device-fingerprint-logs.get.js
// Admin-only paginated listing of DeviceFingerprintLog rows joined with
// the user (for username + discordId display in AdminDeviceFingerprintLogs).
//
// Query params:
//   page=N             (1-indexed; default 1)
//   limit=N            (1..200; default 100)
//   username=...       (case-insensitive substring match on User.username)
//   visitorId=...      (exact match — useful for clicking a row to "show all
//                       accounts that share this fingerprint")
//   ip=...             (exact match)
//   duplicatesOnly=1   (restrict to visitorIds that appear more than once)

import {
  defineEventHandler,
  getRequestHeader,
  getQuery,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import { encryptIp, decryptIp } from '@/server/utils/ip-encrypt'

export default defineEventHandler(async (event) => {
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
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit

  const username      = String(query.username      || '').trim()
  const visitorId     = String(query.visitorId     || '').trim()
  const ip            = String(query.ip            || '').trim()
  const duplicatesOnly = query.duplicatesOnly === '1' || query.duplicatesOnly === 'true'

  const where = {}
  if (username) {
    where.user = { username: { contains: username, mode: 'insensitive' } }
  }
  if (visitorId) where.visitorId = visitorId
  // ip filter: accept the encrypted hex the admin sees on screen, or a
  // plaintext address (auto-encrypt for convenience).
  if (ip) {
    const looksEncrypted = /^[0-9a-f]{32,}$/i.test(ip)
    where.ip = looksEncrypted ? ip : encryptIp(ip)
  }

  // If duplicatesOnly, restrict to visitorIds that appear more than once
  if (duplicatesOnly) {
    const dupeGroups = await prisma.deviceFingerprintLog.groupBy({
      by: ['visitorId'],
      _count: { visitorId: true },
      having: { visitorId: { _count: { gt: 1 } } }
    })
    const dupeIds = dupeGroups.map(r => r.visitorId)
    if (dupeIds.length === 0) {
      return { items: [], total: 0, page, limit }
    }
    if (where.visitorId) {
      // Keep exact filter only if it's among the duplicates
      if (!dupeIds.includes(where.visitorId)) {
        return { items: [], total: 0, page, limit }
      }
      // else the existing exact filter already narrows it enough
    } else {
      where.visitorId = { in: dupeIds }
    }
  }

  const [items, total] = await Promise.all([
    prisma.deviceFingerprintLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discordId: true,
            discordUsername: true,
            discordTag: true
          }
        }
      }
    }),
    prisma.deviceFingerprintLog.count({ where })
  ])

  return {
    items: items.map(item => ({ ...item, ip: decryptIp(item.ip) })),
    total,
    page,
    limit
  }
})
