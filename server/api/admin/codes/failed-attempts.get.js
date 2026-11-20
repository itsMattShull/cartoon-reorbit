// server/api/admin/codes/failed-attempts.get.js
//
// Admin Codes → "Failed Attempts" tab: failed POST /api/redeem calls, newest first (written by
// server/utils/redeemAttemptLog.js). Filters: q (username or submitted text), reason.
//
// Raw IPs are not returned. Each row gets an `ipTag`, a short hash of the stored (deterministically
// encrypted) IP, so rows from the same address share a tag without the codes permission exposing
// addresses. The auth logs remain the place to see actual IPs.
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { createHash } from 'node:crypto'
import { prisma } from '@/server/prisma'
import { REDEEM_FAILURE_REASONS } from '@/server/utils/redeemAttemptLog'

const ipTag = (encrypted) => encrypted ? createHash('sha256').update(encrypted).digest('hex').slice(0, 8) : null

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
  const page = Math.max(parseInt(query.page || '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10) || 100, 1), 200)
  const skip = (page - 1) * limit
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const reason = typeof query.reason === 'string' && REDEEM_FAILURE_REASONS.includes(query.reason) ? query.reason : null

  const where = {
    ...(reason ? { reason } : {}),
    ...(q
      ? {
          OR: [
            { codeText: { contains: q, mode: 'insensitive' } },
            { user: { username: { contains: q, mode: 'insensitive' } } }
          ]
        }
      : {})
  }

  const [total, rows] = await Promise.all([
    prisma.redeemAttemptLog.count({ where }),
    prisma.redeemAttemptLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, username: true } },
        code: { select: { code: true, startsAt: true } }
      }
    })
  ])

  const items = rows.map(r => {
    const startsAt = r.code?.startsAt ?? null
    const msBefore = startsAt ? startsAt.getTime() - r.createdAt.getTime() : null
    return {
      id: r.id,
      createdAt: r.createdAt,
      user: r.user,
      codeText: r.codeText,
      matchedCode: r.code?.code ?? null,
      codeStartsAt: startsAt,
      // How long before the code went live this attempt was made (only for attempts before it).
      secsBeforeStart: msBefore != null && msBefore > 0 ? Math.round(msBefore / 100) / 10 : null,
      reason: r.reason,
      statusCode: r.statusCode,
      message: r.message,
      ipTag: ipTag(r.ip),
      userAgent: r.userAgent,
      origin: r.origin,
      referer: r.referer,
      secFetchSite: r.secFetchSite
    }
  })

  return { items, total, page, limit, reasons: REDEEM_FAILURE_REASONS }
})
