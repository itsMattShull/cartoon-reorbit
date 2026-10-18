// server/utils/dissolveMisfire.js
//
// Shared helpers for detecting/logging a "dissolve-auction misfire" — a cToon that left the
// official account's inventory (traded away by an admin, scheduled into a second AuctionOnly
// listing, etc.) WITHOUT its DissolveAuctionQueue entry being cleared, so that entry's own
// scheduled launch later tried to auction the item off again — out from under whichever real
// player actually owned it by then. See prisma/schema.prisma's DissolveMisfireLog comment, and
// server/workers/dissolve-auction-launch.worker.js (the fix) /
// server/utils/dissolveMisfireAudit.js (the scan for cases that happened before that fix shipped).
import { prisma } from '../prisma.js'

/**
 * The most recent CtoonOwnerLog row for a userCtoonId, strictly before a given time — "who
 * legitimately held this item, and how/when did they get it, right before this event happened."
 * Returns null (not a guess) when there's no prior ownership history to go on, so callers never
 * mistake "we don't know" for "it was fine."
 */
export async function findRightfulOwnerBefore(client, userCtoonId, beforeDate) {
  if (!userCtoonId) return null
  const row = await client.ctoonOwnerLog.findFirst({
    where: { userCtoonId, createdAt: { lt: beforeDate } },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, createdAt: true, method: true, user: { select: { username: true } } }
  })
  if (!row || !row.userId) return null
  return { userId: row.userId, username: row.user?.username ?? null, since: row.createdAt, method: row.method }
}

/**
 * Best-effort log of a misfire the launch worker caught and stopped BEFORE creating a bogus
 * auction (source: PREVENTED, bogusAuctionId left null — nothing was ever created). Never throws:
 * same "logging a bug must never itself break the caller" discipline as
 * server/utils/dissolveAuctionErrorLog.js.
 * @param {{ userCtoonId: string, queueEntryId?: string|null, ctoonId?: string|null, ctoonName?: string|null, mintNumber?: number|null, rightfulOwnerUserId: string }} details
 */
export async function recordPreventedMisfire(details) {
  try {
    const [owner, lastLog] = await Promise.all([
      prisma.user.findUnique({ where: { id: details.rightfulOwnerUserId }, select: { username: true } }),
      prisma.ctoonOwnerLog.findFirst({
        where: { userCtoonId: details.userCtoonId, userId: details.rightfulOwnerUserId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, method: true }
      })
    ])
    await prisma.dissolveMisfireLog.create({
      data: {
        userCtoonId: details.userCtoonId,
        ctoonId: details.ctoonId ?? null,
        ctoonName: details.ctoonName ?? null,
        mintNumber: details.mintNumber ?? null,
        rightfulOwnerUserId: details.rightfulOwnerUserId,
        rightfulOwnerUsername: owner?.username ?? null,
        rightfulOwnerSince: lastLog?.createdAt ?? null,
        rightfulOwnerMethod: lastLog?.method ?? null,
        source: 'PREVENTED',
        queueEntryId: details.queueEntryId ?? null,
      }
    })
  } catch (e) {
    console.error('[dissolve-misfire] failed to record prevented misfire:', e?.message || e)
  }
}
