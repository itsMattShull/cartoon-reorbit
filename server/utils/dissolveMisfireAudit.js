// server/utils/dissolveMisfireAudit.js
//
// Finds PAST dissolve-auction misfires — cases that already happened before
// dissolve-auction-launch.worker.js's own ownership re-check existed. See
// DissolveMisfireLog's schema comment and server/utils/dissolveMisfire.js for the live-prevention
// side of this.
import { prisma } from '../prisma.js'
import { findRightfulOwnerBefore } from './dissolveMisfire.js'

/**
 * Scans every auction the official account ever created for a case where chain-of-custody
 * (CtoonOwnerLog) shows a different, real player legitimately owned the item immediately before
 * that auction was created — the historical signature of the bug. Idempotent: upserts on
 * (bogusAuctionId), so re-running this never creates duplicate rows or disturbs an already-
 * reviewed one.
 *
 * Only ACTIVE auctions (still locked right now, recoverable by cancelling) and CLOSED auctions
 * with a winner (the item already changed hands to a third party — the case that actually needs
 * reversing) are considered. A CANCELLED or no-bid CLOSED auction never moved anything, so
 * there's no victim to surface for it.
 */
export async function scanForHistoricalMisfires() {
  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({ where: { username: officialUsername }, select: { id: true } })
  if (!official) throw new Error(`Official account not found: ${officialUsername}`)

  const candidates = await prisma.auction.findMany({
    where: {
      creatorId: official.id,
      OR: [
        { status: 'ACTIVE' },
        { status: 'CLOSED', winnerId: { not: null } }
      ]
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      winnerId: true,
      highestBid: true,
      userCtoon: {
        select: {
          id: true,
          ctoonId: true,
          mintNumber: true,
          ctoon: { select: { name: true } }
        }
      },
      winner: { select: { username: true } }
    }
  })

  let found = 0
  for (const a of candidates) {
    if (!a.userCtoon) continue
    const rightfulOwner = await findRightfulOwnerBefore(prisma, a.userCtoon.id, a.createdAt)
    // No prior ownership history at all, or the last recorded owner WAS the official account —
    // either way this is a legitimate first-pass dissolve auction, not a misfire. Absence of
    // evidence isn't treated as evidence of the bug.
    if (!rightfulOwner || rightfulOwner.userId === official.id) continue

    found++
    await prisma.dissolveMisfireLog.upsert({
      where: { bogusAuctionId: a.id },
      update: {}, // leave an already-logged row (and any admin review on it) exactly as it is
      create: {
        userCtoonId: a.userCtoon.id,
        ctoonId: a.userCtoon.ctoonId,
        ctoonName: a.userCtoon.ctoon?.name ?? null,
        mintNumber: a.userCtoon.mintNumber,
        rightfulOwnerUserId: rightfulOwner.userId,
        rightfulOwnerUsername: rightfulOwner.username,
        rightfulOwnerSince: rightfulOwner.since,
        rightfulOwnerMethod: rightfulOwner.method,
        source: a.status === 'ACTIVE' ? 'HISTORICAL_ACTIVE' : 'HISTORICAL_RESOLVED',
        bogusAuctionId: a.id,
        wrongWinnerUserId: a.status === 'CLOSED' ? a.winnerId : null,
        wrongWinnerUsername: a.status === 'CLOSED' ? (a.winner?.username ?? null) : null,
        wrongWinnerPaidPoints: a.status === 'CLOSED' ? a.highestBid : null,
      }
    })
  }
  return { scanned: candidates.length, found }
}
