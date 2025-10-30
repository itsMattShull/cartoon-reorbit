// server/api/admin/winball-grand-prize.get.js
import { defineEventHandler, getRequestHeader, createError, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'

// — Central formatting without external libs —
const CT_TZ = 'America/Chicago'
const CENTRAL_TZ_LABEL = 'Central Time (US)'
function formatInCentral(date) {
  const d = new Date(date)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).formatToParts(d)
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const { limit = '100' } = getQuery(event) || {}
  const now = new Date()

  const rows = await db.winballGrandPrizeSchedule.findMany({
    where: { startsAt: { gt: now } },            // only future items
    orderBy: { startsAt: 'asc' },                // soonest first
    take: Number(limit),
    include: {
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
    }
  })

  const items = rows.map(r => ({
    id: r.id,
    ctoon: r.ctoon,
    startsAtUtc: r.startsAt,
    startsAtLocal: formatInCentral(r.startsAt)
  }))

  return { timezone: CENTRAL_TZ_LABEL, items }
})