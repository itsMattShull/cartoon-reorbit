import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handValue, isNatural, isBust, startHand, applyAction, legalActions,
  publicView, committedChips, describeCard, PHASE, OUTCOME,
  normalizeBlackjackConfig, maxBetForHeadroom, shuffledHandCards, dealerFrom,
  blackjackPayout, cardRank, BET_INCREMENT, CARDS_PER_HAND, MAX_HAND_EXPOSURE
} from '../server/utils/blackjackEngine.js'

// Card integers: rank = card % 13 (0 = Ace, 9 = Ten, 10 = J, 11 = Q, 12 = K),
// suit = (card / 13) | 0. These helpers keep the tests readable.
const RANK = { A: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, J: 10, Q: 11, K: 12 }
const c = (rank, suit = 0) => suit * 13 + RANK[rank]

const RULES = {
  allowDouble: true,
  allowSplit: true,
  allowInsurance: true,
  dealerHitsSoft17: false,
  payoutNum: 3,
  payoutDen: 2
}

/** Deals the given cards in order; throws if the engine asks for more than were scripted. */
function scripted (cards) {
  let i = 0
  return () => {
    if (i >= cards.length) throw new Error('deal() called more times than the test scripted')
    return cards[i++]
  }
}

// ── handValue ──────────────────────────────────────────────────────────────────

test('handValue: hard totals', () => {
  assert.deepEqual(handValue([c(10), c(7)]), { total: 17, soft: false })
  assert.deepEqual(handValue([c('K'), c('Q')]), { total: 20, soft: false })
  assert.deepEqual(handValue([c(2), c(3), c(4)]), { total: 9, soft: false })
})

test('handValue: an ace is 11 until it would bust', () => {
  assert.deepEqual(handValue([c('A'), c(6)]), { total: 17, soft: true })
  assert.deepEqual(handValue([c('A'), c(6), c(10)]), { total: 17, soft: false })
})

test('handValue: only one ace can stay high', () => {
  assert.deepEqual(handValue([c('A'), c('A')]), { total: 12, soft: true })
  assert.deepEqual(handValue([c('A'), c('A'), c('A')]), { total: 13, soft: true })
  // Four aces plus a seven: 11+1+1+1+7 = 21, still soft.
  assert.deepEqual(handValue([c('A'), c('A'), c('A'), c('A'), c(7)]), { total: 21, soft: true })
})

test('handValue: all face cards are worth ten', () => {
  for (const r of ['10', 'J', 'Q', 'K']) {
    assert.equal(handValue([c(r), c(9)]).total, 19, `${r} should be worth 10`)
  }
})

test('isNatural: exactly two cards totalling 21', () => {
  assert.equal(isNatural([c('A'), c('K')]), true)
  assert.equal(isNatural([c(7), c(7), c(7)]), false, 'three sevens is 21 but not a natural')
  assert.equal(isNatural([c('A'), c(5), c(5)]), false)
})

test('isBust', () => {
  assert.equal(isBust([c('K'), c('Q'), c(5)]), true)
  assert.equal(isBust([c('K'), c('A')]), false)
})

// ── dealing and naturals ───────────────────────────────────────────────────────

test('startHand deals player, dealer, player, dealer in table order', () => {
  // p1=2, d1=3, p2=4, d2=5
  const s = startHand(100, RULES, scripted([c(2), c(3), c(4), c(5)]))
  assert.deepEqual(s.hands[0].cards, [c(2), c(4)])
  assert.deepEqual(s.dealer, [c(3), c(5)])
  assert.equal(s.phase, PHASE.PLAYER)
})

test('player natural against a non-natural dealer settles immediately at 3:2', () => {
  const s = startHand(100, RULES, scripted([c('A'), c(9), c('K'), c(7)]))
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.results[0].outcome, OUTCOME.BLACKJACK)
  assert.equal(s.netPayout, 150)
})

test('dealer natural on a ten upcard ends the hand before the player acts', () => {
  const s = startHand(100, RULES, scripted([c(9), c('K'), c(8), c('A')]))
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.results[0].outcome, OUTCOME.LOSE)
  assert.equal(s.netPayout, -100)
})

test('both naturals push', () => {
  const s = startHand(100, RULES, scripted([c('A'), c('K'), c('Q'), c('A')]))
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.results[0].outcome, OUTCOME.PUSH)
  assert.equal(s.netPayout, 0)
})

// ── insurance ──────────────────────────────────────────────────────────────────

test('an ace upcard offers insurance before any other action', () => {
  const s = startHand(100, RULES, scripted([c(9), c('A'), c(7), c(5)]))
  assert.equal(s.phase, PHASE.INSURANCE)
  assert.deepEqual(legalActions(s, RULES, 1000), ['insurance', 'declineInsurance'])
})

test('insurance is not offered when the player cannot cover it', () => {
  const s = startHand(100, RULES, scripted([c(9), c('A'), c(7), c(5)]))
  assert.deepEqual(legalActions(s, RULES, 10), ['declineInsurance'])
})

test('taken insurance pays 2:1 when the dealer has a natural', () => {
  let s = startHand(100, RULES, scripted([c(9), c('A'), c(7), c('K')]))
  s = applyAction(s, 'insurance', RULES, 1000, scripted([]))
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.insuranceBet, 50)
  assert.equal(s.insurancePayout, 100)
  // Main bet lost, insurance won: a wash, which is the whole point of the bet.
  assert.equal(s.netPayout, 0)
})

test('taken insurance is lost when the dealer has no natural', () => {
  let s = startHand(100, RULES, scripted([c(9), c('A'), c(7), c(5)]))
  s = applyAction(s, 'insurance', RULES, 1000, scripted([]))
  assert.equal(s.phase, PHASE.PLAYER, 'play continues after a failed peek')
  assert.equal(s.insuranceBet, 50)
  // Player stands on 16, dealer has A+5 = 16 soft, draws to 17 and wins.
  s = applyAction(s, 'stand', RULES, 1000, scripted([c('A')]))
  assert.equal(s.insurancePayout, -50)
  assert.equal(s.netPayout, -150)
})

test('declining insurance moves straight to player action', () => {
  let s = startHand(100, RULES, scripted([c(9), c('A'), c(7), c(5)]))
  s = applyAction(s, 'declineInsurance', RULES, 1000, scripted([]))
  assert.equal(s.phase, PHASE.PLAYER)
  assert.equal(s.insuranceBet, 0)
})

test('insurance is skipped entirely when the rules disable it', () => {
  const rules = { ...RULES, allowInsurance: false }
  const s = startHand(100, rules, scripted([c(9), c('A'), c(7), c(5)]))
  assert.equal(s.phase, PHASE.PLAYER)
  assert.equal(s.insuranceOffered, false)
})

// ── hitting, standing, busting ─────────────────────────────────────────────────

test('hitting into a bust loses the bet without the dealer drawing', () => {
  let s = startHand(100, RULES, scripted([c('K'), c(6), c(9), c(7)]))
  const dealerBefore = [...s.dealer]
  s = applyAction(s, 'hit', RULES, 900, scripted([c(5)]))
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.results[0].outcome, OUTCOME.BUST)
  assert.equal(s.netPayout, -100)
  assert.deepEqual(s.dealer, dealerBefore, 'dealer must not draw once every hand has busted')
})

test('reaching 21 by hitting stands automatically', () => {
  let s = startHand(100, RULES, scripted([c(5), c(6), c(6), c(9)]))
  // 5+6 = 11, hit a ten -> 21, no further decision.
  s = applyAction(s, 'hit', RULES, 900, scripted([c('K'), c('K')]))
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.results[0].outcome, OUTCOME.WIN)
  assert.equal(s.results[0].total, 21)
})

test('dealer stands on soft 17 by default and hits it under H17', () => {
  // Dealer holds A+6 (soft 17) in both branches; only the rule differs.
  let stand = startHand(100, RULES, scripted([c('K'), c(6), c(9), c('A')]))
  stand = applyAction(stand, 'stand', RULES, 900, scripted([]))
  assert.equal(handValue(stand.dealer).total, 17, 'S17 dealer must not draw on soft 17')
  assert.equal(stand.results[0].outcome, OUTCOME.WIN, '19 beats 17')

  const H17 = { ...RULES, dealerHitsSoft17: true }
  let hit = startHand(100, H17, scripted([c('K'), c(6), c(9), c('A')]))
  hit = applyAction(hit, 'stand', H17, 900, scripted([c(3)]))
  assert.equal(handValue(hit.dealer).total, 20, 'H17 dealer draws the 3 to soft 20')
  assert.equal(hit.results[0].outcome, OUTCOME.LOSE)
})

test('dealer busting wins every surviving hand', () => {
  let s = startHand(100, RULES, scripted([c(5), c('K'), c(7), c(6)]))
  s = applyAction(s, 'stand', RULES, 900, scripted([c('K')]))
  assert.equal(isBust(s.dealer), true)
  assert.equal(s.results[0].outcome, OUTCOME.WIN)
  assert.equal(s.netPayout, 100)
})

test('equal totals push', () => {
  let s = startHand(100, RULES, scripted([c('K'), c(9), c(9), c('K')]))
  s = applyAction(s, 'stand', RULES, 900, scripted([]))
  assert.equal(s.results[0].outcome, OUTCOME.PUSH)
  assert.equal(s.netPayout, 0)
})

// ── doubling ───────────────────────────────────────────────────────────────────

test('double takes exactly one card, doubles the bet and ends the hand', () => {
  let s = startHand(100, RULES, scripted([c(6), c(9), c(5), c(7)]))
  assert.ok(legalActions(s, RULES, 900).includes('double'))
  s = applyAction(s, 'double', RULES, 900, scripted([c('K'), c('K')]))
  assert.equal(s.hands[0].bet, 200)
  assert.equal(s.hands[0].cards.length, 3)
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.netPayout, 200, 'doubled 21 against a dealer 19 pays the doubled bet')
})

test('double is unavailable after hitting, and when chips are short', () => {
  let s = startHand(100, RULES, scripted([c(6), c(9), c(5), c(7)]))
  assert.equal(legalActions(s, RULES, 50).includes('double'), false, 'not enough chips')

  s = applyAction(s, 'hit', RULES, 900, scripted([c(2)]))
  assert.equal(legalActions(s, RULES, 900).includes('double'), false, 'three cards already')
})

test('a doubled bust loses the doubled amount', () => {
  let s = startHand(100, RULES, scripted([c(6), c(9), c(5), c(7)]))
  s = applyAction(s, 'double', RULES, 900, scripted([c('K'), c('K'), c('K')]))
  // 6+5+K = 21 -> not a bust. Use a hand that does bust:
  let b = startHand(100, RULES, scripted([c(9), c(9), c(8), c(7)]))
  b = applyAction(b, 'double', RULES, 900, scripted([c('K')]))
  assert.equal(b.results[0].outcome, OUTCOME.BUST)
  assert.equal(b.netPayout, -200)
})

// ── splitting ──────────────────────────────────────────────────────────────────

test('split creates a second hand, each matching the original bet', () => {
  let s = startHand(100, RULES, scripted([c(8), c(9), c(8), c(7)]))
  assert.ok(legalActions(s, RULES, 900).includes('split'))
  s = applyAction(s, 'split', RULES, 900, scripted([c(3), c(2)]))
  assert.equal(s.hands.length, 2)
  assert.deepEqual(s.hands[0].cards, [c(8), c(3)])
  assert.deepEqual(s.hands[1].cards, [c(8), c(2)])
  assert.equal(s.hands[1].bet, 100)
  assert.equal(committedChips(s), 200)
  assert.equal(s.active, 0, 'play resumes on the first split hand')
})

test('any two ten-value cards split', () => {
  const s = startHand(100, RULES, scripted([c('K'), c(9), c('Q'), c(7)]))
  assert.ok(legalActions(s, RULES, 900).includes('split'), 'K-Q is a pair of tens')
})

test('unequal cards do not split, and an ace never pairs with a ten', () => {
  const mixed = startHand(100, RULES, scripted([c(8), c(9), c(9), c(7)]))
  assert.equal(legalActions(mixed, RULES, 900).includes('split'), false)

  const aceTen = startHand(100, RULES, scripted([c('A'), c(9), c('K'), c(7)]))
  // That's a natural, so it settles — but the guard is what matters:
  assert.equal(aceTen.phase, PHASE.SETTLED)
})

test('split aces take one card each and cannot be hit or resplit', () => {
  let s = startHand(100, RULES, scripted([c('A'), c(9), c('A'), c(7)]))
  s = applyAction(s, 'split', RULES, 900, scripted([c(5), c('A'), c('K')]))
  // Both hands are dealt and closed out, dealer plays, hand settles.
  assert.equal(s.phase, PHASE.SETTLED)
  assert.equal(s.hands[0].cards.length, 2)
  assert.equal(s.hands[1].cards.length, 2)
  assert.equal(s.hands.every(h => h.splitAces), true)
})

test('21 on a split hand is not a natural and pays even money', () => {
  let s = startHand(100, RULES, scripted([c('K'), c(9), c('Q'), c(7)]))
  s = applyAction(s, 'split', RULES, 900, scripted([c('A'), c(5)]))
  // Hand 0 = K + A = 21 (auto-stands, NOT a natural). Hand 1 = Q + 5 = 15.
  assert.equal(s.hands[0].cards.length, 2)
  s = applyAction(s, 'stand', RULES, 800, scripted([c(2)])) // dealer 9+7=16, draws 2 -> 18
  assert.equal(s.results[0].outcome, OUTCOME.WIN, '21 beats 18')
  assert.equal(s.results[0].payout, 100, 'even money, not 150')
})

test('a hand may only be split once', () => {
  let s = startHand(100, RULES, scripted([c(8), c(9), c(8), c(7)]))
  s = applyAction(s, 'split', RULES, 900, scripted([c(8), c(2)]))
  // Hand 0 is now 8,8 again — but it already came from a split.
  assert.equal(legalActions(s, RULES, 900).includes('split'), false)
})

test('split hands are settled independently against the dealer', () => {
  let s = startHand(100, RULES, scripted([c(8), c(6), c(8), c('K')]))
  s = applyAction(s, 'split', RULES, 900, scripted([c('K'), c(2)]))
  // Hand 0 = 8+K = 18. Hand 1 = 8+2 = 10.
  s = applyAction(s, 'stand', RULES, 800, scripted([]))
  assert.equal(s.active, 1)
  s = applyAction(s, 'hit', RULES, 800, scripted([c(5)]))   // hand 1 -> 15
  s = applyAction(s, 'stand', RULES, 800, scripted([c(2)])) // dealer 6+K=16, draws 2 -> 18
  assert.equal(handValue(s.dealer).total, 18)
  assert.equal(s.results[0].outcome, OUTCOME.PUSH, '18 vs 18')
  assert.equal(s.results[1].outcome, OUTCOME.LOSE, '15 vs 18')
  assert.equal(s.netPayout, -100)
})

test('the dealer still draws when one split hand busts and the other lives', () => {
  let s = startHand(100, RULES, scripted([c(8), c(6), c(8), c(9)]))
  s = applyAction(s, 'split', RULES, 900, scripted([c('K'), c('K')]))
  // Both hands 18. Bust the first deliberately.
  s = applyAction(s, 'hit', RULES, 800, scripted([c('K')]))   // hand 0 -> 28, bust
  assert.equal(s.active, 1)
  s = applyAction(s, 'stand', RULES, 800, scripted([c(4)])) // dealer 6+9=15, draws 4 -> 19
  assert.equal(handValue(s.dealer).total, 19)
  assert.equal(s.results[0].outcome, OUTCOME.BUST)
  assert.equal(s.results[1].outcome, OUTCOME.LOSE)
})

// ── rule toggles ───────────────────────────────────────────────────────────────

test('disabled rules remove their actions', () => {
  const noDouble = startHand(100, { ...RULES, allowDouble: false }, scripted([c(6), c(9), c(5), c(7)]))
  assert.equal(legalActions(noDouble, RULES, 900).includes('double'), true, 'legalActions uses the rules passed to IT')
  assert.equal(legalActions(noDouble, { ...RULES, allowDouble: false }, 900).includes('double'), false)

  const s = startHand(100, RULES, scripted([c(8), c(9), c(8), c(7)]))
  assert.equal(legalActions(s, { ...RULES, allowSplit: false }, 900).includes('split'), false)
})

test('blackjack payout is configurable and always lands on a whole chip', () => {
  const evenMoney = startHand(100, { ...RULES, payoutNum: 1, payoutDen: 1 }, scripted([c('A'), c(9), c('K'), c(7)]))
  assert.equal(evenMoney.netPayout, 100)

  // 3:2 is the default and the one the table advertises.
  const threeToTwo = startHand(100, RULES, scripted([c('A'), c(9), c('K'), c(7)]))
  assert.equal(threeToTwo.netPayout, 150)
})

test('every payout is an integer for any bet that is a multiple of ten', () => {
  for (let bet = 10; bet <= 500; bet += 10) {
    const s = startHand(bet, RULES, scripted([c('A'), c(9), c('K'), c(7)]))
    assert.equal(Number.isInteger(s.netPayout), true, `bet ${bet} produced ${s.netPayout}`)
  }
})

// ── illegal actions ────────────────────────────────────────────────────────────

test('illegal actions throw rather than corrupting the table', () => {
  const s = startHand(100, RULES, scripted([c(6), c(9), c(5), c(7)]))
  assert.throws(() => applyAction(s, 'insurance', RULES, 900, scripted([])), /Illegal action/)
  assert.throws(() => applyAction(s, 'split', RULES, 900, scripted([])), /Illegal action/)
  assert.throws(() => applyAction(s, 'nonsense', RULES, 900, scripted([])), /Illegal action/)
})

test('no action is legal once the hand is settled', () => {
  let s = startHand(100, RULES, scripted([c('K'), c(9), c(9), c('K')]))
  s = applyAction(s, 'stand', RULES, 900, scripted([]))
  assert.deepEqual(legalActions(s, RULES, 900), [])
  assert.throws(() => applyAction(s, 'hit', RULES, 900, scripted([])), /Illegal action/)
})

// ── publicView: the hole card must not escape ──────────────────────────────────

test('publicView hides the hole card while the hand is live', () => {
  const s = startHand(100, RULES, scripted([c(6), c(9), c(5), c(7)]))
  const view = publicView(s, RULES, 900)

  assert.equal(view.dealer.cards.length, 1, 'only the upcard is sent')
  assert.deepEqual(view.dealer.cards[0], describeCard(c(9)))
  assert.equal(view.dealer.hidden, true)
  assert.equal(view.dealer.total, 9, 'visible total only')

  // The strongest form of the check: the hole card must not appear anywhere in the payload.
  const serialized = JSON.stringify(view)
  assert.equal(serialized.includes('"shoe"'), false)
  assert.equal(Object.hasOwn(view, 'dealerNatural'), false)
  assert.deepEqual(
    view.dealer.cards.map(x => `${x.rank}${x.suit}`),
    ['9C'],
    'exactly one dealer card, no placeholder for the hole card'
  )
})

test('publicView reveals the full dealer hand once settled', () => {
  let s = startHand(100, RULES, scripted([c('K'), c(9), c(9), c('K')]))
  s = applyAction(s, 'stand', RULES, 900, scripted([]))
  const view = publicView(s, RULES, 900)
  assert.equal(view.dealer.cards.length, 2)
  assert.equal(view.dealer.hidden, false)
  assert.equal(view.dealer.total, 19)
})

test('publicView never leaks the hole card at any point in a full hand', () => {
  // Dealer hole card is the king of spades; it must be absent until the reveal.
  const hole = c('K', 3)
  let s = startHand(100, RULES, scripted([c(6), c(9), c(5), hole, c(2), c(3)]))
  const holeStr = JSON.stringify(describeCard(hole))

  assert.equal(JSON.stringify(publicView(s, RULES, 900)).includes(holeStr), false)
  s = applyAction(s, 'hit', RULES, 900, scripted([c(2)]))
  assert.equal(JSON.stringify(publicView(s, RULES, 900)).includes(holeStr), false)
  s = applyAction(s, 'stand', RULES, 900, scripted([c(3)]))
  assert.equal(JSON.stringify(publicView(s, RULES, 900)).includes(holeStr), true, 'revealed at settle')
})

test('publicView reports only the actions the engine would accept', () => {
  const s = startHand(100, RULES, scripted([c(8), c(9), c(8), c(7)]))
  assert.deepEqual(publicView(s, RULES, 900).actions, legalActions(s, RULES, 900))
  assert.deepEqual(publicView(s, RULES, 0).actions, ['hit', 'stand'], 'no chips, no double or split')
})

// ── config normalization ───────────────────────────────────────────────────────

test('normalizeBlackjackConfig fills defaults for an empty row', () => {
  const cfg = normalizeBlackjackConfig({})
  assert.equal(cfg.dailyBuyInLimit, 1000)
  assert.equal(cfg.dailyWinLimit, 3000)
  assert.equal(cfg.minBet, 10)
  assert.equal(cfg.maxBet, 500)
  assert.equal(cfg.deckCount, 6)
  assert.equal(cfg.dealerHitsSoft17, false)
  assert.equal(blackjackPayout(100, cfg), 150, 'defaults to 3:2')
})

test('normalizeBlackjackConfig clamps hostile values instead of trusting them', () => {
  const cfg = normalizeBlackjackConfig({
    blackjackMaxBet: 2_000_000_000,
    blackjackDeckCount: 999,
    blackjackMinBet: -50,
    blackjackDailyWinLimit: Number.POSITIVE_INFINITY,
    blackjackPayoutNum: 50,
    blackjackPayoutDen: 0
  })
  assert.equal(cfg.maxBet, 100_000)
  assert.equal(cfg.deckCount, 8)
  assert.equal(cfg.minBet, BET_INCREMENT)
  assert.equal(cfg.dailyWinLimit, 3000, 'Infinity falls back to the default')
  assert.equal(cfg.payoutNum, 3)
  assert.equal(cfg.payoutDen, 1)
})

test('normalizeBlackjackConfig never lets maxBet fall below minBet', () => {
  const cfg = normalizeBlackjackConfig({ blackjackMinBet: 500, blackjackMaxBet: 20 })
  assert.ok(cfg.maxBet >= cfg.minBet)
})

test('normalizeBlackjackConfig snaps bets to the increment', () => {
  const cfg = normalizeBlackjackConfig({ blackjackMinBet: 37, blackjackMaxBet: 499 })
  assert.equal(cfg.minBet % BET_INCREMENT, 0)
  assert.equal(cfg.maxBet % BET_INCREMENT, 0)
  assert.ok(cfg.maxBet <= 499, 'clamping must round down, never up')
})

// ── the daily win cap ──────────────────────────────────────────────────────────

test('maxBetForHeadroom keeps the best possible hand inside the cap', () => {
  const rules = normalizeBlackjackConfig({})

  // Plenty of headroom: capped by maxBet and chips, not the cap.
  assert.equal(maxBetForHeadroom(10_000, 3000, rules), 500)
  assert.equal(maxBetForHeadroom(120, 3000, rules), 120)

  // This is the bug the helper exists to prevent: at +2999 of a 3000 cap, a naive
  // "have we hit it yet?" check would allow a 500 bet, which can win 4 x 500 = 2000.
  assert.equal(maxBetForHeadroom(10_000, 1, rules), 0, 'no legal bet remains')

  // 400 of headroom permits at most 100, because 100 can win 400.
  assert.equal(maxBetForHeadroom(10_000, 400, rules), 100)
})

test('no bet permitted by maxBetForHeadroom can breach the cap', () => {
  const rules = normalizeBlackjackConfig({})
  for (let headroom = 0; headroom <= 3000; headroom += 10) {
    const bet = maxBetForHeadroom(100_000, headroom, rules)
    if (bet === 0) continue
    assert.ok(
      bet * MAX_HAND_EXPOSURE <= headroom,
      `bet ${bet} against headroom ${headroom} could win ${bet * MAX_HAND_EXPOSURE}`
    )
  }
})

test('a blackjack payout also fits inside the permitted headroom', () => {
  const rules = normalizeBlackjackConfig({})
  for (let headroom = 0; headroom <= 3000; headroom += 10) {
    const bet = maxBetForHeadroom(100_000, headroom, rules)
    if (bet === 0) continue
    assert.ok(blackjackPayout(bet, rules) <= headroom)
  }
})

// ── shuffling ──────────────────────────────────────────────────────────────────

test('a shuffled hand supplies the right number of real cards', () => {
  const cards = shuffledHandCards(6)
  assert.equal(cards.length, CARDS_PER_HAND)
  assert.ok(cards.every(c => Number.isInteger(c) && c >= 0 && c < 52 * 6))
})

test('a multi-deck hand never deals a card more often than the shoe contains it', () => {
  // A 6-deck shoe legitimately holds six copies of each card, so repeats are expected —
  // what must never happen is a seventh.
  for (const decks of [1, 2, 6, 8]) {
    for (let trial = 0; trial < 100; trial++) {
      const counts = new Map()
      for (const card of shuffledHandCards(decks)) {
        counts.set(card, (counts.get(card) || 0) + 1)
      }
      for (const [card, n] of counts) {
        assert.ok(n <= decks, `card ${card} dealt ${n} times from a ${decks}-deck shoe`)
      }
    }
  }
})

test('a single deck can never deal the same physical card twice', () => {
  for (let trial = 0; trial < 200; trial++) {
    const cards = shuffledHandCards(1)
    assert.equal(new Set(cards).size, cards.length)
    assert.ok(cards.every(c => c < 52))
  }
})

test('the shuffle is uniform, not the constant-bound Fisher-Yates bug', () => {
  // The classic bug is a fixed upper bound (`randomInt(0, n)` every iteration) instead of one
  // that shrinks with the loop counter. It still returns a permutation, so a smoke test passes
  // — but the distribution is measurably lopsided. Deal one card off a single deck many times
  // and every one of the 52 values should come up about equally often.
  const TRIALS = 52 * 1200
  const counts = new Array(52).fill(0)
  for (let i = 0; i < TRIALS; i++) counts[shuffledHandCards(1)[0]]++

  const mean = TRIALS / 52
  for (let card = 0; card < 52; card++) {
    assert.ok(
      counts[card] > mean * 0.8 && counts[card] < mean * 1.2,
      `card ${card} came up ${counts[card]} times against a mean of ${mean}`
    )
  }
})

test('every position in the dealt run is equally likely to hold a given card', () => {
  // The complementary check: a biased shuffle tends to leave low indices near where they
  // started, so track where card 0 lands across many single-deck shuffles.
  const TRIALS = 40_000
  const positions = new Array(CARDS_PER_HAND).fill(0)
  let seen = 0
  for (let i = 0; i < TRIALS; i++) {
    const idx = shuffledHandCards(1).indexOf(0)
    if (idx >= 0) { positions[idx]++; seen++ }
  }

  const mean = seen / CARDS_PER_HAND
  for (let pos = 0; pos < CARDS_PER_HAND; pos++) {
    assert.ok(
      positions[pos] > mean * 0.7 && positions[pos] < mean * 1.3,
      `position ${pos} held card 0 ${positions[pos]} times against a mean of ${mean.toFixed(0)}`
    )
  }
})

test('an injected RNG makes shuffles reproducible for testing', () => {
  const fixed = () => 0 // always swap with index 0
  const a = shuffledHandCards(1, fixed)
  const b = shuffledHandCards(1, fixed)
  assert.deepEqual(a, b)
})

test('dealerFrom hands out cards in order and refuses to over-draw', () => {
  const deal = dealerFrom([5, 9, 12])
  assert.equal(deal(), 5)
  assert.equal(deal(), 9)
  assert.equal(deal(), 12)
  assert.throws(() => deal(), /exhausted/)
})

test('a full hand never exhausts its shuffled cards', () => {
  const rules = normalizeBlackjackConfig({})
  for (let trial = 0; trial < 500; trial++) {
    const deal = dealerFrom(shuffledHandCards(rules.deckCount))
    let state = startHand(100, rules, deal)
    let guard = 0
    while (state.phase !== PHASE.SETTLED && guard++ < 40) {
      const actions = legalActions(state, rules, 10_000)
      if (!actions.length) break
      // Bias toward the branches that consume the most cards.
      const action = actions.includes('split') ? 'split'
        : actions.includes('hit') ? 'hit'
        : actions[0]
      state = applyAction(state, action, rules, 10_000, deal)
    }
    assert.equal(state.phase, PHASE.SETTLED)
  }
})
