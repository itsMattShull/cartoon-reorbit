import { prisma } from '@/server/prisma'

const TIME_BASED_CAP = 999999999

function computeInitialCap(totalQty, percent, overrideQty) {
  if (totalQty == null) return null
  if (overrideQty != null && Number.isFinite(Number(overrideQty))) {
    return Math.min(Number(totalQty), Math.max(1, Number(overrideQty)))
  }
  const raw = Math.floor((Number(totalQty) * Number(percent)) / 100)
  return Math.max(1, raw)
}

export default defineEventHandler(async () => {
  const now = new Date()
  const twoWeeksAhead = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000)

  // Load global release settings (with safe defaults)
  let initialPercent = 75
  let delayHours = 12
  try {
    const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    if (cfg) {
      if (typeof cfg.initialReleasePercent === 'number') initialPercent = cfg.initialReleasePercent
      if (typeof cfg.finalReleaseDelayHours === 'number') delayHours = cfg.finalReleaseDelayHours
    }
  } catch {}

  const ctoons = await prisma.ctoon.findMany({
    where: {
      inCmart: true,
      releaseDate: { lte: twoWeeksAhead }
    },
    orderBy: { releaseDate: 'desc' },
    select: {
      id: true,
      name: true,
      set: true,
      series: true,
      rarity: true,
      assetPath: true,
      price: true,
      releaseDate: true,
      quantity: true,
      totalMinted: true,
      isGtoon: true,
      cost: true,
      power: true,
      characters: true,
      mintLimitType: true,
      mintEndDate: true,
      // advisory fields (optional)
      initialReleaseAt: true,
      finalReleaseAt: true,
      initialReleaseQty: true,
      finalReleaseQty: true,
      isSecondEdition: true,
      secondEditionOverlayX: true,
      secondEditionOverlayY: true,
      secondEditionOverlaySize: true,
    }
  })

  // Compute nextReleaseAt and initialCap for UI convenience.
  // The 2-phase cap guard (initialCap / finalReleaseAt) only applies to
  // Defined Number Limit cToons.  Time-Based Limit cToons mint freely
  // during their window and must not receive phase logic.
  return ctoons.map(c => {
    // If a time-based cToon's mint window has closed but the finalization job
    // hasn't written the real quantity yet (sentinel still in place), substitute
    // totalMinted so the frontend displays the actual count instead of "???".
    const effectiveQty = (
      c.mintLimitType === 'timeBased' &&
      c.mintEndDate &&
      new Date(c.mintEndDate) <= now &&
      c.quantity === TIME_BASED_CAP
    ) ? c.totalMinted : c.quantity

    const qty = effectiveQty
    const isDefinedLimit = c.mintLimitType === 'defined'

    // Only compute phase fields for Defined Number Limit cToons
    const finalAt = isDefinedLimit
      ? (c.finalReleaseAt
          ? new Date(c.finalReleaseAt)
          : c.releaseDate
            ? new Date(new Date(c.releaseDate).getTime() + delayHours * 60 * 60 * 1000)
            : null)
      : null
    const initialCap = isDefinedLimit && qty != null
      ? computeInitialCap(qty, initialPercent, c.initialReleaseQty)
      : null
    let nextReleaseAt = null
    if (c.releaseDate && new Date(c.releaseDate) > now) {
      nextReleaseAt = c.releaseDate
    } else if (
      isDefinedLimit &&
      qty != null && c.releaseDate && finalAt && now < finalAt &&
      c.totalMinted >= (initialCap ?? 0) && c.totalMinted < qty
    ) {
      nextReleaseAt = finalAt.toISOString()
    }
    return {
      ...c,
      quantity: effectiveQty,
      initialCap,
      finalReleaseAt: finalAt ? finalAt.toISOString() : null,
      nextReleaseAt
    }
  })
})
