import { defineEventHandler, readBody, createError } from 'h3'
import { DateTime } from 'luxon'
import { mintQueue } from '@/server/utils/queues'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const appearanceId = String(body?.appearanceId || '').trim()
  if (!appearanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Appearance id is required' })
  }

  const appearance = await db.cZoneSearchAppearance.findUnique({
    where: { id: appearanceId },
    include: {
      cZoneSearch: true,
      ctoon: { select: { id: true, name: true, initialQuantity: true, assetPath: true, rarity: true, series: true, set: true } }
    }
  })
  if (!appearance) {
    throw createError({ statusCode: 404, statusMessage: 'Appearance not found' })
  }
  if (appearance.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const search = appearance.cZoneSearch
  if (!search) {
    throw createError({ statusCode: 400, statusMessage: 'Search not found' })
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.cZoneSearchCapture.findUnique({ where: { appearanceId } })
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'Already captured' })
    }

    if (search.collectionType === 'ONCE') {
      const prior = await tx.cZoneSearchCapture.findFirst({
        where: {
          userId,
          cZoneSearchId: search.id,
          ctoonId: appearance.ctoonId
        }
      })
      if (prior) {
        throw createError({ statusCode: 409, statusMessage: 'You already collected this cToon from this search' })
      }
    }

    if (search.collectionType === 'CUSTOM_PER_CTOON') {
      const prizeRow = await tx.cZoneSearchPrize.findFirst({
        where: {
          cZoneSearchId: search.id,
          ctoonId: appearance.ctoonId
        },
        select: { maxCaptures: true }
      })
      const maxCaptures = Number(prizeRow?.maxCaptures ?? 0)
      if (maxCaptures > 0) {
        const priorCount = await tx.cZoneSearchCapture.count({
          where: {
            userId,
            cZoneSearchId: search.id,
            ctoonId: appearance.ctoonId
          }
        })
        if (priorCount >= maxCaptures) {
          throw createError({ statusCode: 409, statusMessage: 'Max captures reached for this cToon' })
        }
      }
    }

    const resetType = search.resetType || 'COOLDOWN_HOURS'
    if (resetType === 'DAILY_AT_RESET') {
      const dailyLimit = Number(search.dailyCollectLimit ?? 0)
      if (dailyLimit > 0) {
        const chicagoNow = DateTime.now().setZone('America/Chicago')
        let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
        if (chicagoNow < boundaryLocal) {
          boundaryLocal = boundaryLocal.minus({ days: 1 })
        }
        const boundaryUtc = boundaryLocal.toUTC().toJSDate()
        const dailyCount = await tx.cZoneSearchCapture.count({
          where: {
            userId,
            cZoneSearchId: search.id,
            createdAt: { gte: boundaryUtc }
          }
        })
        if (dailyCount >= dailyLimit) {
          throw createError({ statusCode: 409, statusMessage: 'Daily cZone Search limit reached' })
        }
      }
    }

    await tx.cZoneSearchCapture.create({
      data: {
        appearanceId,
        cZoneSearchId: search.id,
        userId,
        ctoonId: appearance.ctoonId
      }
    })
  })

  const count = await db.userCtoon.count({ where: { ctoonId: appearance.ctoonId } })
  const mintNumber = count + 1
  const initialQuantity = appearance.ctoon.initialQuantity ?? 0
  const isFirstEdition = initialQuantity > 0 ? mintNumber <= initialQuantity : false

  await mintQueue.add('mintCtoon', { userId, ctoonId: appearance.ctoonId, isSpecial: true })

  return {
    ctoon: {
      id: appearance.ctoon.id,
      name: appearance.ctoon.name,
      assetPath: appearance.ctoon.assetPath,
      rarity: appearance.ctoon.rarity,
      series: appearance.ctoon.series,
      set: appearance.ctoon.set,
      mintNumber,
      isFirstEdition
    }
  }
})
