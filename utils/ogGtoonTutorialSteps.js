// utils/ogGtoonTutorialSteps.js
//
// The guided steps of the original gToons (2002) tutorial. Pure data and pure functions (no Vue, no
// DOM) so the overlay (components/oggtoons/OgGtoonTutorial.vue) and the tests share one definition.
// The match they walk through is scripted on the server (server/utils/ogGtoonTutorialScript.js), so
// card names, slots and numbers in the text are exact — keep the two in step; tests/ogGtoonTutorial
// Steps.test.js plays the whole script and fails if they drift.
//
// A step is either:
//   info   — explains something; the player taps its button to move on.
//   action — asks for one tap on a highlighted element; everything else is locked until it is done.
// Fields: id, stage, kind, title, text, target (a data-tut name, a list of names — the first one on
// screen wins — or null for a centred card), ready(ctx) (hold the step back until true, e.g. while a
// reveal is still animating), done(ctx) (action steps), button (info steps).
//
// `ctx` is what the board knows: { m: the player's match view, sel: the selected hand card's deck
// index or null, tab: 'log' | 'info', swapSheetOpen, discardPick: [deck idx], flipping: a reveal is
// animating, ended: the match is over }.

/** Coarse position in the match; steps from an earlier stage are skipped (e.g. after a refresh). */
export const STAGES = { ROUND_1: 0, DISCARD: 1, ROUND_2: 2, SWAP: 3, COLOR: 4, ENDED: 5 }

export function stageOf(ctx) {
  const m = ctx?.m
  if (!m) return STAGES.ROUND_1
  if (ctx.ended) return STAGES.ENDED
  if (m.phase === 'color') return STAGES.COLOR
  if (m.phase === 'swap') return STAGES.SWAP
  if (m.phase === 'discard') return STAGES.DISCARD
  return m.round >= 2 ? STAGES.ROUND_2 : STAGES.ROUND_1
}

const placedAt = (ctx, cardIdx, slot) => !!ctx.m?.you?.placements?.some(p => p.cardIdx === cardIdx && p.slot === slot)
const slotEmpty = (ctx, slot) => !ctx.m?.you?.placements?.some(p => p.slot === slot)
const settled = (ctx) => !ctx.flipping

/** A "tap this hand card" step: done once it is selected, or already on the board. */
const pick = (id, stage, cardIdx, slot, title, text) => ({
  id, stage, kind: 'action', title, text, target: `hand-${cardIdx}`,
  done: (c) => c.sel === cardIdx || placedAt(c, cardIdx, slot)
})
/** A "tap this slot" step: done once the card sits there. */
const put = (id, stage, cardIdx, slot, title, text) => ({
  id, stage, kind: 'action', title, text, target: `slot-you-${slot}`,
  done: (c) => placedAt(c, cardIdx, slot)
})

export const TUTORIAL_STEPS = [
  /* ── Round 1: slots 1-4 ─────────────────────────────────────────────────────────────── */
  {
    id: 'welcome', stage: 0, kind: 'info', target: null, button: "Let's go",
    title: 'Welcome to gToons!',
    text: "This is a real match against the Tutorial Bot, played with a deck we've lent you. There are no timers, and nothing here earns or costs you points. I'll point at exactly what to tap next; everything else is locked so you can't get lost."
  },
  {
    id: 'goal', stage: 0, kind: 'info', target: ['target', 'pbar-you'], button: 'Got it',
    title: 'Goal colors decide the game',
    text: "Every player gets a goal color from a random card in their deck. Yours is Blue (from your card Dexter) and the bot's is Green. When two different colors are revealed, whoever holds the most cards of BOTH colors combined wins outright, no matter the points. Black and Silver are never goal colors."
  },
  {
    id: 'goal-other', stage: 0, kind: 'info', target: ['target', 'pbar-you'], button: 'Next',
    title: 'The other two cases',
    text: 'If only one goal color shows up (or both players share it), the player with more cards of that color gets +15 points and the higher score wins. If neither player has a goal color, points decide. Keep an eye on the color counts beside each name.'
  },
  {
    id: 'board', stage: 0, kind: 'info', target: 'arena', button: 'Next',
    title: 'The board',
    text: "You're the bottom half, the bot is the top. Each side has 7 numbered slots: slots 1-4 are filled in round 1 and slots 5-7 in round 2. Cards in the same slot number face each other (\"opposite\"), and cards in neighboring numbers sit \"next to\" each other. Powers care about both."
  },
  {
    id: 'hand', stage: 0, kind: 'info', target: 'deck-box', button: 'Next',
    title: 'Your hand',
    text: 'Your 12-card deck was shuffled and you were dealt 6 cards. They are here, and the counter shows how many are still undealt. You will place 4 of them now.'
  },
  pick('pick-cindy', 0, 0, 1, 'Pick a card',
    'Tap Cindy Bear. Tapping a card selects it and shows its details on the Info tab: value, color, type and power.'),
  {
    id: 'info-tab', stage: 0, kind: 'info', target: 'info-panel', button: 'Next',
    ready: (c) => c.tab === 'info',
    title: 'The Info tab',
    text: 'Cindy Bear is Green and worth 3 points. Her power is "+10 if next to Yogi Bear". Powers are what make gToons more than adding numbers.'
  },
  put('place-cindy', 0, 0, 1, 'Place her', 'Now tap slot 1 to place Cindy there.'),
  pick('pick-yogi', 0, 1, 2, 'Pick her partner', "Cindy's power needs Yogi Bear beside her. Tap Yogi Bear."),
  put('place-yogi', 0, 1, 2, 'Slot 2 is next to slot 1', 'Tap slot 2 to place Yogi right beside Cindy.'),
  pick('pick-batman', 0, 2, 3, 'Pick Batman', 'Tap Batman. His power: -5 to the OPPOSITE card if it is not a Hero.'),
  put('place-batman', 0, 2, 3, 'Opposite the bot', "Tap slot 3. Whatever the bot puts in its slot 3 will be hit by Batman's power if it isn't a Hero."),
  pick('pick-dodgers', 0, 3, 4, 'Pick Captain Dodgers', 'Tap Captain Dodgers: a plain 10 with no power.'),
  put('place-dodgers', 0, 3, 4, 'Fill the last slot', 'Tap slot 4.'),
  {
    id: 'takeback', stage: 0, kind: 'action', target: 'slot-you-4',
    title: 'Changed your mind?',
    text: 'You can take a card back any time before you commit. Try it: tap Captain Dodgers in slot 4 to pick him back up.',
    done: (c) => slotEmpty(c, 4)
  },
  pick('pick-dodgers-again', 0, 3, 4, 'Put him back', 'Tap Captain Dodgers again...'),
  put('place-dodgers-again', 0, 3, 4, '...and slot 4', '...then tap slot 4 to place him there.'),
  {
    id: 'commit-1', stage: 0, kind: 'action', target: 'commit',
    title: 'Commit your cards',
    text: 'Every open slot is full. Tap "Commit 4 cards". Both players commit in secret, then all the cards flip together. After committing you cannot change them.',
    done: (c) => !!c.m?.you?.ready || stageOf(c) > 0
  },

  /* ── The round-1 reveal, then the discard phase ─────────────────────────────────────── */
  {
    id: 'reveal-1', stage: 1, kind: 'info', target: 'arena', button: 'Next', ready: settled,
    title: 'Reveal!',
    text: 'Cards flip in slot order. Cindy got +10 (she is now worth 13) because Yogi Bear is next to her. Batman took 5 off the bot\'s Aku (it is a Villain, not a Hero). And both of you played Captain Dodgers: the same gToon on both sides cancels out, so both score 0.'
  },
  {
    id: 'log-tab', stage: 1, kind: 'action', target: 'log-tab', ready: settled,
    title: 'The Game Log',
    text: 'Everything that happens is written down for you. Tap the Game Log tab.',
    done: (c) => c.tab === 'log'
  },
  {
    id: 'log', stage: 1, kind: 'info', target: 'log-panel', button: 'Next', ready: settled,
    title: 'Why did that number change?',
    text: 'The log lists every power that fired, every card that was cancelled or knocked out, and what changed. Small markers on the board cards point the same things out. Check it any time a score surprises you.'
  },
  {
    id: 'discard-intro', stage: 1, kind: 'info', target: 'deck-box', button: 'Next', ready: settled,
    title: 'Discard phase',
    text: 'After round 1 you may throw away any of the cards still in your hand, then your hand refills to 6 from your undealt cards. Discarded cards are out of the match for good. Your goal colors are Blue and Green, so Jack Training (a Red 1) is a card you can do without.'
  },
  {
    id: 'pick-discard', stage: 1, kind: 'action', target: 'hand-4', ready: settled,
    title: 'Mark a card to discard',
    text: 'Tap Jack Training to mark it for discarding.',
    done: (c) => (c.discardPick || []).includes(4) || !!c.m?.you?.discardReady
  },
  {
    id: 'confirm-discard', stage: 1, kind: 'action', target: 'discard-btn', ready: settled,
    title: 'Confirm',
    text: 'Tap "Discard 1 & draw". (If you want to keep everything, the same button says "Keep my hand".)',
    done: (c) => !!c.m?.you?.discardReady || stageOf(c) > 1
  },

  /* ── Round 2: slots 5-7 ─────────────────────────────────────────────────────────────── */
  {
    id: 'round-2', stage: 2, kind: 'info', target: 'deck-box', button: 'Next',
    title: 'Round 2: slots 5-7',
    text: 'Your hand refilled to 6 with new cards. This round you fill slots 5, 6 and 7. Slot 7 is special: its card stays face down until both players have decided whether to swap it. You will see why in a moment.'
  },
  pick('pick-tom', 2, 6, 5, 'Pick TOM',
    'Tap TOM. He is Silver, which has no color of its own. His power: treat the opposing card as Black.'),
  put('place-tom', 2, 6, 5, 'Slot 5', "Tap slot 5. The bot's slot-5 card will be treated as Black, and Black never counts toward a goal color."),
  pick('pick-pepe', 2, 7, 6, 'Pick Pepe Le Pew',
    'Tap Pepe Le Pew, another Silver card. His power: +2 to all Blue cards. Careful: "all" means yours and the bot\'s.'),
  put('place-pepe', 2, 7, 6, 'Slot 6', 'Tap slot 6.'),
  pick('pick-goat', 2, 8, 7, 'Pick Goat', 'Tap Goat, a weak Red 2. We are putting it in slot 7 on purpose.'),
  put('place-goat', 2, 8, 7, 'Slot 7 stays face down', 'Tap slot 7. You will be able to see it, but the bot will not.'),
  {
    id: 'commit-2', stage: 2, kind: 'action', target: 'commit',
    title: 'Commit again',
    text: 'Tap "Commit 3 cards".',
    done: (c) => !!c.m?.you?.ready || stageOf(c) > 2
  },

  /* ── The round-2 reveal, then the slot-7 swap ───────────────────────────────────────── */
  {
    id: 'reveal-2', stage: 3, kind: 'info', target: 'arena', button: 'Next', ready: settled,
    title: 'More surprises',
    text: "TOM turned the bot's Superman Black, so it no longer counts toward its Green. Pepe's +2 also boosted the bot's Baby Bugs, because Blue is Blue on both sides. And with Baby Bugs on the board, the bot's Bugs Teasin' dropped to 0: when two cards share a character, only the lowest-valued one counts. Cards already placed can change when new ones land."
  },
  {
    id: 'swap-intro', stage: 3, kind: 'info', target: ['strip'], button: 'Next', ready: settled,
    title: 'Slot-7 swap',
    text: 'Slot 7 is still face down. Now each player may swap their slot-7 card for a random card from the cards they have left. The old card goes back into the pile. It costs 10 points off your final score, once per match, and both players choose before slot 7 flips.'
  },
  {
    id: 'swap-why', stage: 3, kind: 'info', target: 'deck-box', button: 'Next', ready: settled,
    title: 'Is it worth it?',
    text: 'Goat is a weak Red 2, and you still hold Blue cards you have not played. A Blue card would add to your color count, which is what wins this game. In a normal match you would press "Keep slot 7" if your card was already good. For the tutorial, you swap.'
  },
  {
    id: 'swap-btn', stage: 3, kind: 'action', target: 'swap-btn', ready: settled,
    title: 'Swap',
    text: 'Tap "Swap slot 7 (-10 points)".',
    done: (c) => !!c.swapSheetOpen || !!c.m?.you?.swapReady || stageOf(c) > 3
  },
  {
    id: 'swap-confirm', stage: 3, kind: 'action', target: 'swap-confirm',
    title: 'Confirm the swap',
    text: 'Goat goes back into your pile and a random card takes slot 7. Tap "Swap (-10 points)".',
    done: (c) => !!c.m?.you?.swapReady || stageOf(c) > 3
  },

  /* ── Silver colour, then scoring ────────────────────────────────────────────────────── */
  {
    id: 'reveal-3', stage: 4, kind: 'info', target: 'arena', button: 'Next', ready: settled,
    title: 'Slot 7 flips',
    text: 'You drew Blossom Fighting, a Blue 10 (Pepe makes her a 12). The bot kept its Bloo.'
  },
  {
    id: 'silver-intro', stage: 4, kind: 'info', target: 'strip', button: 'Next', ready: settled,
    title: 'Silver cards pick a color',
    text: 'TOM and Pepe are Silver. Before scoring, each player chooses the real color their Silver cards count as, and both choices are revealed together. Blue and Green both count for you, so pick your goal color.'
  },
  {
    id: 'pick-blue', stage: 4, kind: 'action', target: 'color-BLUE', ready: settled,
    title: 'Choose Blue',
    text: 'Tap the Blue circle.',
    done: (c) => !!c.m?.you?.colorReady || !!c.m?.you?.pendingColor || stageOf(c) > 4
  },

  /* ── Result ─────────────────────────────────────────────────────────────────────────── */
  {
    id: 'result', stage: 5, kind: 'info', target: null, button: 'Next', ready: settled,
    title: 'You win!',
    text: "You finished behind on points (27 to 43, and that already includes the 10 you paid for the swap), but you won anyway: your goal colors are Blue and Green, and you hold 6 cards of those two colors against the bot's 4. Superman went Black, and its Bugs Teasin' and Captain Dodgers were cancelled. With two goal colors, color count beats points."
  },
  {
    id: 'recap', stage: 5, kind: 'info', target: null, button: 'Finish tutorial', finish: true, ready: settled,
    title: "That's gToons",
    text: "You've seen it all: goal colors, placing, powers, cancelled cards, the discard phase, the slot-7 swap and Silver colors. One last rule: if everything is still tied at the end, sudden death adds one extra card each until someone leads. Ready for a real match? Try Practice against the bot or find an opponent on the Matchmaking tab. You can replay this tutorial any time."
  }
]

/**
 * Where the guide should be, given where it was: skips steps from an earlier stage of the match and
 * action steps that are already done (a refresh mid-match lands on the right step). Info steps never
 * skip themselves — they wait for their button.
 */
export function settleStepIndex(steps, index, ctx) {
  const stage = stageOf(ctx)
  let i = index
  while (i < steps.length) {
    const s = steps[i]
    if (s.stage < stage || (s.kind === 'action' && s.done(ctx))) i++
    else break
  }
  return i
}
