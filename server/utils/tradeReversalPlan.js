// server/utils/tradeReversalPlan.js
// Pure decision logic for the admin "Trade Reversal" tool: given an ACCEPTED trade, where each item in it is right now,
// and what each item is worth, decide what undoing the trade does. No database, no Nuxt auto-imports, so
// tests/tradeReversalPlan.test.js can load it directly. The database half lives in server/utils/tradeReversal.js.
//
// What "undo" means, per item (a cToon or a sealed pack) that changed hands in the trade:
//
//   the user who RECEIVED it still has it (and it is free to move)  -> it goes back to the user who gave it  (RETURN)
//   the user who GAVE it already has it again                        -> nothing to do                        (ALREADY_BACK)
//   anything else (traded or auctioned on, burned, opened, listed    -> it is "gone" from the receiver:
//   in an active auction, locked in a tournament deck)                   - fair market value ON:  the receiver owes the
//                                                                          giver the item's fair market value  (FMV)
//                                                                        - fair market value OFF: skipped, the giver
//                                                                          gets nothing for it                  (SKIP)
//
// Points: each side gives back the points it received in the trade, plus (FMV on) the value of every gone item it
// received. The two debts are netted into ONE transfer between the two users, so no points are created or destroyed.

export const REVERSAL_OUTCOME = Object.freeze({
  RETURN: 'RETURN',
  ALREADY_BACK: 'ALREADY_BACK',
  FMV: 'FMV',
  SKIP: 'SKIP'
})

// Why an item can't simply be handed back. `label` is what the admin reads.
export const REVERSAL_GONE_REASON = Object.freeze({
  MISSING: { code: 'MISSING', label: 'no longer exists' },
  BURNED: { code: 'BURNED', label: 'was burned or dissolved' },
  OPENED: { code: 'OPENED', label: 'was opened by the user who received it' },
  IN_AUCTION: { code: 'IN_AUCTION', label: 'is listed in an active auction by the user who received it' },
  FROZEN: { code: 'FROZEN', label: 'is locked in an OG gToons tournament deck' },
  MOVED_ON: { code: 'MOVED_ON', label: 'was traded or auctioned away (someone else owns it now)' }
})

/**
 * Where an item is right now, relative to the trade. Returns { kind: 'RETURN' | 'ALREADY_BACK' | 'GONE', reason? }.
 *
 * @param {{ userId:string, burnedAt?:Date|null, opened?:boolean, inActiveAuction?:boolean, frozen?:boolean }|null|undefined} state
 * @param {{ originalOwnerId:string, receiverId:string, isPack:boolean }} who
 */
export function classifyReversalItem (state, { originalOwnerId, receiverId, isPack }) {
  if (!state) return { kind: 'GONE', reason: REVERSAL_GONE_REASON.MISSING }
  if (!isPack && state.burnedAt) return { kind: 'GONE', reason: REVERSAL_GONE_REASON.BURNED }
  if (isPack && state.opened) {
    // Opened by whoever holds it now; only the receiver opening it is "their" doing, but either way it can't go back.
    return { kind: 'GONE', reason: state.userId === receiverId ? REVERSAL_GONE_REASON.OPENED : REVERSAL_GONE_REASON.MOVED_ON }
  }
  if (state.userId === originalOwnerId) return { kind: 'ALREADY_BACK' }
  if (state.userId !== receiverId) return { kind: 'GONE', reason: REVERSAL_GONE_REASON.MOVED_ON }
  if (state.inActiveAuction) return { kind: 'GONE', reason: REVERSAL_GONE_REASON.IN_AUCTION }
  if (state.frozen) return { kind: 'GONE', reason: REVERSAL_GONE_REASON.FROZEN }
  return { kind: 'RETURN' }
}

/**
 * Builds the full reversal plan.
 *
 * @param {object} p
 * @param {{ id:string, initiatorId:string, recipientId:string, pointsOffered:number, pointsRequested:number,
 *           ctoons: Array<{ userCtoonId:string, role:'OFFERED'|'REQUESTED', ctoonId:string }>,
 *           packs: Array<{ userPackId:string, role:'OFFERED'|'REQUESTED', packId:string }> }} p.offer
 * @param {Map<string, object>} p.ctoonState  userCtoonId -> { userId, burnedAt, inActiveAuction, frozen }
 * @param {Map<string, object>} p.packState   userPackId  -> { userId, opened, inActiveAuction }
 * @param {Map<string, number>} p.ctoonValues ctoonId -> fair market value (points)
 * @param {Map<string, number>} p.packValues  packId  -> fair market value (points)
 * @param {boolean} p.includeFairMarketValue
 */
export function buildTradeReversalPlan ({ offer, ctoonState, packState, ctoonValues, packValues, includeFairMarketValue }) {
  const initiatorId = offer.initiatorId
  const recipientId = offer.recipientId
  // OFFERED items went initiator -> recipient; REQUESTED items went recipient -> initiator.
  const sides = (role) => role === 'OFFERED'
    ? { originalOwnerId: initiatorId, receiverId: recipientId }
    : { originalOwnerId: recipientId, receiverId: initiatorId }

  const fmvOwed = { [initiatorId]: 0, [recipientId]: 0 } // by the user who received the gone item
  const items = []

  const place = (entry, state, value, isPack) => {
    const who = sides(entry.role)
    const where = classifyReversalItem(state, { ...who, isPack })
    let outcome
    if (where.kind === 'RETURN') outcome = REVERSAL_OUTCOME.RETURN
    else if (where.kind === 'ALREADY_BACK') outcome = REVERSAL_OUTCOME.ALREADY_BACK
    else outcome = includeFairMarketValue ? REVERSAL_OUTCOME.FMV : REVERSAL_OUTCOME.SKIP
    const fairMarketValue = Math.max(0, Math.round(Number(value) || 0))
    if (outcome === REVERSAL_OUTCOME.FMV) fmvOwed[who.receiverId] += fairMarketValue
    items.push({
      kind: isPack ? 'pack' : 'ctoon',
      id: isPack ? entry.userPackId : entry.userCtoonId,
      role: entry.role,
      ...who,
      outcome,
      reasonCode: where.reason?.code ?? null,
      reason: where.reason?.label ?? null,
      fairMarketValue
    })
  }

  for (const c of offer.ctoons) place(c, ctoonState.get(c.userCtoonId), ctoonValues.get(c.ctoonId), false)
  for (const p of offer.packs) place(p, packState.get(p.userPackId), packValues.get(p.packId), true)

  const pointsOffered = Math.max(0, offer.pointsOffered || 0)
  const pointsRequested = Math.max(0, offer.pointsRequested || 0)
  // What each user owes the other to undo the trade.
  const recipientOwes = pointsOffered + fmvOwed[recipientId]
  const initiatorOwes = pointsRequested + fmvOwed[initiatorId]
  const diff = recipientOwes - initiatorOwes
  const net = diff === 0
    ? { fromUserId: null, toUserId: null, amount: 0 }
    : diff > 0
      ? { fromUserId: recipientId, toUserId: initiatorId, amount: diff }
      : { fromUserId: initiatorId, toUserId: recipientId, amount: -diff }

  const count = (kind, outcome) => items.filter(i => i.kind === kind && i.outcome === outcome).length
  return {
    includeFairMarketValue: !!includeFairMarketValue,
    items,
    points: {
      // Trade points handed back: the recipient returns what the initiator offered, and vice versa.
      tradePointsToInitiator: pointsOffered,
      tradePointsToRecipient: pointsRequested,
      fmvOwedByInitiator: fmvOwed[initiatorId],
      fmvOwedByRecipient: fmvOwed[recipientId],
      net
    },
    counts: {
      ctoonsReturned: count('ctoon', REVERSAL_OUTCOME.RETURN),
      packsReturned: count('pack', REVERSAL_OUTCOME.RETURN),
      ctoonsValued: count('ctoon', REVERSAL_OUTCOME.FMV),
      packsValued: count('pack', REVERSAL_OUTCOME.FMV),
      ctoonsSkipped: count('ctoon', REVERSAL_OUTCOME.SKIP),
      packsSkipped: count('pack', REVERSAL_OUTCOME.SKIP),
      alreadyBack: items.filter(i => i.outcome === REVERSAL_OUTCOME.ALREADY_BACK).length
    }
  }
}

/** Average of the given sale prices, rounded; null when there are none. */
export function averageSalePrice (prices) {
  const xs = (prices || []).map(Number).filter(n => Number.isFinite(n) && n > 0)
  if (!xs.length) return null
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
}

/**
 * Fair market value of one item: the average of its most recent sold auctions when there are any, else its cMart /
 * shop price, else 0. `source` says which, so the admin can see how a number was arrived at.
 */
export function pickFairMarketValue (recentSales, listPrice) {
  const avg = averageSalePrice(recentSales)
  if (avg != null) {
    const sales = recentSales.filter(n => Number.isFinite(Number(n)) && Number(n) > 0).length
    return { value: avg, source: 'AUCTIONS', sales }
  }
  const price = Math.max(0, Math.round(Number(listPrice) || 0))
  if (price > 0) return { value: price, source: 'PRICE', sales: 0 }
  return { value: 0, source: 'NONE', sales: 0 }
}
