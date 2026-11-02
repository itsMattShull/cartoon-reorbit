// server/utils/userPackTransfer.js
// Moves ALL of one user's unopened (sealed) packs to another account — the pack counterpart of the "move the cToons"
// step in the account-lifecycle jobs: the 270-day dormant-account job (server/cron/jobHandlers.js) and the admin
// dissolve / transfer workers (server/workers/dissolve.worker.js, transfer.worker.js).
//
// ── Import rules ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Used from plain-Node workers as well as Nitro: takes the Prisma client as a parameter, imports only a sibling `.js`.
//
// ── What it does, and why each step is needed ──────────────────────────────────────────────────────────────────────────
//   1. LOCKS the packs (after the offer/auction rows, per the global lock order) so the owner cannot open, trade or list one
//      mid-move.
//   2. REJECTS any pending offer that holds one of them and gives the initiator their locked points back. After the move
//      the offer could never be accepted (the initiator/recipient no longer holds the pack), and an unaccepted pending
//      offer is also what keeps the pack "in a trade".
//   3. A RUNNING PACK AUCTION keeps going, and its seller moves with the pack. A cToon in a running auction stays with its
//      old owner while only the auction's creator is reassigned; a pack auction settles only if the seller still HOLDS the
//      pack (server/utils/auctionSettle.js), so leaving the pack behind would make every such auction close unsold and
//      strand the pack on a disabled account.
//   4. MOVES the packs and writes one PackOwnerLog row per pack (with who it came from).
// Call it INSIDE a transaction (it needs the row locks to last through steps 2–4).
import { lockPacksForUpdate } from './userPackState.js'

/**
 * @param {*} tx  Prisma transaction client
 * @param {{ fromUserId:string, toUserId:string, method:string, fromUsername?:string|null }} p
 * @returns {Promise<{ moved:number, offersRejected:number, auctionsReassigned:number }>}
 */
export async function moveSealedPacks (tx, { fromUserId, toUserId, method, fromUsername = null }) {
  const held = await tx.userPack.findMany({ where: { userId: fromUserId, opened: false }, select: { id: true, packId: true } })
  if (!held.length) return { moved: 0, offersRejected: 0, auctionsReassigned: 0 }
  const ids = held.map(p => p.id)

  // Lock order (see userPackState.js): TradeOffer / Auction rows BEFORE UserPack rows — accept and settle claim their
  // offer/auction row first and then the packs, so taking the packs first here could deadlock against them.
  const stuck = await tx.tradeOffer.findMany({
    where: { status: 'PENDING', packs: { some: { userPackId: { in: ids } } } },
    select: { id: true, initiatorId: true },
    orderBy: { id: 'asc' }
  })
  for (const o of stuck) {
    await tx.tradeOffer.updateMany({ where: { id: o.id, status: 'PENDING' }, data: { status: 'REJECTED', updatedAt: new Date() } })
    await tx.lockedPoints.updateMany({
      where: { userId: o.initiatorId, status: 'ACTIVE', contextType: 'TRADE', contextId: o.id },
      data: { status: 'RELEASED' }
    })
  }

  const reassigned = await tx.auction.updateMany({
    where: { kind: 'PACK', userPackId: { in: ids }, status: 'ACTIVE' },
    data: { creatorId: toUserId }
  })

  // Only now the pack rows. Re-read under the lock: a pack opened/traded between the first read and here is skipped.
  const locked = await lockPacksForUpdate(tx, ids)
  const stillHeld = new Set(locked.filter(r => r.userId === fromUserId && !r.opened).map(r => r.id))
  const moving = held.filter(p => stillHeld.has(p.id))

  await tx.userPack.updateMany({ where: { id: { in: [...stillHeld] }, userId: fromUserId, opened: false }, data: { userId: toUserId } })
  await tx.packOwnerLog.createMany({
    data: moving.map(p => ({
      userPackId: p.id, packId: p.packId, userId: toUserId, method,
      counterpartyUserId: fromUserId, counterpartyUsername: fromUsername
    }))
  })

  return { moved: moving.length, offersRejected: stuck.length, auctionsReassigned: reassigned.count }
}
