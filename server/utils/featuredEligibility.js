// server/utils/featuredEligibility.js
// Shared logic for the "Featured auction" bidding restriction.
//
// A featured auction limits how many copies of a scarce cToon a single user can
// pursue. The base rule (unchanged): a user may not bid if they currently own
// >= 2 unburned copies, or have *received* >= 2 distinct copies in the last 30
// days.
//
// Second Edition twist: when the auctioned cToon is itself a Second Edition
// (Ctoon.isSecondEdition = true with a related First Edition), the counts are
// combined across BOTH editions — owning 1 First + 1 Second edition = 2, and
// likewise for the 30-day received count. This combined counting applies ONLY
// when the auctioned cToon is a Second Edition; a featured auction of a plain /
// First Edition cToon keeps the single-ctoon rule.
import { createError } from 'h3'

export const FEATURED_THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Resolve the set of ctoonIds that count toward a featured auction's ownership
 * cap for the given auctioned cToon.
 *
 * @param {{ ctoonId?: string|null, isSecondEdition?: boolean|null, relatedFirstEditionId?: string|null }} ctoon
 * @returns {string[]}
 */
export function resolveFeaturedCtoonIds(ctoon) {
  if (!ctoon?.ctoonId) return []
  const ids = [ctoon.ctoonId]
  // Only combine editions when the auctioned copy is a Second Edition and it is
  // actually linked to a First Edition. If the link is missing (unlinked data),
  // fall back to the single-ctoon count rather than counting a bogus id.
  if (ctoon.isSecondEdition && ctoon.relatedFirstEditionId) {
    ids.push(ctoon.relatedFirstEditionId)
  }
  return Array.from(new Set(ids.filter(Boolean)))
}

/**
 * Compute whether a user is eligible to bid on a featured auction.
 * Non-throwing — returns a structured result so callers can either throw or
 * filter (e.g. proxy auto-bids).
 *
 * @param {import('@prisma/client').PrismaClient} client  prisma or a tx client
 * @param {string} userId
 * @param {{ ctoonId?: string|null, isSecondEdition?: boolean|null, relatedFirstEditionId?: string|null }} ctoon
 * @returns {Promise<{ eligible: boolean, reason?: 'own'|'recent' }>}
 */
export async function checkFeaturedEligibility(client, userId, ctoon) {
  const ctoonIds = resolveFeaturedCtoonIds(ctoon)
  if (!ctoonIds.length) return { eligible: true }

  // 1) Current ownership across the counted editions (unburned copies only).
  const currentOwned = await client.userCtoon.count({
    where: { userId, ctoonId: { in: ctoonIds }, burnedAt: null }
  })
  if (currentOwned >= 2) return { eligible: false, reason: 'own' }

  // 2) Distinct copies *received* across the counted editions in the last 30
  //    days. Counts receipts (not current holdings) per the product rule.
  const cutoff = new Date(Date.now() - FEATURED_THIRTY_DAYS_MS)
  const recent = await client.ctoonOwnerLog.findMany({
    where: { userId, ctoonId: { in: ctoonIds }, createdAt: { gte: cutoff } },
    select: { userCtoonId: true },
    distinct: ['userCtoonId']
  })
  if (recent.length >= 2) return { eligible: false, reason: 'recent' }

  return { eligible: true }
}

/**
 * Throwing guard for the manual-bid / set-autobid endpoints. No-op when the
 * auction is not featured.
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {{ isFeatured?: boolean|null, ctoon: object }} auction
 */
export async function assertFeaturedEligibility(client, userId, { isFeatured, ctoon }) {
  if (!isFeatured) return
  const { eligible } = await checkFeaturedEligibility(client, userId, ctoon)
  if (!eligible) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You are not eligible to bid on this featured auction'
    })
  }
}

/**
 * A user may not hold the lead on more than one ACTIVE featured auction for
 * the same cToon (1st/2nd edition combined) at a time. Finds another active
 * featured auction, other than `excludeAuctionId`, where the user is
 * currently the highest bidder for the same counted cToon set.
 *
 * @param {import('@prisma/client').PrismaClient} client  prisma or a tx client
 * @param {string} userId
 * @param {{ excludeAuctionId: string, ctoon: { ctoonId?: string|null, isSecondEdition?: boolean|null, relatedFirstEditionId?: string|null } }} opts
 * @returns {Promise<{ id: string }|null>}
 */
export async function findConcurrentFeaturedLead(client, userId, { excludeAuctionId, ctoon }) {
  const ctoonIds = resolveFeaturedCtoonIds(ctoon)
  if (!ctoonIds.length) return null

  return client.auction.findFirst({
    where: {
      id: { not: excludeAuctionId },
      isFeatured: true,
      status: 'ACTIVE',
      endAt: { gt: new Date() },
      highestBidderId: userId,
      userCtoon: { ctoonId: { in: ctoonIds } }
    },
    select: { id: true }
  })
}

/**
 * Throwing guard for the manual-bid / set-autobid endpoints. No-op when the
 * auction is not featured.
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {{ isFeatured?: boolean|null, excludeAuctionId: string, ctoon: object }} opts
 */
export async function assertNoConcurrentFeaturedLead(client, userId, { isFeatured, excludeAuctionId, ctoon }) {
  if (!isFeatured) return
  const conflict = await findConcurrentFeaturedLead(client, userId, { excludeAuctionId, ctoon })
  if (conflict) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You are already the leading bidder on another active featured auction for this cToon'
    })
  }
}
