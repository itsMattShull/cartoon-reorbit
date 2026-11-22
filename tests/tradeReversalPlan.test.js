// Pure decision logic of the admin Trade Reversal tool (server/utils/tradeReversalPlan.js): what goes back, what is
// skipped or paid for at fair market value, and the one netted points transfer. No database.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTradeReversalPlan,
  classifyReversalItem,
  pickFairMarketValue,
  REVERSAL_OUTCOME as O
} from '../server/utils/tradeReversalPlan.js'

const A = 'initiator'
const B = 'recipient'
const C = 'someone-else'

// A offered c1, c2, c3 and pack p1 plus 300 points; B gave c4 back and asked 50 points of A.
const offer = {
  id: 'o1',
  initiatorId: A,
  recipientId: B,
  pointsOffered: 300,
  pointsRequested: 50,
  ctoons: [
    { userCtoonId: 'c1', role: 'OFFERED', ctoonId: 't1' },
    { userCtoonId: 'c2', role: 'OFFERED', ctoonId: 't2' },
    { userCtoonId: 'c3', role: 'OFFERED', ctoonId: 't3' },
    { userCtoonId: 'c4', role: 'REQUESTED', ctoonId: 't4' }
  ],
  packs: [{ userPackId: 'p1', role: 'OFFERED', packId: 'k1' }]
}
const ctoonValues = new Map([['t1', 100], ['t2', 200], ['t3', 400], ['t4', 1000]])
const packValues = new Map([['k1', 250]])

const state = () => ({
  ctoonState: new Map([
    ['c1', { userId: B, burnedAt: null }],                 // still with the receiver -> returned
    ['c2', { userId: C, burnedAt: null }],                 // traded / auctioned away -> gone
    ['c3', { userId: B, burnedAt: null, inActiveAuction: true }], // listed by the receiver -> gone
    ['c4', { userId: A, burnedAt: null }]                  // still with its receiver (A) -> returned to B
  ]),
  packState: new Map([['p1', { userId: B, opened: true }]]) // opened by the receiver -> gone
})

const outcomeOf = (plan, id) => plan.items.find(i => i.id === id).outcome

test('fair market value OFF: items still with the receiver go back, gone items are skipped, trade points net out', () => {
  const plan = buildTradeReversalPlan({ offer, ...state(), ctoonValues, packValues, includeFairMarketValue: false })
  assert.equal(outcomeOf(plan, 'c1'), O.RETURN)
  assert.equal(outcomeOf(plan, 'c2'), O.SKIP)
  assert.equal(outcomeOf(plan, 'c3'), O.SKIP)
  assert.equal(outcomeOf(plan, 'c4'), O.RETURN)
  assert.equal(outcomeOf(plan, 'p1'), O.SKIP)
  // B returns A's 300, A returns B's 50 -> one transfer of 250 from B to A.
  assert.deepEqual(plan.points.net, { fromUserId: B, toUserId: A, amount: 250 })
  assert.equal(plan.points.fmvOwedByRecipient, 0)
  assert.deepEqual(
    [plan.counts.ctoonsReturned, plan.counts.ctoonsSkipped, plan.counts.packsSkipped, plan.counts.ctoonsValued],
    [2, 2, 1, 0]
  )
})

test('fair market value ON: the receiver of each gone item owes its value to the user who gave it', () => {
  const plan = buildTradeReversalPlan({ offer, ...state(), ctoonValues, packValues, includeFairMarketValue: true })
  assert.equal(outcomeOf(plan, 'c2'), O.FMV)
  assert.equal(outcomeOf(plan, 'c3'), O.FMV)
  assert.equal(outcomeOf(plan, 'p1'), O.FMV)
  // B owes 300 trade points + 200 (c2) + 400 (c3) + 250 (p1) = 1150; A owes 50. Net 1100 from B to A.
  assert.equal(plan.points.fmvOwedByRecipient, 850)
  assert.equal(plan.points.fmvOwedByInitiator, 0)
  assert.deepEqual(plan.points.net, { fromUserId: B, toUserId: A, amount: 1100 })
})

test('fair market value can make the initiator the payer', () => {
  const s = state()
  s.ctoonState.set('c4', { userId: C, burnedAt: null }) // A traded B's cToon away
  const plan = buildTradeReversalPlan({ offer, ...s, ctoonValues, packValues, includeFairMarketValue: true })
  // B owes 1150, A owes 50 + 1000 = 1050. Net 100 from B to A.
  assert.deepEqual(plan.points.net, { fromUserId: B, toUserId: A, amount: 100 })

  const small = buildTradeReversalPlan({
    offer: { ...offer, pointsOffered: 0, ctoons: [offer.ctoons[3]], packs: [] },
    ...s, ctoonValues, packValues, includeFairMarketValue: true
  })
  // Only A's debt: 50 trade points + 1000 value.
  assert.deepEqual(small.points.net, { fromUserId: A, toUserId: B, amount: 1050 })
})

test('an item the giver already has again needs nothing, with or without fair market value', () => {
  const s = state()
  s.ctoonState.set('c1', { userId: A, burnedAt: null })
  for (const includeFairMarketValue of [false, true]) {
    const plan = buildTradeReversalPlan({ offer, ...s, ctoonValues, packValues, includeFairMarketValue })
    assert.equal(outcomeOf(plan, 'c1'), O.ALREADY_BACK)
  }
})

test('no points to move when the debts cancel', () => {
  const plan = buildTradeReversalPlan({
    offer: { ...offer, pointsOffered: 50, pointsRequested: 50, ctoons: [], packs: [] },
    ctoonState: new Map(), packState: new Map(), ctoonValues, packValues, includeFairMarketValue: true
  })
  assert.deepEqual(plan.points.net, { fromUserId: null, toUserId: null, amount: 0 })
})

test('classification covers every way an item can be gone', () => {
  const who = { originalOwnerId: A, receiverId: B, isPack: false }
  assert.equal(classifyReversalItem(undefined, who).reason.code, 'MISSING')
  assert.equal(classifyReversalItem({ userId: B, burnedAt: new Date() }, who).reason.code, 'BURNED')
  assert.equal(classifyReversalItem({ userId: B, frozen: true }, who).reason.code, 'FROZEN')
  assert.equal(classifyReversalItem({ userId: B, inActiveAuction: true }, who).reason.code, 'IN_AUCTION')
  assert.equal(classifyReversalItem({ userId: C }, who).reason.code, 'MOVED_ON')
  assert.equal(classifyReversalItem({ userId: B }, who).kind, 'RETURN')
  const pack = { ...who, isPack: true }
  assert.equal(classifyReversalItem({ userId: B, opened: true }, pack).reason.code, 'OPENED')
  assert.equal(classifyReversalItem({ userId: C, opened: true }, pack).reason.code, 'MOVED_ON')
  assert.equal(classifyReversalItem({ userId: B, opened: false }, pack).kind, 'RETURN')
})

test('fair market value: recent sales average, else list price, else 0', () => {
  assert.deepEqual(pickFairMarketValue([100, 200, 301], 50), { value: 200, source: 'AUCTIONS', sales: 3 })
  assert.deepEqual(pickFairMarketValue([], 75), { value: 75, source: 'PRICE', sales: 0 })
  assert.deepEqual(pickFairMarketValue([], 0), { value: 0, source: 'NONE', sales: 0 })
})
