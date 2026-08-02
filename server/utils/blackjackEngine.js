// server/utils/blackjackEngine.js
//
// Pure blackjack rules. No I/O, no randomness, no Prisma — a hand is advanced by handing
// `applyAction` the cards it should draw, so the same functions drive both the live table and
// the unit tests in tests/blackjackEngine.test.js.
//
// Cards are plain integers 0–51 so a whole hand serialises to a handful of bytes:
// rank = card % 13 (0 = Ace, 9 = Ten, 10 = Jack, 12 = King),
// suit = (card / 13) | 0 (0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades).
//
// Every payout in here is a NET delta in chips, signed from the player's point of view, and
// always an integer. The blackjack payout is stored as an integer ratio (3:2), never a float:
// `bet * 1.5` on an odd bet mints or destroys half a chip, and there is no float anywhere else
// in this app's points system. Bets are additionally constrained to multiples of BET_INCREMENT
// by the callers, which makes 3:2 and insurance-at-half exact for every legal wager.

import { randomInt } from 'node:crypto'

export const SUITS = ['C', 'D', 'H', 'S']
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Bets must be a multiple of this. 10 makes a 3:2 blackjack and an insurance side bet (half
// the wager) land on whole chips for every legal bet, so no rounding rule is ever needed.
export const BET_INCREMENT = 10

// The most a single hand can win, as a multiple of the base bet: split into two hands (×2),
// each doubled (×2). Insurance cannot add to this — it only pays when the dealer has a natural,
// which is exactly when the main bet loses, so the best insurance can do is break even.
//
// This is what the daily win cap has to be sized against. Checking "have we hit the cap yet?"
// before each bet lets a player sitting just under the cap win 4 × maxBet more, so a 900 cap
// would really pay out 900 + 4 × maxBet. `maxBetForHeadroom` below is the fix.
export const MAX_HAND_EXPOSURE = 4

// The most cards one hand can consume: two split hands of 11 (eleven aces is the longest
// non-busting hand) plus a dealer draw of 11, with slack. A hand is dealt from a freshly
// shuffled shoe, so only this many need to be cut from it.
export const CARDS_PER_HAND = 40

export const PHASE = {
  INSURANCE: 'insurance', // dealer shows an Ace; player may buy insurance before acting
  PLAYER: 'player',       // player is acting on hands[active]
  DEALER: 'dealer',       // player is done; dealer draws
  SETTLED: 'settled'
}

export const OUTCOME = {
  BLACKJACK: 'blackjack',
  WIN: 'win',
  PUSH: 'push',
  LOSE: 'lose',
  BUST: 'bust'
}

/**
 * Clamps admin-editable settings into ranges the table is known to behave in, and fills every
 * default. This is the single source of truth for both — the admin validation table in
 * server/api/admin/game-config.post.js mirrors these bounds, and this runs again on read so a
 * row written before those bounds existed still can't produce a broken table.
 * Mirrors normalizeConfig() in lib/asteroidSim.js.
 */
export function normalizeBlackjackConfig (raw = {}) {
  const int = (v, def, lo, hi) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return def
    return Math.min(hi, Math.max(lo, n))
  }
  const bool = (v, def) => (typeof v === 'boolean' ? v : def)

  // Bets are rounded DOWN to the increment so a clamp can never raise a limit.
  const toIncrement = (n) => Math.max(BET_INCREMENT, Math.floor(n / BET_INCREMENT) * BET_INCREMENT)

  const minBet = toIncrement(int(raw.blackjackMinBet, 10, BET_INCREMENT, 10_000))
  const maxBet = Math.max(minBet, toIncrement(int(raw.blackjackMaxBet, 100, BET_INCREMENT, 100_000)))

  return {
    dailyBuyInLimit: int(raw.blackjackDailyBuyInLimit, 300, 0, 1_000_000),
    dailyWinLimit:   int(raw.blackjackDailyWinLimit, 900, 0, 1_000_000),
    minBet,
    maxBet,
    practiceStack:   int(raw.blackjackPracticeStack, 1000, BET_INCREMENT, 1_000_000),
    deckCount:       int(raw.blackjackDeckCount, 6, 1, 8),
    payoutNum:       int(raw.blackjackPayoutNum, 3, 1, 3),
    payoutDen:       int(raw.blackjackPayoutDen, 2, 1, 2),
    dealerHitsSoft17: bool(raw.blackjackDealerHitsSoft17, false),
    allowDouble:     bool(raw.blackjackAllowDouble, true),
    allowSplit:      bool(raw.blackjackAllowSplit, true),
    allowInsurance:  bool(raw.blackjackAllowInsurance, true)
  }
}

/**
 * The 3:2 (or 6:5, or even-money) payout on a natural, in integer arithmetic.
 * Floors, so any residue from a misconfigured ratio favours the house rather than minting.
 */
export function blackjackPayout (bet, rules) {
  const num = rules.payoutNum ?? 3
  const den = rules.payoutDen ?? 2
  return Math.floor((bet * num) / den)
}

/**
 * The largest legal bet given the chips on hand and how much of the daily win cap is left.
 *
 * Dividing the remaining headroom by MAX_HAND_EXPOSURE is what actually holds the cap: it
 * guarantees that even the best possible outcome of the next hand — split, both hands doubled,
 * both winning — cannot carry the player past the limit. Returns 0 when no legal bet remains,
 * which the caller treats as "cap reached, cash out".
 */
export function maxBetForHeadroom (chips, headroom, rules) {
  const cap = Math.min(
    rules.maxBet,
    chips,
    Math.floor(Math.max(0, headroom) / MAX_HAND_EXPOSURE)
  )
  const floored = Math.floor(cap / BET_INCREMENT) * BET_INCREMENT
  return floored >= rules.minBet ? floored : 0
}

export function cardRank (card) { return card % 13 }
export function cardSuit (card) { return (card / 13) | 0 }

/** Display form, e.g. 42 -> { rank: 'A', suit: 'S' }. Used only when a card is public. */
export function describeCard (card) {
  return { rank: RANKS[cardRank(card)], suit: SUITS[cardSuit(card)] }
}

/** Blackjack value of a rank: Ace counts 11 here; `handValue` demotes it to 1 as needed. */
function rankValue (rank) {
  if (rank === 0) return 11
  return rank >= 9 ? 10 : rank + 1
}

/**
 * Best total for a hand, plus whether it is soft (an Ace still counting as 11).
 * Aces are added at 11 and demoted one at a time while the total busts, which is the standard
 * "one ace can be high at most" result without any search.
 */
export function handValue (cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    const r = cardRank(c)
    if (r === 0) aces++
    total += rankValue(r)
  }
  let soft = aces > 0
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
    soft = aces > 0
  }
  return { total, soft }
}

export function isBust (cards) { return handValue(cards).total > 21 }

/** A natural: exactly two cards totalling 21. A 21 assembled after a split is NOT a natural. */
export function isNatural (cards) {
  return cards.length === 2 && handValue(cards).total === 21
}

function isTenValue (card) { return cardRank(card) >= 9 }
function isAce (card) { return cardRank(card) === 0 }

/**
 * Starts a hand. `deal` is called four times and must return a card integer each time; the
 * order is player, dealer(up), player, dealer(hole) exactly as at a real table.
 *
 * Returns the full server-side hand state. It contains the dealer's hole card, so it must
 * never be handed to a client — use `publicView` for that.
 */
export function startHand (bet, rules, deal) {
  const p1 = deal(), d1 = deal(), p2 = deal(), d2 = deal()

  const state = {
    bet,
    hands: [makeHand([p1, p2], bet)],
    active: 0,
    dealer: [d1, d2],
    insuranceBet: 0,
    insuranceOffered: false,
    insuranceResolved: false,
    dealerNatural: false,
    phase: PHASE.PLAYER,
    results: null
  }

  // US-style peek. With an Ace up the player is offered insurance first; with a ten up the
  // dealer checks silently. Either way a dealer natural ends the hand before the player can
  // put more money at risk by doubling or splitting into it.
  if (rules.allowInsurance && isAce(d1)) {
    state.phase = PHASE.INSURANCE
    state.insuranceOffered = true
    return state
  }
  if (isAce(d1) || isTenValue(d1)) peek(state)
  // A dealer natural, or a player natural against a clean peek, is over before it starts.
  if (state.phase === PHASE.SETTLED || isNatural([p1, p2])) return finishHand(state, rules)

  return state
}

function makeHand (cards, bet) {
  return { cards, bet, doubled: false, stood: false, fromSplit: false, splitAces: false }
}

/** Resolves the dealer's natural check. Ends the hand immediately if the dealer has one. */
function peek (state) {
  if (!isNatural(state.dealer)) return
  state.dealerNatural = true
  state.phase = PHASE.SETTLED
}

/**
 * Which actions are legal right now. The server calls this before applying anything, so an
 * action the UI never offered is rejected rather than quietly accepted.
 */
export function legalActions (state, rules, chipsAvailable) {
  if (state.phase === PHASE.INSURANCE) {
    const cost = Math.floor(state.bet / 2)
    return chipsAvailable >= cost ? ['insurance', 'declineInsurance'] : ['declineInsurance']
  }
  if (state.phase !== PHASE.PLAYER) return []

  const hand = state.hands[state.active]
  if (!hand || hand.stood || isBust(hand.cards)) return []

  // Split aces receive exactly one card each and are then done — no hit, no double, no resplit.
  if (hand.splitAces) return []

  const actions = ['hit', 'stand']
  const twoCards = hand.cards.length === 2

  if (rules.allowDouble && twoCards && chipsAvailable >= hand.bet) actions.push('double')

  if (
    rules.allowSplit &&
    twoCards &&
    !hand.fromSplit &&                       // one split per hand, so at most two hands
    state.hands.length < 2 &&
    chipsAvailable >= hand.bet &&
    splittable(hand.cards)
  ) actions.push('split')

  return actions
}

/** Any two cards of equal blackjack value split, so K-Q is a splittable pair of tens. */
function splittable (cards) {
  const [a, b] = cards
  if (isAce(a) && isAce(b)) return true
  if (isAce(a) || isAce(b)) return false
  return rankValue(cardRank(a)) === rankValue(cardRank(b))
}

/**
 * Applies one player action and advances the hand as far as it can go without further input
 * (including playing out the dealer and settling once every hand is done).
 *
 * `deal` supplies cards on demand. Mutates and returns `state`.
 * Throws on an illegal action — callers surface that as a 400 rather than a corrupt table.
 */
export function applyAction (state, action, rules, chipsAvailable, deal) {
  const legal = legalActions(state, rules, chipsAvailable)
  if (!legal.includes(action)) {
    throw new Error(`Illegal action "${action}"`)
  }

  if (state.phase === PHASE.INSURANCE) {
    if (action === 'insurance') state.insuranceBet = Math.floor(state.bet / 2)
    state.insuranceResolved = true
    state.phase = PHASE.PLAYER
    peek(state)
    if (state.phase === PHASE.SETTLED) return finishHand(state, rules)
    // The peek came back clean, so a player natural can now stand itself up.
    if (isNatural(state.hands[0].cards)) return finishHand(state, rules)
    return state
  }

  const hand = state.hands[state.active]

  switch (action) {
    case 'hit':
      hand.cards.push(deal())
      if (isBust(hand.cards)) hand.stood = true
      break

    case 'stand':
      hand.stood = true
      break

    case 'double':
      hand.bet += hand.bet
      hand.doubled = true
      hand.cards.push(deal())
      hand.stood = true
      break

    case 'split': {
      const moved = hand.cards.pop()
      const acePair = isAce(moved)
      hand.fromSplit = true
      hand.splitAces = acePair
      hand.cards.push(deal())

      const second = makeHand([moved, deal()], hand.bet)
      second.fromSplit = true
      second.splitAces = acePair
      state.hands.push(second)
      break
    }
  }

  return advance(state, rules, deal)
}

/** Moves to the next hand that still needs a decision, or plays the dealer out. */
function advance (state, rules, deal) {
  while (state.active < state.hands.length) {
    const h = state.hands[state.active]
    // Split aces are dealt their one card and are finished; 21 needs no decision either.
    if (h.splitAces || h.stood || isBust(h.cards) || handValue(h.cards).total >= 21) {
      h.stood = true
      state.active++
      continue
    }
    return state // this hand is still live and awaiting input
  }

  state.phase = PHASE.DEALER
  playDealer(state, rules, deal)
  return finishHand(state, rules)
}

/**
 * Dealer draws to 17, hitting soft 17 only when the rules say so. Skipped entirely if every
 * player hand busted — the dealer has nothing left to beat, and drawing anyway would leak
 * shoe cards for no reason.
 */
function playDealer (state, rules, deal) {
  const anyLive = state.hands.some(h => !isBust(h.cards))
  if (!anyLive) return

  for (;;) {
    const { total, soft } = handValue(state.dealer)
    if (total > 21) return
    if (total > 17) return
    if (total === 17 && !(soft && rules.dealerHitsSoft17)) return
    if (total < 17 || (total === 17 && soft && rules.dealerHitsSoft17)) {
      state.dealer.push(deal())
      continue
    }
    return
  }
}

/** Scores every hand plus the insurance side bet and marks the hand settled. */
export function finishHand (state, rules) {
  const dealerNatural = isNatural(state.dealer)
  const dealerTotal = handValue(state.dealer).total
  const dealerBust = dealerTotal > 21

  const results = state.hands.map((hand) => {
    const playerTotal = handValue(hand.cards).total
    const playerNatural = isNatural(hand.cards) && !hand.fromSplit

    if (playerTotal > 21) {
      return { outcome: OUTCOME.BUST, payout: -hand.bet, total: playerTotal }
    }
    if (playerNatural && dealerNatural) {
      return { outcome: OUTCOME.PUSH, payout: 0, total: playerTotal }
    }
    if (playerNatural) {
      return {
        outcome: OUTCOME.BLACKJACK,
        payout: blackjackPayout(hand.bet, rules),
        total: playerTotal
      }
    }
    if (dealerNatural) {
      return { outcome: OUTCOME.LOSE, payout: -hand.bet, total: playerTotal }
    }
    if (dealerBust || playerTotal > dealerTotal) {
      return { outcome: OUTCOME.WIN, payout: hand.bet, total: playerTotal }
    }
    if (playerTotal === dealerTotal) {
      return { outcome: OUTCOME.PUSH, payout: 0, total: playerTotal }
    }
    return { outcome: OUTCOME.LOSE, payout: -hand.bet, total: playerTotal }
  })

  // Insurance is a separate wager: 2:1 when the dealer has a natural, otherwise it is lost.
  let insurancePayout = 0
  if (state.insuranceBet > 0) {
    insurancePayout = dealerNatural ? state.insuranceBet * 2 : -state.insuranceBet
  }

  state.results = results
  state.insurancePayout = insurancePayout
  state.netPayout = results.reduce((sum, r) => sum + r.payout, 0) + insurancePayout
  state.phase = PHASE.SETTLED
  return state
}

/** Total chips currently at risk — what `startHand`/`applyAction` has already taken. */
export function committedChips (state) {
  return state.hands.reduce((sum, h) => sum + h.bet, 0) + state.insuranceBet
}

/**
 * The ONLY shape that may be sent to a client.
 *
 * Everything the player is not entitled to see is dropped here rather than filtered at each
 * call site, so a new endpoint cannot leak the hole card by forgetting to strip it. While the
 * hand is live the dealer's second card is omitted entirely — not nulled, not sent face-down
 * with a value — and the shoe is never part of this object at all.
 */
export function publicView (state, rules, chipsAvailable) {
  const revealDealer = state.phase === PHASE.DEALER || state.phase === PHASE.SETTLED
  const dealerCards = revealDealer ? state.dealer : state.dealer.slice(0, 1)

  return {
    phase: state.phase,
    bet: state.bet,
    insuranceBet: state.insuranceBet,
    insuranceOffered: state.insuranceOffered && !state.insuranceResolved,
    active: state.active,
    hands: state.hands.map((h, i) => ({
      index: i,
      cards: h.cards.map(describeCard),
      total: handValue(h.cards).total,
      soft: handValue(h.cards).soft,
      bet: h.bet,
      doubled: h.doubled,
      blackjack: isNatural(h.cards) && !h.fromSplit,
      busted: isBust(h.cards),
      done: h.stood || isBust(h.cards)
    })),
    dealer: {
      cards: dealerCards.map(describeCard),
      // A concealed hole card means the visible total is all the player gets.
      total: handValue(dealerCards).total,
      soft: handValue(dealerCards).soft,
      hidden: !revealDealer,
      blackjack: revealDealer && isNatural(state.dealer),
      busted: revealDealer && isBust(state.dealer)
    },
    results: state.results,
    insurancePayout: state.insurancePayout ?? 0,
    netPayout: state.netPayout ?? 0,
    actions: legalActions(state, rules, chipsAvailable)
  }
}

// ── Shuffling ──────────────────────────────────────────────────────────────────
//
// A fresh shoe is shuffled for every hand — the behaviour of a continuous shuffling machine,
// and what every online RNG blackjack game does. Two reasons, and the second is the important
// one:
//
//  1. Nothing has to persist between hands, so a hand needs ~40 card integers of state instead
//     of a 312-element shoe rewritten on every action.
//  2. It makes card counting worthless. The published house edge for these rules is ~0.5%, and
//     a counter with a wide bet spread can swing that positive — at which point the daily
//     daily loss/win structure stops being a points sink and becomes a faucet. With the count
//     identically zero at every decision, the edge cannot be moved.
//
// Cards are never derived from Math.random(). Its state is recoverable from a handful of
// outputs, which against a shoe backing real points is a total-prediction attack.

/**
 * Cryptographically shuffled cards for a single hand.
 *
 * Backward Fisher–Yates with an exclusive bound that moves with `i` — the common bug is a
 * constant bound (`randomInt(0, n)` every iteration), which produces a measurably skewed
 * permutation distribution rather than a uniform one. `randomInt` itself rejection-samples,
 * so there is no modulo bias to correct; hand-rolling `randomBytes(1)[0] % 52` would introduce
 * one (256 is not a multiple of 52, biasing the first 48 cards by ~25%).
 */
export function shuffledHandCards (deckCount, randomIntFn) {
  const rnd = randomIntFn ?? randomInt
  const decks = Math.min(8, Math.max(1, Math.round(deckCount) || 6))

  const shoe = new Array(decks * 52)
  for (let d = 0; d < decks; d++) {
    for (let card = 0; card < 52; card++) shoe[d * 52 + card] = card
  }

  // Only the cards that can actually be dealt need to be settled, so the loop stops early.
  // Each iteration picks uniformly from the whole unshuffled remainder, so the prefix it
  // produces has exactly the distribution of a full shuffle's prefix.
  const needed = Math.min(CARDS_PER_HAND, shoe.length)
  for (let i = shoe.length - 1; i >= shoe.length - needed; i--) {
    const j = rnd(0, i + 1)
    const t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t
  }

  return shoe.slice(shoe.length - needed).reverse()
}

/**
 * Turns a shuffled array into the `deal` callback `startHand`/`applyAction` expect.
 *
 * The returned function carries a `dealt` count. Callers persist it so the next action resumes
 * from the right offset in the same shuffled run — without it, every action would re-deal from
 * the top and a player could hit the same card repeatedly.
 */
export function dealerFrom (cards) {
  const deal = () => {
    if (deal.dealt >= cards.length) throw new Error('Hand exhausted its cards')
    return cards[deal.dealt++]
  }
  deal.dealt = 0
  return deal
}
