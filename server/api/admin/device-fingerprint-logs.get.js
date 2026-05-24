// server/api/admin/device-fingerprint-logs.get.js
// Admin-only paginated listing of DeviceFingerprintLog rows joined with
// the user (for username + discordId display in AdminDeviceFingerprintLogs).
//
// Query params:
//   page=N        (1-indexed; default 1)
//   limit=N       (1..200; default 100)
//   username=...  (case-insensitive substring match on User.username)
//   visitorId=... (exact match — useful for clicking a row to "show all
//                  accounts that share this fingerprint")
//   ip=...        (exact match)

import {
  defineEventHandler,
  getRequestHeader,
  getQuery,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

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

  const username  = String(query.username  || '').trim()
  const visitorId = String(query.visitorId || '').trim()
  const ip        = String(query.ip        || '').trim()

  const where = {}
  if (username) {
    where.user = { username: { contains: username, mode: 'insensitive' } }
  }
  if (visitorId) where.visitorId = visitorId
  if (ip) where.ip = ip

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

  return { items, total, page, limit }
})
