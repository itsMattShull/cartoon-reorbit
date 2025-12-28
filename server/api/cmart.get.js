import { prisma } from '@/server/prisma'

function computeInitialCap(totalQty, percent) {
  if (totalQty == null) return null
  const raw = Math.floor((Number(totalQty) * Number(percent)) / 100)
  return Math.max(1, raw)
}

export default defineEventHandler(async () => {
  const now = new Date()
  const twoWeeksAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

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
      characters: true,
      // advisory fields (optional)
      initialReleaseAt: true,
      finalReleaseAt: true,
      initialReleaseQty: true,
      finalReleaseQty: true,
    }
  })

  // Compute nextReleaseAt and initialCap for UI convenience
  return ctoons.map(c => {
    const qty = c.quantity
    let finalAt = null
    if (c.releaseDate) {
      finalAt = new Date(new Date(c.releaseDate).getTime() + delayHours * 60 * 60 * 1000)
    }
    const initialCap = qty != null ? computeInitialCap(qty, initialPercent) : null
    let nextReleaseAt = null
    if (c.releaseDate && new Date(c.releaseDate) > now) {
      nextReleaseAt = c.releaseDate
    } else if (
      qty != null && c.releaseDate && finalAt && now < finalAt && c.totalMinted >= (initialCap ?? 0) && c.totalMinted < qty
    ) {
      nextReleaseAt = finalAt.toISOString()
    }
    return {
      ...c,
      initialCap,
      finalReleaseAt: finalAt ? finalAt.toISOString() : null,
      nextReleaseAt
    }
  })
})
