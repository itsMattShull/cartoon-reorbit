// server/api/admin/winball-grand-prize.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

// Parse "YYYY-MM-DD HH:mm" -> { y,m,d,h,mi }
function parseLocalYmdHm(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

// Convert local Central wall time to a UTC Date
function centralLocalToUTC(localYmdHm) {
  const parts = parseLocalYmdHm(localYmdHm)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'startsAtLocal must be "YYYY-MM-DD HH:mm"' })

  const { y, m, d, h, mi } = parts
  // Initial UTC guess: treat components as if they were UTC
  const utcGuessMs = Date.UTC(y, m - 1, d, h, mi, 0)

  // What would that instant display as in America/Chicago?
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const displayed = Object.fromEntries(
    fmt.formatToParts(new Date(utcGuessMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(
    Number(displayed.year),
    Number(displayed.month) - 1,
    Number(displayed.day),
    Number(displayed.hour),
    Number(displayed.minute),
    Number(displayed.second)
  )

  // Offset between our guess and the zonal rendering
  const offsetMs = zonalMs - utcGuessMs
  // Correct guess so that rendered Central time matches the provided wall time
  return new Date(utcGuessMs - offsetMs)
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const { ctoonId, startsAtLocal } = await readBody(event)
  if (!ctoonId || typeof ctoonId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "ctoonId"' })
  }
  if (!startsAtLocal || typeof startsAtLocal !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "startsAtLocal"' })
  }

  // Validate cToon exists
  const exists = await db.ctoon.findUnique({ where: { id: ctoonId }, select: { id: true } })
  if (!exists) throw createError({ statusCode: 400, statusMessage: 'cToon not found' })

  // Interpret provided wall time as America/Chicago
  const startsAtUtc = centralLocalToUTC(startsAtLocal)

  const row = await db.winballGrandPrizeSchedule.create({
    data: { ctoonId, startsAt: startsAtUtc, createdById: me.id },
    include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
  })

  return { ok: true, item: row }
})
