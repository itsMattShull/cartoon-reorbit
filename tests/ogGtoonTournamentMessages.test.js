import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decidedByLine, gameStartedText, yourTurnText, deckProblemText, matchDecidedAwayText, roundOpenAsyncText, reminderAsyncText
} from '../server/utils/ogGtoonTournamentMessages.js'

const link = 'https://www.cartoonreorbit.com/newsite/gtoons-classic/game-1'
const base = {
  tournamentName: 'First gtoon Tournament!', label: 'Swiss Round 3', gameNumber: 1, link, dueText: 'Nov 17, 2026 8:12 PM CST',
  me: { username: 'Ann', goalColor: 'RED', goalCard: { name: 'Dexter', color: 'RED' } },
  opp: { username: 'Bo', goalColor: 'BLUE', goalCard: { name: 'Mojo Jojo', color: 'BLUE' } }, firstGame: true
}

test('the how-it-is-decided line matches the intro screen for two, one and no target colors', () => {
  assert.match(decidedByLine(['RED', 'BLUE']), /Two colors revealed \(Red and Blue\).*more cards of each color.*outright/)
  assert.match(decidedByLine(['RED', 'RED']), /One color revealed \(Red\).*15 bonus points/)
  assert.match(decidedByLine(['BLACK', 'SILVER']), /No colors revealed.*points only/)
})

test('the game-started DM carries the link, both goal cards, how it is decided, the deadline and the rule for not moving', () => {
  const t = gameStartedText(base)
  for (const s of [link, 'Dexter (Red)', 'Mojo Jojo (Blue)', "Bo's goal", 'Two colors revealed', 'Nov 17, 2026 8:12 PM CST', 'loses the match', 'Game 1 is ready']) assert.ok(t.includes(s), s)
  assert.doesNotMatch(t, /both of you need to be online|need to be online together/i, 'the old wording is gone')
  assert.match(t, /don't need to be online at the same time/)
})

test('a later game says it started by itself; a goal-less deck says so', () => {
  assert.match(gameStartedText({ ...base, firstGame: false, gameNumber: 2 }), /starts by itself.*no need to press Start again/)
  assert.match(gameStartedText({ ...base, me: { ...base.me, goalCard: null, goalColor: 'BLACK' } }), /no target color/)
  assert.doesNotMatch(gameStartedText(base), /starts by itself/)
})

test('the your-turn DM never says what was played, only that it is your move, and what not moving costs', () => {
  const t = yourTurnText({ tournamentName: 'Cup', gameNumber: 2, oppUsername: 'Bo', link, dueText: 'soon' })
  assert.match(t, /Bo has played — it's your move in Game 2/)
  assert.match(t, /you lose the match/)
  assert.ok(t.includes(link))
  assert.doesNotMatch(t, /\d+\s*-\s*\d+|score|won|revealed/i, 'no result or score')
})

test('deck problem texts tell the offender what it costs and the opponent what to expect', () => {
  const mine = deckProblemText({ tournamentName: 'Cup', mine: true, oppUsername: 'Bo', link, dueText: 'Friday' })
  assert.match(mine, /cannot be changed/)
  assert.match(mine, /you lose the match/)
  const theirs = deckProblemText({ tournamentName: 'Cup', mine: false, oppUsername: 'Bo', link, dueText: 'Friday' })
  assert.match(theirs, /Bo has a problem.*you advance/s)
})

test('the pairing DM for async rules does not demand both players be online, and says what a lone Start earns', () => {
  const t = roundOpenAsyncText({ tournamentName: 'Cup', label: 'Swiss Round 2', oppUsername: 'Bo', dueText: 'Friday', link })
  assert.match(t, /do NOT need to be online at the same time/)
  assert.match(t, /you win when time runs out/)
  assert.doesNotMatch(t, /Both of you need to be online/)
})

test('reminder and decided texts carry the link', () => {
  assert.ok(reminderAsyncText({ tournamentName: 'Cup', oppUsername: 'Bo', label: '4 hours', dueText: 'x', link }).includes(link))
  assert.match(matchDecidedAwayText({ tournamentName: 'Cup', won: true, oppUsername: 'Bo', link }), /you advance/)
  assert.match(matchDecidedAwayText({ tournamentName: 'Cup', won: false, oppUsername: 'Bo', link }), /did not go your way/)
})

test('a game link points at the board page, which exists', async () => {
  const { gameUrl } = await import('../server/utils/ogGtoonTournamentMessages.js')
  const { existsSync } = await import('node:fs')
  assert.equal(gameUrl('https://x.test', 'abc'), 'https://x.test/newsite/gtoons-classic/abc')
  assert.ok(existsSync(new URL('../pages/newsite/gtoons-classic/[id].vue', import.meta.url)), 'the page the link points at must exist')
})
