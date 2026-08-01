import { prisma } from '../prisma.js'

/**
 * Best-effort error log entry for AuctionOnly scheduling/activation failures,
 * surfaced on the "Manage Auction Only" admin page. Never throws.
 * @param {'schedule'|'activation'|'removal'} context
 * @param {unknown} err
 * @param {string|null} auctionOnlyId
 */
export async function logAuctionOnlyError(context, err, auctionOnlyId = null) {
  try {
    const message = err?.stack || err?.message || String(err)
    await prisma.auctionOnlyErrorLog.create({
      data: { context, message: message.slice(0, 4000), auctionOnlyId }
    })
  } catch (e2) {
    console.error('[auction-only-error-log] failed to record error:', e2?.message)
  }
}
