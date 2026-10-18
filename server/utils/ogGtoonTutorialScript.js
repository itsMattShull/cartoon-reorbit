// server/utils/ogGtoonTutorialScript.js
//
// The fixed, scripted match behind the original gToons (2002) tutorial. Pure data (no Prisma, no
// sockets) so the guided steps, the server and the tests all read the same script.
//
// The tutorial is a normal match played by the normal rules (ogGtoonMatchCore.js); what is
// scripted is everything that is random or chosen in a real match: both decks and their order,
// the opening hands, the goal cards, every card the bot plays, the discard, which card the
// slot-7 swap draws, and the Silver colour. It is built from imported cards (see
// prisma/createOgGtoonsFromCsv.js), looked up by NAME, and is the same every time. Neither deck is
// the player's: the tutorial deck is lent, so no ownership is needed and nothing is saved.
//
// What the board teaches (final board — see tests/ogGtoonTutorial.test.js for the exact numbers):
//   slot 1-2  "+10 if next to Yogi Bear" (Cindy Bear) — an adjacency power
//   slot 3    "-5 to opposite card if not a Hero" (Batman) hits the bot's Aku
//   slot 4    the same gToon (Captain Dodgers) on both sides cancels out, 0 points each
//   slot 5    "Treat opposing card as Black" (TOM) turns the bot's goal-colour Superman Black
//   slot 6    "+2 to all Blue cards" (Pepe Le Pew) — powers affect BOTH sides (the bot's Baby Bugs)
//   bot 1+6   two Bugs Bunny cards: only the lower one counts, so Bugs Teasin' drops to 0 when
//             Baby Bugs lands (an already-placed card can change later)
//   slot 7    stays face down; the paid swap draws Blossom Fighting (+2 from Pepe)
//   Silver    TOM and Pepe are Silver: the player picks Blue for them
// Goal colours are Blue (the player's Dexter) and Green (the bot's Superman) — two different
// colours, so the most cards of both combined wins outright: 6 to 4, while behind 27-43 on points.

/** Deck position = array index. Positions 0-5 are the opening hand, 6-11 stay undealt (in order). */
export const TUTORIAL_USER_DECK = [
  'Cindy Bear', 'Yogi Bear', 'Batman', 'Captain Dodgers', 'Jack Training', 'Dexter',
  'TOM', 'Pepe Le Pew', 'Goat', 'Buttercup Fighting', 'Blossom Fighting', 'Abuelito'
]
export const TUTORIAL_BOT_DECK = [
  "Bugs Teasin'", 'Cow', 'Aku', 'Captain Dodgers', 'Superman', 'Baby Bugs',
  'Bloo', 'Eustace', 'Edd', 'Dino', 'Snagglepuss', 'Mac'
]

export const TUTORIAL_BOT_USERNAME = 'Tutorial Bot'
export const TUTORIAL_BOT_ID = 'tutorial-bot'

const HAND = [0, 1, 2, 3, 4, 5]
const UNDEALT = [6, 7, 8, 9, 10, 11]
const place = (cardIdx, slot) => ({ cardIdx, slot })

export const TUTORIAL_PLAN = {
  goalCardIdx: [5, 4], // Dexter (Blue) / Superman (Green)
  hand: [HAND, HAND],
  undealt: [UNDEALT, UNDEALT],
  // The only placements each side makes, per round (round 1 = slots 1-4, round 2 = slots 5-7).
  rounds: {
    1: { user: [place(0, 1), place(1, 2), place(2, 3), place(3, 4)], bot: [place(0, 1), place(1, 2), place(2, 3), place(3, 4)] },
    2: { user: [place(6, 5), place(7, 6), place(8, 7)], bot: [place(4, 5), place(5, 6), place(6, 7)] }
  },
  // After round 1: the player throws away Jack Training; the bot keeps its hand.
  discard: { user: [4], bot: [] },
  // Round 3: the player pays for the swap and draws Blossom Fighting; the bot keeps slot 7.
  swap: { user: true, bot: false, drawIdx: 10 },
  silverColor: { user: 'BLUE', bot: 'GREEN' }
}

/** Every card name the tutorial needs, de-duplicated (Captain Dodgers is in both decks on purpose). */
export const TUTORIAL_CARD_NAMES = [...new Set([...TUTORIAL_USER_DECK, ...TUTORIAL_BOT_DECK])]

/** The scripted placement for hand card `cardIdx` in `round`, or null if the script has none. */
export function scriptedSlotFor(round, cardIdx) {
  return TUTORIAL_PLAN.rounds[round]?.user.find(p => p.cardIdx === cardIdx)?.slot ?? null
}
