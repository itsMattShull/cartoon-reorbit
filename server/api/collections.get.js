// server/api/collections.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // fetch user cToons (keep fields your UI uses)
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId: me.id, isTradeable: true },
    include: {
      ctoon: true,
      auctions: { where: { status: 'ACTIVE' }, select: { id: true } }
    }
  })

  // holiday flag for all involved ctoonIds
  const ids = userCtoons.map(uc => uc.ctoonId)
  const holidayRows = ids.length
    ? await prisma.holidayEventItem.findMany({
        where: { ctoonId: { in: ids } },
        select: { ctoonId: true }
      })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  // shape response
  return userCtoons.map(uc => ({
    id: uc.id,
    userId: uc.userId,
    ctoonId: uc.ctoonId,
    assetPath: uc.ctoon.assetPath,
    name: uc.ctoon.name,
    series: uc.ctoon.series,
    rarity: uc.ctoon.rarity,
    set: uc.ctoon.set,
    mintNumber: uc.mintNumber,
    quantity: uc.ctoon.quantity,
    isFirstEdition: uc.isFirstEdition,
    auctions: uc.auctions,                 // you reference uc.auctions.length
    isHolidayItem: holidaySet.has(uc.ctoonId)
  }))
})
