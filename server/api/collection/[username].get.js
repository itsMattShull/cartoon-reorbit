// server/api/collection/[username].get.js
import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { username } = event.context.params
  const { filter, excludeTradeOfferId } = getQuery(event)

  // When building a counter to an offer, that offer's cToons are exactly the
  // ones being re-proposed, so they must not come back flagged inPendingTrade —
  // the UI greys those out and refuses to let them be deselected, which would
  // make the counter uneditable. Scoped to a single offer id: cToons committed
  // to any *other* pending trade are still flagged.
  // Honoured only for an offer the requester is actually party to. The flag is
  // display-only (the counter endpoint re-derives its own exemption), but an
  // unchecked id would let anyone probe whether a given cToon sits in a
  // specific pending trade.
  let excludeOfferId = null
  if (typeof excludeTradeOfferId === 'string' && excludeTradeOfferId) {
    const party = await prisma.tradeOffer.findFirst({
      where: {
        id: excludeTradeOfferId,
        OR: [{ initiatorId: requesterId }, { recipientId: requesterId }]
      },
      select: { id: true }
    })
    excludeOfferId = party?.id ?? null
  }

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

  const userCtoonIds = userWithCtoons.ctoons.map(uc => uc.id)
  // De-duplicated: a user owning many copies of the same cToon would otherwise
  // send an IN-list the size of their whole collection, most of it repeats.
  const ids = [...new Set(userWithCtoons.ctoons.map(uc => uc.ctoonId))]
  const holidayRows = ids.length
    ? await prisma.holidayEventItem.findMany({ where: { ctoonId: { in: ids } }, select: { ctoonId: true } })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  const pendingTradeRows = userCtoonIds.length
    ? await prisma.tradeOfferCtoon.findMany({
        where: {
          userCtoonId: { in: userCtoonIds },
          tradeOffer: {
            status: 'PENDING',
            ...(excludeOfferId ? { id: { not: excludeOfferId } } : {})
          }
        },
        select: { userCtoonId: true }
      })
    : []
  const pendingTradeSet = new Set(pendingTradeRows.map(r => r.userCtoonId))

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

  const TIME_BASED_CAP = 999999999
  const now = new Date()

  return rows.map(uc => {
    // If a time-based cToon's mint window has closed but the finalization job
    // hasn't written the real quantity yet (sentinel still in place), substitute
    // totalMinted so the collection displays the actual count instead of "???".
    const effectiveQuantity = (
      uc.ctoon.mintLimitType === 'timeBased' &&
      uc.ctoon.mintEndDate &&
      new Date(uc.ctoon.mintEndDate) <= now &&
      uc.ctoon.quantity === TIME_BASED_CAP
    ) ? uc.ctoon.totalMinted : uc.ctoon.quantity

    return {
    id: encodeUserCtoonId(uc.userId, uc.ctoonId, uc.mintNumber),
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
    quantity: effectiveQuantity,
    isFirstEdition: uc.isFirstEdition,
    isHolidayItem: holidaySet.has(uc.ctoonId),
    inPendingTrade: pendingTradeSet.has(uc.id),
    isSecondEdition: uc.ctoon.isSecondEdition,
    secondEditionOverlayX: uc.ctoon.secondEditionOverlayX,
    secondEditionOverlayY: uc.ctoon.secondEditionOverlayY,
    secondEditionOverlaySize: uc.ctoon.secondEditionOverlaySize
    }
  })
})
