// server/api/collection/[username].get.js
import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'
import { isLockedCopy, isUnavailableToOthers } from '@/server/utils/lockRules'

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
        include: { ctoon: { include: { cMoon: { select: { id: true, name: true, color: true } } } } }
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

  // Whether the caller is looking at their own collection decides how much of a
  // cToon's state they are allowed to see — see the mapping at the bottom.
  const isSelf = userWithCtoons.id === requesterId

  // The countered offer's cToons are exempt from the lock component of
  // `unavailable` as well as the pending-trade component. A counter re-proposes
  // exactly those copies and assigns them wholesale (see applyPreselectedCtoons
  // in components/newsite/Trade.vue), bypassing the toggle guard — so if the
  // other party locked one of them after making the offer, the mirrored card
  // would render disabled and could never be deselected, leaving the recipient
  // unable to counter at all. The server-side exemption in
  // server/utils/tradeOffer.js is scoped the same way.
  const exemptLockSet = new Set(
    excludeOfferId
      ? (await prisma.tradeOfferCtoon.findMany({
          where: { tradeOfferId: excludeOfferId },
          select: { userCtoonId: true }
        })).map(r => r.userCtoonId)
      : []
  )

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
    cMoon: uc.ctoon.cMoon,
    rarity: uc.ctoon.rarity?.trim() || null,
    isGtoon: uc.ctoon.isGtoon,
    cost: uc.ctoon.cost,
    power: uc.ctoon.power,
    mintNumber: uc.mintNumber,
    quantity: effectiveQuantity,
    isFirstEdition: uc.isFirstEdition,
    isHolidayItem: holidaySet.has(uc.ctoonId),
    // What another user may know about this copy is ONE bit: can it be asked
    // for, yes or no. Reporting locked / in-a-pending-trade / in-an-auction
    // separately would publish locks, because the other two are already
    // knowable — pending-trade state from this very field and auctions from the
    // public auction house — so `unavailable AND NOT the other two` isolates
    // "locked" by subtraction, one cheap read per copy. A lock is the most
    // personally revealing per-copy signal the game has and is inferable nowhere
    // else; the rest of this codebase already refuses to be an oracle for weaker
    // signals (the generic errors in server/utils/tradeOffer.js, the `cz:` tokens
    // in server/api/czone/[username].get.js). Collapsing the three is also what
    // makes the requirement literally true: a lock greys out "as if" it were
    // in a pending trade or an auction.
    // No inAuction term: the query above already filters isTradeable: true, and
    // every path that starts an auction clears that flag in the same statement
    // that creates the auction row (see server/api/auctions.post.js). Joining
    // Auction per row to re-derive something the filter has already excluded
    // would cost a join across the whole collection for nothing.
    unavailable: isUnavailableToOthers({
      inPendingTrade: pendingTradeSet.has(uc.id),
      locked: isLockedCopy(uc) && !exemptLockSet.has(uc.id)
    }),
    // The breakdown is the owner's own business, so it goes out only to them.
    // Trade.vue needs it: on your own side of a trade a lock is not a block
    // at all — it stays selectable and only wears a star — while a pending trade
    // still is.
    ...(isSelf
      ? {
          inPendingTrade: pendingTradeSet.has(uc.id),
          isLocked: isLockedCopy(uc)
        }
      : {}),
    isSecondEdition: uc.ctoon.isSecondEdition,
    secondEditionOverlayX: uc.ctoon.secondEditionOverlayX,
    secondEditionOverlayY: uc.ctoon.secondEditionOverlayY,
    secondEditionOverlaySize: uc.ctoon.secondEditionOverlaySize
    }
  })
})
