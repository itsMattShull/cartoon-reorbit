// server/api/collections.get.js
import { defineEventHandler, getRequestHeader, createError, getQuery } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // query
  const q = getQuery(event)
  const duplicatesOnly = q.duplicatesOnly === '1' || q.duplicatesOnly === 'true'

  // fetch user cToons (keep fields your UI uses)
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId: me.id },
    include: {
      ctoon: true,
      auctions: { where: { status: 'ACTIVE' }, select: { id: true } }
    }
  })

  // If only duplicates requested, filter down to: any cToon the user owns >1 of
  // and exclude the earliest (lowest) mint number for that cToon (based on user's records).
  const filtered = duplicatesOnly
    ? (() => {
        // Count per ctoonId and earliest mint per ctoonId (ignoring null/undefined mints)
        const counts = new Map()
        const earliest = new Map()
        for (const uc of userCtoons) {
          counts.set(uc.ctoonId, (counts.get(uc.ctoonId) || 0) + 1)
          if (typeof uc.mintNumber === 'number') {
            const prev = earliest.get(uc.ctoonId)
            earliest.set(uc.ctoonId, typeof prev === 'number' ? Math.min(prev, uc.mintNumber) : uc.mintNumber)
          }
        }
        return userCtoons.filter(uc => {
          const count = counts.get(uc.ctoonId) || 0
          const minMint = earliest.get(uc.ctoonId)
          // Require more than one owned, a known earliest mint number,
          // and the record's mintNumber must be defined and not equal to the earliest
          if (count <= 1) return false
          if (typeof minMint !== 'number') return false
          if (typeof uc.mintNumber !== 'number') return false
          return uc.mintNumber !== minMint
        })
      })()
    : userCtoons

  // holiday flag for all involved ctoonIds
  const ids = filtered.map(uc => uc.ctoonId)
  const holidayRows = ids.length
    ? await prisma.holidayEventItem.findMany({
        where: { ctoonId: { in: ids } },
        select: { ctoonId: true }
      })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  // shape response
  return filtered.map(uc => ({
    id: uc.id,
    userId: uc.userId,
    ctoonId: uc.ctoonId,
    assetPath: uc.ctoon.assetPath,
    name: uc.ctoon.name,
    series: uc.ctoon.series,
    releaseDate: uc.ctoon.releaseDate,
    price: uc.ctoon.price,
    rarity: uc.ctoon.rarity,
    set: uc.ctoon.set,
    isGtoon: uc.ctoon.isGtoon,
    mintNumber: uc.mintNumber,
    quantity: uc.ctoon.quantity,
    isFirstEdition: uc.isFirstEdition,
    acquiredAt: uc.createdAt,
    auctions: uc.auctions || [],
    isHolidayItem: holidaySet.has(uc.ctoonId)
  }))
})
