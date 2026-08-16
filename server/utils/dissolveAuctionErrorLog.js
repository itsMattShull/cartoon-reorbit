import { prisma } from '../prisma.js'

/**
 * Best-effort error log entry for dissolve-queue → live-auction launch
 * failures, surfaced on the admin "Manage Dissolve Queue" page's Errors
 * modal. Never throws.
 * @param {unknown} err
 * @param {{ queueEntryId?: string|null, userCtoonId?: string|null, ctoonName?: string|null, mintNumber?: number|null, rarity?: string|null, series?: string|null, set?: string|null, sourceUsername?: string|null }} details
 */
export async function logDissolveAuctionError(err, details = {}) {
  try {
    const message = err?.stack || err?.message || String(err)
    await prisma.dissolveAuctionErrorLog.create({
      data: {
        queueEntryId:   details.queueEntryId ?? null,
        userCtoonId:    details.userCtoonId ?? null,
        ctoonName:      details.ctoonName ?? null,
        mintNumber:     details.mintNumber ?? null,
        rarity:         details.rarity ?? null,
        series:         details.series ?? null,
        set:            details.set ?? null,
        sourceUsername: details.sourceUsername ?? null,
        message:        message.slice(0, 4000),
      }
    })
  } catch (e2) {
    console.error('[dissolve-auction-error-log] failed to record error:', e2?.message)
  }
}
