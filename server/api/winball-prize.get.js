// server/api/winball-prize.get.js
import { defineEventHandler, createError, getRequestURL, setResponseHeader } from 'h3'
import { prisma as db } from '@/server/prisma'

function toAbsoluteUrl(event, path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path

  const url = getRequestURL(event)
  const cfgBase = useRuntimeConfig(event)?.public?.cdnBase || url.origin

  let base = cfgBase
  try {
    const u = new URL(cfgBase)
    const isLocal =
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '::1'
    if (isLocal) base = `${u.protocol}//localhost:3000`
  } catch {
    // if cfgBase isn't a full URL, fall back to request origin
    base = url.origin.includes('localhost') ? 'http://localhost:3000' : url.origin
  }

  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

export default defineEventHandler(async (event) => {
  const now = new Date()

  // 0) Optional admin override via GameConfig
  const cfg = await db.gameConfig.findUnique({
    where: { gameName: 'Winball' },
    select: { grandPrizeCtoonId: true }
  })

  let source = 'schedule-current'
  let ctoon = null
  let sched = null

  if (cfg?.grandPrizeCtoonId) {
    ctoon = await db.ctoon.findUnique({
      where: { id: cfg.grandPrizeCtoonId },
      select: { id: true, name: true, rarity: true, assetPath: true }
    })
    source = 'override'
  }

  // 1) If no override, use current schedule (latest startsAt <= now)
  if (!ctoon) {
    sched = await db.winballGrandPrizeSchedule.findFirst({
      where: { startsAt: { lte: now } },
      orderBy: { startsAt: 'desc' },
      include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
    })
    ctoon = sched?.ctoon || null
  }

  // 2) If none active, fall back to next upcoming
  if (!ctoon) {
    sched = await db.winballGrandPrizeSchedule.findFirst({
      where: { startsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
    })
    ctoon = sched?.ctoon || null
    source = 'schedule-next'
  }

  if (!ctoon) {
    throw createError({ statusCode: 404, statusMessage: 'No prize available' })
  }

  const imageUrl = toAbsoluteUrl(event, ctoon.assetPath)

  // Low-lift caching
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120')

  return {
    prize: {
      source,                     // 'override' | 'schedule-current' | 'schedule-next'
      id: sched?.id || null,
      startsAt: sched?.startsAt || null,
      ctoon: {
        id: ctoon.id,
        name: ctoon.name,
        rarity: ctoon.rarity,
        imageUrl
      }
    }
  }
})
