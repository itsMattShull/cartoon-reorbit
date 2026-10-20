// server/utils/dissolveMisfireAudit.js
//
// Finds PAST dissolve-auction misfires — cases that already happened before
// dissolve-auction-launch.worker.js's own ownership re-check existed. See
// DissolveMisfireLog's schema comment and server/utils/dissolveMisfire.js for the live-prevention
// side of this.
import { prisma } from '../prisma.js'
import { findRightfulOwnerBefore, findOfficialReleaseBefore } from './dissolveMisfire.js'

/**
 * Scans every auction the official account ever created for a case where chain-of-custody
 * (CtoonOwnerLog) shows a different, real player legitimately owned the item immediately before
 * that auction was created — the historical signature of the bug. Idempotent: keyed on
 * (bogusAuctionId), so re-running this never creates duplicate rows or disturbs an already-
 * reviewed one. An existing unresolved row only has its auction-state snapshot refreshed; one
 * resolved as "already correct" is re-opened if its auction has since sold the item.
 *
 * Only ACTIVE auctions (still locked right now, recoverable by cancelling) and CLOSED auctions
 * with a winner (the item already changed hands to a third party — the case that actually needs
 * reversing) are considered. A CANCELLED or no-bid CLOSED auction never moved anything, so
 * there's no victim to surface for it.
 *
 * A candidate only counts as a genuine misfire when official actually HELD the item before this
 * auction — via a dissolve, or a direct grant (AuctionOnly mint, give-to-official, admin
 * correction); see findOfficialReleaseBefore. Otherwise this is almost certainly an
 * ordinary auction whose creatorId was reassigned to official because its seller's account got
 * dissolved while the auction was still active (both dissolve.worker.js and the inactivity sweep
 * do this deliberately, and it's correct behavior, not a misfire). Re-running the scan also prunes
 * any previously-logged row that no longer qualifies under this check, as long as no admin has
 * reviewed or resolved it yet — those are left untouched either way.
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
  let prunedFalsePositives = 0
  let reopened = 0
  for (const a of candidates) {
    if (!a.userCtoon) continue
    const rightfulOwner = await findRightfulOwnerBefore(prisma, a.userCtoon.id, a.createdAt)
    // No prior ownership history at all, or the last recorded owner WAS the official account —
    // either way this is a legitimate first-pass dissolve auction, not a misfire. Absence of
    // evidence isn't treated as evidence of the bug.
    const isCandidate = rightfulOwner && rightfulOwner.userId !== official.id
    // A genuine misfire requires official to have actually held the item before this auction —
    // otherwise this is an ordinary auction whose creatorId got reassigned to official because its
    // seller's account was dissolved mid-auction (see this function's own comment above).
    const release = isCandidate
      ? await findOfficialReleaseBefore(prisma, a.userCtoon.id, a.createdAt, official.id)
      : null
    const isGenuineMisfire = !!release

    if (!isGenuineMisfire) {
      // Clean up a previously-logged row for this auction that no longer qualifies — but only
      // when no admin has acted on it yet, so a human's review/resolution is never silently erased.
      const existing = await prisma.dissolveMisfireLog.findUnique({ where: { bogusAuctionId: a.id } })
      if (existing && !existing.reviewedAt && !existing.resolvedAt) {
        await prisma.dissolveMisfireLog.delete({ where: { id: existing.id } })
        prunedFalsePositives++
      }
      continue
    }

    found++
    const source = a.status === 'ACTIVE' ? 'HISTORICAL_ACTIVE' : 'HISTORICAL_RESOLVED'
    const wrongWinner = {
      wrongWinnerUserId: a.status === 'CLOSED' ? a.winnerId : null,
      wrongWinnerUsername: a.status === 'CLOSED' ? (a.winner?.username ?? null) : null,
      wrongWinnerPaidPoints: a.status === 'CLOSED' ? a.highestBid : null,
    }
    const existing = await prisma.dissolveMisfireLog.findUnique({ where: { bogusAuctionId: a.id } })

    if (existing) {
      // The auction's state moves on after the row is first logged (ACTIVE -> CLOSED with a winner),
      // so a row that's still unresolved needs its source / wrong-winner snapshot brought current —
      // otherwise it keeps claiming "Still Active" and the remediation would never see who was
      // actually paid out. Admin review fields are never touched.
      if (!existing.resolvedAt) {
        await prisma.dissolveMisfireLog.update({ where: { id: existing.id }, data: { source, releaseMethod: release.method, ...wrongWinner } })
      } else if (existing.resolutionSummary?.alreadyCorrect && a.status === 'CLOSED' && a.winnerId) {
        // An earlier resolve closed this out as "owner already correct" while the bogus auction was
        // still live; it has since settled and moved the item to the wrong winner, so that
        // resolution no longer holds. Re-open it (resolved + reviewed state cleared) so the
        // restore + compensation can actually run.
        await prisma.dissolveMisfireLog.update({
          where: { id: existing.id },
          data: {
            source, releaseMethod: release.method, ...wrongWinner,
            resolvedAt: null, resolvedByUserId: null, resolvedByUsername: null, resolutionSummary: null,
            resolutionBlockedReason: null,
            reviewedAt: null, reviewedByUserId: null, reviewedByUsername: null, reviewNote: null
          }
        })
        reopened++
      }
      continue
    }

    await prisma.dissolveMisfireLog.create({
      data: {
        userCtoonId: a.userCtoon.id,
        ctoonId: a.userCtoon.ctoonId,
        ctoonName: a.userCtoon.ctoon?.name ?? null,
        mintNumber: a.userCtoon.mintNumber,
        rightfulOwnerUserId: rightfulOwner.userId,
        rightfulOwnerUsername: rightfulOwner.username,
        rightfulOwnerSince: rightfulOwner.since,
        rightfulOwnerMethod: rightfulOwner.method,
        source,
        releaseMethod: release.method,
        bogusAuctionId: a.id,
        ...wrongWinner,
      }
    })
  }
  return { scanned: candidates.length, found, prunedFalsePositives, reopened }
}
