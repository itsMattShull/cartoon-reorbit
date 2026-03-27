import { defineEventHandler, getQuery, getRequestHeader, createError, setResponseHeader } from 'h3'
import { prisma as db } from '@/server/prisma'

function clampDays(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 30
  return Math.max(1, Math.min(365, Math.floor(num)))
}

function toCSTString(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function escapeCsv(value) {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

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

  const q = getQuery(event)
  const days = clampDays(q.days)
  const searchId = typeof q.searchId === 'string' ? q.searchId : ''
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 3600 * 1000)

  const appearances = await db.cZoneSearchAppearance.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(searchId ? { cZoneSearchId: searchId } : {})
    },
    select: {
      createdAt: true,
      user: { select: { username: true } },
      capture: { select: { id: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  const rows = [['datetime_cst', 'username', 'appearance', 'captured']]
  for (const a of appearances) {
    rows.push([
      escapeCsv(toCSTString(a.createdAt)),
      escapeCsv(a.user?.username ?? ''),
      '1',
      a.capture ? '1' : '0'
    ])
  }

  const csv = rows.map((r) => r.join(',')).join('\r\n')

  setResponseHeader(event, 'Content-Type', 'text/csv')
  setResponseHeader(event, 'Content-Disposition', 'attachment; filename="czone-search-logs.csv"')

  return csv
})
