// prisma/fixOrphanedPendingTrades.js
//
// Finds PENDING trade offers that have gone stale because one of their cToons changed owner
// through a path OTHER than this trade resolving — e.g. an admin seizing a cheater's items (see
// server/api/admin/remove-cheating.post.js and the two cheating-tool-apply endpoints, which used
// to reassign a UserCtoon's ownership without withdrawing any pending trade offer that still
// referenced it, before withdrawPendingTradeOffersForUserCtoon in server/utils/tradeOffer.js was
// added to close that gap for new seizures).
//
// A TradeOfferCtoon row's role says who's supposed to currently own that copy: OFFERED means the
// initiator, REQUESTED means the recipient. Once a copy's real current owner no longer matches,
// the offer can never be legitimately accepted (the party supposed to be contributing it doesn't
// have it anymore) — but because server/api/collection/[username].get.js's "in a pending trade"
// check is keyed purely by userCtoonId, independent of current ownership, the copy stays
// permanently locked out of trading/auctioning for whoever its new owner now is. That owner is
// neither the offer's initiator nor its recipient, so the offer never shows up in their own
// Incoming/Outgoing lists for them to cancel it themselves either — this is the "my cToon is
// stuck in a forever trade I can't even see" bug.
//
// What --apply does, per offending offer: withdraws it (status: WITHDRAWN) and releases any
// LockedPoints tied to it — the same outcome server/api/trade/offers/[id]/reject.post.js produces
// for a normal cancel, just system-initiated instead of by either party.
//
// Idempotent: re-running finds nothing once the offenders are cleared.
//
// Usage:
//   node prisma/fixOrphanedPendingTrades.js            (dry-run, no changes)
//   node prisma/fixOrphanedPendingTrades.js --apply    (withdraw the offending offers)

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../server/prisma.js'

const APPLY = process.argv.includes('--apply')
const LOG = '[fixOrphanedPendingTrades]'

async function main() {
  const pendingLinks = await prisma.tradeOfferCtoon.findMany({
    where: { tradeOffer: { status: 'PENDING' } },
    select: {
      role: true,
      userCtoon: {
        select: {
          userId: true,
          mintNumber: true,
          ctoon: { select: { name: true } }
        }
      },
      tradeOffer: {
        select: {
          id: true,
          initiatorId: true,
          recipientId: true,
          initiator: { select: { username: true } },
          recipient: { select: { username: true } }
        }
      }
    }
  })

  const offenderOfferIds = new Set()
  const details = []
  for (const link of pendingLinks) {
    const expectedOwnerId = link.role === 'OFFERED' ? link.tradeOffer.initiatorId : link.tradeOffer.recipientId
    if (link.userCtoon.userId === expectedOwnerId) continue
    offenderOfferIds.add(link.tradeOffer.id)
    details.push({
      tradeOfferId: link.tradeOffer.id,
      ctoonName: link.userCtoon.ctoon?.name ?? 'cToon',
      mintNumber: link.userCtoon.mintNumber,
      role: link.role,
      expectedOwner: link.role === 'OFFERED' ? link.tradeOffer.initiator?.username : link.tradeOffer.recipient?.username,
      actualOwnerId: link.userCtoon.userId
    })
  }

  if (!offenderOfferIds.size) {
    console.log(`${LOG} No orphaned pending trade offers found.`)
    return
  }

  console.log(`${LOG} Found ${offenderOfferIds.size} orphaned pending trade offer(s):`)
  for (const d of details) {
    const mint = d.mintNumber != null ? ` #${d.mintNumber}` : ''
    console.log(`${LOG}   offer ${d.tradeOfferId}: ${d.ctoonName}${mint} (${d.role}) — expected owner ${d.expectedOwner}, actually owned by userId ${d.actualOwnerId}`)
  }

  if (!APPLY) {
    console.log(`${LOG} dry-run complete. Use --apply to withdraw these offers.`)
    return
  }

  const offerIds = [...offenderOfferIds]
  const { count } = await prisma.tradeOffer.updateMany({
    where: { id: { in: offerIds }, status: 'PENDING' },
    data: { status: 'WITHDRAWN', updatedAt: new Date() }
  })
  await prisma.lockedPoints.updateMany({
    where: { contextType: 'TRADE', contextId: { in: offerIds }, status: 'ACTIVE' },
    data: { status: 'RELEASED' }
  })
  console.log(`${LOG} withdrew ${count} orphaned trade offer(s) and released any locked points tied to them.`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async err => {
    console.error(`${LOG} failed:`, err)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  })
