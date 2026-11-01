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
import { cancelDissolveAuctionLaunch } from './queues.js'

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

// Methods that put an item into the official account's inventory as part of a dissolve — written
// by dissolve.worker.js (admin-initiated) and the inactivity sweep (server/cron/jobHandlers.js).
// Not the only way official acquires an item; see findOfficialReleaseBefore.
export const DISSOLVE_METHODS = ['DISSOLVE', 'DISSOLVE_INACTIVE']

/**
 * Index of the LAST row in an ascending CtoonOwnerLog history at which the official account took
 * (or was handed) the item — a dissolve row, or any row owned by official (AuctionOnly / give-to-
 * official ADMIN_GRANT, an ADMIN_CORRECTION revoke, etc.). That row is the "release event": whoever
 * received the item right after it is the original legitimate winner. -1 when official never held it.
 */
export function findLastOfficialHoldIndex(history, officialId) {
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i]
    if (DISSOLVE_METHODS.includes(row.method) || (officialId && row.userId === officialId)) return i
  }
  return -1
}

/**
 * The most recent time, strictly before the given time, that the official account held this item
 * — the one thing that distinguishes a genuine misfire (an item official released to a real player,
 * then auctioned again) from an auction whose creatorId merely became official because its seller's
 * account was dissolved while the auction was still active (the item itself never entered
 * official's inventory, so no such row exists). Official can acquire an item by a DISSOLVE /
 * DISSOLVE_INACTIVE, or by being granted it directly (AuctionOnly mint, give-to-official,
 * ADMIN_CORRECTION) — all count. Returns { method, since } or null.
 */
export async function findOfficialReleaseBefore(client, userCtoonId, beforeDate, officialId) {
  if (!userCtoonId) return null
  const row = await client.ctoonOwnerLog.findFirst({
    where: {
      userCtoonId,
      createdAt: { lt: beforeDate },
      OR: [{ method: { in: DISSOLVE_METHODS } }, ...(officialId ? [{ userId: officialId }] : [])]
    },
    orderBy: { createdAt: 'desc' },
    select: { method: true, createdAt: true }
  })
  return row ? { method: row.method, since: row.createdAt } : null
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

/**
 * Proactive daily sweep (cron: reconcileDissolveQueueOwnership) over every entry still SITTING in
 * the dissolve queue (not yet launched) — not just the ones whose scheduledFor has already
 * arrived. dissolve-auction-launch.worker.js already re-checks ownership and self-heals a stale
 * entry, but only at the moment that entry's own job fires; this lets an admin (or this cron) spot
 * and clear a stale entry — e.g. one already traded/granted away by some other path — well before
 * its scheduled date, instead of it just sitting in the queue looking wrong until then.
 *
 * Same "PREVENTED" logging as the launch worker's own check, so a removal here shows up in the
 * Dissolve Misfires admin page exactly like one caught at launch time would.
 * @returns {Promise<{ scanned: number, removed: number }>}
 */
export async function reconcileDissolveQueueOwnership() {
  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({ where: { username: officialUsername }, select: { id: true } })
  if (!official) {
    console.error(`[reconcileDissolveQueueOwnership] Official account not found: ${officialUsername}`)
    return { scanned: 0, removed: 0 }
  }

  const entries = await prisma.dissolveAuctionQueue.findMany({
    select: {
      id: true,
      userCtoonId: true,
      userCtoon: {
        select: {
          ctoonId: true,
          mintNumber: true,
          userId: true,
          ctoon: { select: { name: true } }
        }
      }
    }
  })

  let removed = 0
  for (const entry of entries) {
    const currentOwnerId = entry.userCtoon?.userId ?? null
    if (currentOwnerId === official.id) continue // still correctly owned — nothing to do

    try {
      await prisma.dissolveAuctionQueue.delete({ where: { id: entry.id } })
    } catch {
      // Already gone — a concurrent process (most likely this same entry's own launch job
      // firing at the same moment) beat this sweep to it, and already logged its own misfire
      // if one applied. Nothing more to do here.
      continue
    }
    await cancelDissolveAuctionLaunch(entry.id)
    removed++

    // No current owner at all (the UserCtoon row itself is gone) isn't a misfire to compensate —
    // there's no rightful owner to log, same guard the launch worker's own check applies.
    if (currentOwnerId) {
      await recordPreventedMisfire({
        userCtoonId: entry.userCtoonId,
        queueEntryId: entry.id,
        ctoonId: entry.userCtoon?.ctoonId ?? null,
        ctoonName: entry.userCtoon?.ctoon?.name ?? null,
        mintNumber: entry.userCtoon?.mintNumber ?? null,
        rightfulOwnerUserId: currentOwnerId,
      })
    }
  }

  return { scanned: entries.length, removed }
}
