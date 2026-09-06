// server/api/collections.get.js
import { defineEventHandler, getRequestHeader, createError, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { isLockedCopy } from '@/server/utils/lockRules'
import { ensureEconomyDataFresh } from '@/server/utils/economyFreshness'
import { getDailyReferenceValues, MIN_SAMPLE_SIZE, MAX_WORTH_CTOON_TYPES } from '@/server/utils/collectionWorth'

export default defineEventHandler(async (event) => {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // query
  // NOTE: these are the LEGACY duplicate semantics used by pages/collection.vue —
  // the earliest mint of each group is dropped. The newsite My Collection filter
  // keeps every copy instead; see utils/duplicateCtoonIds.js. Same word, different
  // rule, so don't wire this param up to the newsite UI without converting.
  const q = getQuery(event)
  const duplicatesOnly = q.duplicatesOnly === '1' || q.duplicatesOnly === 'true'

  // fetch user cToons (keep fields your UI uses)
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId: me.id },
    include: {
      ctoon: { include: { cMoon: { select: { id: true, name: true, color: true } } } },
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
  // De-duped: collectors holding many copies otherwise send the same ctoonId
  // into the IN list once per copy.
  const ids = [...new Set(filtered.map(uc => uc.ctoonId))]
  const holidayRows = ids.length
    ? await prisma.holidayEventItem.findMany({
        where: { ctoonId: { in: ids } },
        select: { ctoonId: true }
      })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  // Sort-by-Price on My Collection uses the same "avg auction sale, falling
  // back to cMart/face price on a thin sample" metric as the page's Worth
  // badge (server/utils/collectionWorth.js) instead of the flat cMart price
  // alone -- one collector could otherwise sit far outside auction reality
  // (a rare cToon worth 50,000 pts at auction but listed at cMart for 500).
  // Skipped past MAX_WORTH_CTOON_TYPES distinct ctoonIds for the same reason
  // worth.get.js caps there: bounds the IN-list against a pathological
  // collection rather than a realistic one.
  const auctionRefs = (ids.length && ids.length <= MAX_WORTH_CTOON_TYPES)
    ? await (async () => {
        await ensureEconomyDataFresh()
        return (await getDailyReferenceValues(ids)).auction
      })()
    : new Map()

  // acquired date for the CURRENT owner
  // UserCtoon.createdAt is set once, when that row is first minted, and every
  // ownership-transfer path (auction win, trade, wishlist accept, dissolve
  // reassignment, ...) updates userId in place without touching it — so for a
  // copy that changed hands, createdAt reflects whoever originally minted it,
  // not when the current owner got it. CtoonOwnerLog gets a fresh row on every
  // transfer (mint.worker.js and each transfer site all write one), so the
  // latest log row for this user+copy is the real acquisition date; fall back
  // to createdAt for rows with no matching log (shouldn't normally happen, but
  // cheaper than failing the whole page over it).
  const userCtoonIds = filtered.map(uc => uc.id)
  const ownerLogRows = userCtoonIds.length
    ? await prisma.ctoonOwnerLog.findMany({
        where: { userCtoonId: { in: userCtoonIds }, userId: me.id },
        select: { userCtoonId: true, createdAt: true }
      })
    : []
  const latestAcquiredAt = new Map()
  for (const row of ownerLogRows) {
    const prev = latestAcquiredAt.get(row.userCtoonId)
    if (!prev || row.createdAt > prev) latestAcquiredAt.set(row.userCtoonId, row.createdAt)
  }

  // shape response
  const TIME_BASED_CAP = 999999999
  const now = new Date()

  return filtered.map(uc => {
    // If a time-based cToon's mint window has closed but the finalization job
    // hasn't written the real quantity yet (sentinel still in place), substitute
    // totalMinted so the collection displays the actual count instead of "???".
    const effectiveQuantity = (
      uc.ctoon.mintLimitType === 'timeBased' &&
      uc.ctoon.mintEndDate &&
      new Date(uc.ctoon.mintEndDate) <= now &&
      uc.ctoon.quantity === TIME_BASED_CAP
    ) ? uc.ctoon.totalMinted : uc.ctoon.quantity

    // Same fallback rule as computeCollectionWorth: only trust the auction
    // average once it has enough sales behind it, otherwise fall back to the
    // cToon's face/cMart price (never a live query -- CtoonPriceDaily is a
    // precomputed aggregate, kept fresh by ensureEconomyDataFresh() above).
    const auctionRef = auctionRefs.get(uc.ctoonId)
    const auctionPriced = !!auctionRef && auctionRef.pricedVolume >= MIN_SAMPLE_SIZE && auctionRef.avgPrice != null
    const avgAuctionSalePrice = auctionPriced ? auctionRef.avgPrice : uc.ctoon.price

    return {
    id: uc.id,
    userId: uc.userId,
    ctoonId: uc.ctoonId,
    assetPath: uc.ctoon.assetPath,
    name: uc.ctoon.name,
    series: uc.ctoon.series,
    releaseDate: uc.ctoon.releaseDate,
    price: uc.ctoon.price,
    avgAuctionSalePrice,
    rarity: uc.ctoon.rarity,
    set: uc.ctoon.set,
    cMoon: uc.ctoon.cMoon,
    isGtoon: uc.ctoon.isGtoon,
    cost: uc.ctoon.cost,
    power: uc.ctoon.power,
    mintNumber: uc.mintNumber,
    quantity: effectiveQuantity,
    isFirstEdition: uc.isFirstEdition,
    acquiredAt: latestAcquiredAt.get(uc.id) || uc.createdAt,
    auctions: uc.auctions || [],
    isHolidayItem: holidaySet.has(uc.ctoonId),
    // Every row here belongs to the caller (the query is scoped userId: me.id),
    // so the honest flag is the caller's own data rather than a disclosure.
    isLocked: isLockedCopy(uc),
    isSecondEdition: uc.ctoon.isSecondEdition,
    secondEditionOverlayX: uc.ctoon.secondEditionOverlayX,
    secondEditionOverlayY: uc.ctoon.secondEditionOverlayY,
    secondEditionOverlaySize: uc.ctoon.secondEditionOverlaySize
    }
  })
})
