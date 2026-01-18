// server/api/collection/[username].get.js
import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { username } = event.context.params
  const { filter } = getQuery(event)

  const userWithCtoons = await prisma.user.findUnique({
    where: { username },
    include: {
      ctoons: {
        where: {
          isTradeable: true,
          ...(filter === 'gtoon' ? { ctoon: { isGtoon: true } } : {})
        },
        include: { ctoon: true }
      }
    }
  })
  if (!userWithCtoons) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const ids = userWithCtoons.ctoons.map(uc => uc.ctoonId)
  const holidayRows = ids.length
    ? await prisma.holidayEventItem.findMany({ where: { ctoonId: { in: ids } }, select: { ctoonId: true } })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  // SORT: by uc.ctoon.name (A–Z, case-insensitive), then uc.ctoonId, then uc.mintNumber (nulls last)
  const rows = userWithCtoons.ctoons.slice().sort((a, b) => {
    const nameA = a.ctoon?.name ?? ''
    const nameB = b.ctoon?.name ?? ''
    const byName = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
    if (byName) return byName

    const byId = (a.ctoonId ?? '').localeCompare(b.ctoonId ?? '')
    if (byId) return byId

    const mA = a.mintNumber ?? Number.POSITIVE_INFINITY
    const mB = b.mintNumber ?? Number.POSITIVE_INFINITY
    return mA - mB
  })

  return rows.map(uc => ({
    id: uc.id,
    ctoonId: uc.ctoonId,
    assetPath: uc.ctoon.assetPath,
    name: uc.ctoon.name,
    series: uc.ctoon.series?.trim() || null,
    set: uc.ctoon.set?.trim() || null,
    rarity: uc.ctoon.rarity?.trim() || null,
    isGtoon: uc.ctoon.isGtoon,
    cost: uc.ctoon.cost,
    power: uc.ctoon.power,
    mintNumber: uc.mintNumber,
    quantity: uc.ctoon.quantity,
    isFirstEdition: uc.isFirstEdition,
    isHolidayItem: holidaySet.has(uc.ctoonId)
  }))
})
