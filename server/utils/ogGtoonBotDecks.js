// server/utils/ogGtoonBotDecks.js
//
// The practice bot's pre-defined decks: 10 per difficulty, every card taken from the original gToons
// pack (prisma/ogGtoonsData/pack-card-names.json, the list prisma/createOgGtoonsPack.js builds the pack
// from). Pure data plus a picker — no Prisma, so it is unit-testable; the lookup of the real card rows is
// in ogGtoonBotDeck.js.
//
// How the engine's rules shaped them (see ogGtoonEngine.js / ogGtoonEffects.js):
//   • A deck is 12 DIFFERENT gToons. Of the cards sharing a character (across BOTH boards) only the lowest
//     printed value counts, so no deck holds two cards of one character (e.g. both Bubbles).
//   • The goal card is one random Red/Blue/Green/... card in the deck (never Black/Silver). A deck whose
//     coloured cards are one or two colours therefore has a predictable goal, and every coloured card helps
//     the +15 / combined-colour count; Black is neutral but carries the highest printed values (8-10).
//   • Only 7 of the 12 cards reach the board and the bot places by value, so a deck is mostly judged by its
//     printed values and unconditional powers; adjacency combos are a bonus, not a plan.
//   • Powers that hit "all X" hit BOTH sides, and some hurt their own deck (Amoeba Boys, Cosmo Spacely...).
//
// The tiers (checked by tests/ogGtoonBotDecks.test.js and a bot-vs-player simulation):
//   easy   — low printed values (about 3.5-5.5 per card), colours scattered, Silver and unmet-condition
//            powers, a couple of cards that hurt their own side. The easy bot also plays at random.
//   normal — middling values (about 6.5-7.5), mostly one or two colours, a few Black fillers.
//   hard   — the strongest printed values (8+ per card): a 4-6 card core in one or two colours (so the goal
//            colour is reliable) plus Black 8-10s, and no power that works against it.

import { DIFFICULTIES, DEFAULT_DIFFICULTY } from './ogGtoonBot.js'

export const BOT_DECKS = {
  easy: [
    { name: 'Bedrock Beginners', cards: ['Fred Flintstone', 'Betty Rubble', 'Barney Rubble', 'Pebbles Baby', 'Bamm-Bamm Baby', 'Hawkgirl', 'Wilma Flintstone', 'Sara', 'Lois Lane', 'Jimmy Olson', 'Mystery Machine', 'Joker'] },
    { name: 'Looney Mistakes', cards: ['Daffy Duck', 'Elmer Fudd', 'Marvin the Martian', 'Bugs with Carrot', 'Yogi Bear', 'Boskov', 'Agent Honeydew', 'Joker', 'Sara', 'Lois Lane', 'Jimmy Olson', 'Mystery Machine'] },
    { name: 'Heroes in Training', cards: ['Batman', 'Hawkgirl', 'Wonder Woman', 'Aquaman', 'Monkey', 'Ms. Keane', 'Robin', 'Lois Lane', 'Jimmy Olson', 'Agent Honeydew', 'Sara', 'Mystery Machine'] },
    { name: 'Villain Pit Stop', cards: ['Amoeba Boys', 'Hector Con Carne', 'Copperhead', 'Aku Beast', 'Muriel', 'Eddy', 'Bunny Bravo', 'Joker', 'Catwoman', 'Sara', 'Jimmy Olson', 'Mystery Machine'] },
    { name: 'Cul-de-Sac Chaos', cards: ['Ed Running', 'Edd', 'Eddy', 'Courage Screaming', 'Muriel', 'Grim', 'Sarah', 'Billy', 'Lee Lee', 'Mayor', 'Sara', 'Jimmy Olson'] },
    { name: 'Lab Mishaps', cards: ["Dexter's Dad", "Dexter's Mom", 'Mandark', 'Dee Dee', 'Grim', 'Witch Doctor', 'Fred Jones', 'Agent Honeydew', 'Lee Lee', 'Billy', 'Mayor', 'Jimmy Olson'] },
    { name: 'Mystery Gang Lite', cards: ['Daphne Blake', 'Fred Jones', 'Shaggy Running', 'Scooby Hiding', 'Scrappy-Doo', 'Witch Doctor', 'Rosey', 'Mystery Machine', 'Lois Lane', 'Jimmy Olson', 'Sara', 'Joker'] },
    { name: 'Puff Pals', cards: ['Blossom Landing', 'Buttercup Fighting', 'Bubbles Flying', 'Professor Utonium', 'Ms. Keane', 'Pebbles Baby', 'Mojo Sandcastle', 'Mayor', 'Sara', 'Lois Lane', 'Catwoman', 'Creeper'] },
    { name: 'Mixed Bag', cards: ['Aku Beast', 'Fred Flintstone', 'Carl', 'Cosmo Spacely', 'Elmer Fudd', 'Johnny Flexing', 'Billy', 'Lee Lee', 'Sara', 'Joker', 'Lois Lane', 'Mystery Machine'] },
    { name: 'Odds and Ends', cards: ['Ms. Keane', 'Taz', 'Grim', 'Witch Doctor', 'TOM Classic', 'Martian Manhunter', 'Aquaman', 'Bamm-Bamm Baby', 'Agent Honeydew', 'Sara', 'Mystery Machine', 'Joker'] }
  ],
  normal: [
    { name: 'Red Hot', cards: ['Johnny Flexing', 'Fred Jones', 'Professor Utonium', 'Sara Bellum', 'Suzy', 'Sedusa (Ima Goodlady)', 'Billy', 'Lee Lee', 'Mystery Machine', 'Daffy Duck', 'Hawkgirl', 'Carl'] },
    { name: 'Blue Moon', cards: ['Buttercup Frowning', 'Daffy Duck', 'Rosey', 'Hector Con Carne', 'Lois Lane', 'Jim Gordon', 'Billy', 'Mayor', 'Sara', 'Fred Jones', 'Dino', 'Elmer Fudd'] },
    { name: 'Green and Mean', cards: ['Batman', 'Major Glory', 'Dino', 'Shaggy Running', 'Penguin', 'Robin', 'Lois Lane', 'Jimmy Olson', 'Joker', 'Carl', 'Cosmo Spacely', 'Mandark'] },
    { name: 'Yellow Fever', cards: ['Mandark', 'Mojo Brain Power', 'Elmer Fudd', 'Copperhead', 'Scotsman', 'Krunk', 'Joker', 'Cheetah', 'Catwoman', 'Rosey', 'Johnny Flexing', 'Dino'] },
    { name: 'Purple Haze', cards: ['Carl', 'Courage Screaming', 'Dee Dee', 'Val Hallen', 'Mandy', "Dexter's Mom", 'Billy', 'Lee Lee', 'Mayor', 'Daffy Duck', 'Fred Jones', 'Aku Beast'] },
    { name: 'Orange Crush', cards: ['Bugs with Carrot', 'Cosmo Spacely', 'Bamm-Bamm Baby', 'Flash', 'Sedusa (Ima Goodlady)', 'Jim Gordon', 'Sara', 'Lois Lane', 'Jimmy Olson', 'Hector Con Carne', 'Dino', 'Courage Screaming'] },
    { name: 'Scooby Squad', cards: ['Scooby-Doo', 'Velma Dinkley', 'Fred Jones', 'Johnny Flexing', 'Daphne Blake', 'Shaggy Running', 'Witch Doctor', 'Mystery Machine', 'Krunk', 'Jimmy Olson', 'Billy', 'Lee Lee'] },
    { name: 'Classic Toons', cards: ['Fred Flintstone', 'Wilma Flintstone', 'Barney Rubble', 'Betty Rubble', 'Rosey', 'Bamm-Bamm Baby', 'Dino', 'George Jetson', 'Jane Jetson', 'Elroy Jetson', 'Daffy Duck', 'Boskov'] },
    { name: 'Powerpuff Crew', cards: ['Blossom Landing', 'Bubbles Flying', 'Buttercup Fighting', 'Mojo Sandcastle', 'Professor Utonium', 'Sara Bellum', 'Mayor', 'Creeper', 'Joker', 'Catwoman', 'Gangreen Gang', 'Rosey'] },
    { name: 'Villain Council', cards: ['Buttercup Fighting', 'Hector Con Carne', 'Witch Doctor', 'Copperhead', 'Mojo Brain Power', 'Brainiac', 'Aku Beast', 'Penguin', 'Cheetah', 'Catwoman', 'Joker', 'Creeper'] }
  ],
  hard: [
    { name: 'Red Alert', cards: ['Bubbles with Octi', 'Scooby-Doo', 'Velma Dinkley', 'Johnny Flexing', 'Sara Bellum', 'Batgirl', 'Cheetah', 'George Jetson', 'Jane Jetson', 'Wilma Flintstone', 'Lee Lee', 'Mayor'] },
    { name: 'Green Lantern Corps', cards: ['Superman', 'Batman', 'Green Lantern', 'Major Glory', 'Shaggy Running', 'Dino', 'Batgirl', 'Cheetah', 'Catwoman', 'Wilma Flintstone', 'Jane Jetson', 'Lois Lane'] },
    { name: 'Orange Blast', cards: ["Bugs Grinnin'", 'Flash', 'Cosmo Spacely', 'Bamm-Bamm Baby', 'Wilma Flintstone', 'Jane Jetson', 'Batgirl', 'Billy', 'Mayor', 'Creeper', 'Lee Lee', 'Sara'] },
    { name: 'Purple Reign', cards: ['Blossom Landing', 'Ed with Flashlight', 'Carl', 'Courage Screaming', 'Dee Dee', 'George Jetson', 'Cheetah', 'Wilma Flintstone', 'Billy', 'Mayor', 'Catwoman', 'Lee Lee'] },
    { name: 'Yellow Jackets', cards: ['Bubbles Flying', 'Mandark', 'Mojo Brain Power', 'Elmer Fudd', 'Copperhead', 'Cheetah', 'Joker', 'Catwoman', 'Creeper', 'Jane Jetson', 'Batgirl', 'Wilma Flintstone'] },
    { name: 'Blue Streak', cards: ['Dexter', 'Daffy Duck', 'Buttercup Frowning', 'Rosey', 'Hector Con Carne', 'Monkey', 'Agent Honeydew', 'Billy', 'Lee Lee', 'Mayor', 'Wilma Flintstone', 'Jane Jetson'] },
    { name: 'Red and Orange Rush', cards: ['Scooby-Doo', 'Velma Dinkley', 'Johnny Flexing', "Bugs Grinnin'", 'Flash', 'Cosmo Spacely', 'Agent Honeydew', 'Jimmy Olson', 'Lois Lane', 'Sara', 'Mystery Machine', 'Joker'] },
    { name: 'Blue and Green Duo', cards: ['Dexter', 'Superman', 'Batman', 'Daffy Duck', 'Rosey', 'Dino', 'Wilma Flintstone', 'George Jetson', 'Batgirl', 'Billy', 'Mayor', 'Lois Lane'] },
    { name: 'Purple and Yellow Pair', cards: ['Blossom Landing', 'Ed with Flashlight', 'Jack with Sword', 'Bubbles Flying', 'Carl', 'Mandark', 'Jane Jetson', 'George Jetson', 'Cheetah', 'Catwoman', 'Lee Lee', 'Creeper'] },
    { name: 'Red and Yellow Blaze', cards: ['Scooby-Doo', 'Velma Dinkley', 'Bubbles with Octi', 'Jack with Sword', 'Mandark', 'Mojo Brain Power', 'Batgirl', 'Cheetah', 'George Jetson', 'Wilma Flintstone', 'Billy', 'Lee Lee'] }
  ]
}

/** Every card name any bot deck uses, de-duplicated (what the loader has to find in the database). */
export const BOT_DECK_CARD_NAMES = [...new Set(DIFFICULTIES.flatMap(d => BOT_DECKS[d].flatMap(deck => deck.cards)))]

/** The pre-defined decks for a difficulty (an unknown one gets the default's). */
export function botDecksFor(difficulty) {
  return BOT_DECKS[DIFFICULTIES.includes(difficulty) ? difficulty : DEFAULT_DIFFICULTY]
}

/**
 * One of the difficulty's pre-defined decks, chosen at random: { name, cards: [12 card names] }.
 * `available` (a Set of card names that exist as original gToons) limits the choice to decks that can
 * actually be built; null when none can. `rng` returns [0,1).
 */
export function pickBotDeck(difficulty, rng = Math.random, available = null) {
  const decks = botDecksFor(difficulty).filter(d => !available || d.cards.every(n => available.has(n)))
  if (!decks.length) return null
  return decks[Math.min(decks.length - 1, Math.floor(rng() * decks.length))]
}
