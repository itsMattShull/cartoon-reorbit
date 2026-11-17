import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decidedByLine, gameStartedText, yourTurnText, deckProblemText, matchDecidedAwayText, roundOpenAsyncText, reminderAsyncText,
  roundOpenLiveText, reminderLiveText, opponentReadyText, matchDecidedText, announcementText, tournamentCompleteText
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

test('the DMs are laid out as a header, bullet points and the link on its own line', () => {
  const t = gameStartedText(base)
  const lines = t.split('\n')
  assert.match(lines[0], /^🎮 \*\*First gtoon Tournament! — Swiss Round 3\*\*$/)
  assert.ok(lines.includes(''), 'blank lines separate the sections')
  assert.ok(lines.filter(l => l.startsWith('• ')).length >= 5, 'the details are bullets')
  assert.match(lines.at(-1), /^👉 Open the game: https:/, 'the link is the last line, on its own')
  for (const text of [
    yourTurnText({ tournamentName: 'Cup', gameNumber: 1, oppUsername: 'Bo', link, dueText: 'x' }),
    roundOpenAsyncText({ tournamentName: 'Cup', label: 'R1', oppUsername: 'Bo', dueText: 'x', link }),
    roundOpenLiveText({ tournamentName: 'Cup', label: 'R1', oppUsername: 'Bo', dueText: 'x', link }),
    reminderAsyncText({ tournamentName: 'Cup', oppUsername: 'Bo', label: '4 hours', dueText: 'x', link }),
    reminderLiveText({ tournamentName: 'Cup', oppUsername: 'Bo', label: '4 hours', dueText: 'x', link }),
    opponentReadyText({ tournamentName: 'Cup', oppUsername: 'Bo', async: true, link }),
    opponentReadyText({ tournamentName: 'Cup', oppUsername: 'Bo', async: false, link }),
    matchDecidedText({ tournamentName: 'Cup', playerA: 'Ann', playerB: 'Bo', reason: 'deadline passed', result: 'Ann advances with the win.', link }),
    matchDecidedAwayText({ tournamentName: 'Cup', won: true, oppUsername: 'Bo', link })
  ]) {
    assert.ok(text.includes('\n\n'), 'has a blank line')
    assert.ok(text.includes(link))
    assert.ok(text.split('\n').some(l => l.startsWith('• ') || l.startsWith('👉')), 'has bullets or a link line')
  }
})

test('the older-rules texts keep saying both players must be online; the live pairing text omits a missing deadline', () => {
  assert.match(roundOpenLiveText({ tournamentName: 'Cup', label: 'R1', oppUsername: 'Bo', dueText: 'Fri', link }), /Both of you need to be online[\s\S]*Finish by:\*\* Fri/)
  assert.doesNotMatch(roundOpenLiveText({ tournamentName: 'Cup', label: 'R1', oppUsername: 'Bo', dueText: null, link }), /Finish by/)
  assert.match(reminderLiveText({ tournamentName: 'Cup', oppUsername: 'Bo', label: '4 hours', dueText: 'Fri', link }), /Both of you need to be online/)
  assert.match(opponentReadyText({ tournamentName: 'Cup', oppUsername: 'Bo', async: true, link }), /they win when time runs out/)
  assert.match(opponentReadyText({ tournamentName: 'Cup', oppUsername: 'Bo', async: false, link }), /waiting for you/)
})

test('the channel announcement lists the dates and opt-ins as bullets', () => {
  const t = announcementText({ tournamentName: 'Cup', optInStart: 'Nov 1', optInEnd: 'Nov 5', tz: 'CST', optInCount: 7, link })
  for (const s of ['**Opt-in opens:** Nov 1', '**Opt-in closes:** Nov 5 (CST)', '**Current opt-ins:** 7', link]) assert.ok(t.includes(s), s)
})

test('the tournament-complete post tags the podium finishers and returns exactly those ids to ping', () => {
  const r = tournamentCompleteText({
    tournamentName: 'Cup', link,
    podium: [{ place: 3, username: 'Cy', discordId: '333' }, { place: 1, username: 'Ann', discordId: '111' }, { place: 2, username: 'Bo', discordId: '222' }]
  })
  assert.deepEqual(r.mentionIds.sort(), ['111', '222', '333'])
  assert.match(r.content, /🏆 \*\*Cup is complete!\*\*/)
  assert.match(r.content, /champion <@111>/)
  const podium = r.content.split('\n').filter(l => l.startsWith('• '))
  assert.deepEqual(podium, ['• 🥇 **1st:** <@111>', '• 🥈 **2nd:** <@222>', '• 🥉 **3rd:** <@333>'], 'ordered by place whatever order they came in')
  assert.ok(r.content.includes(link))
})

test('a podium finisher with no Discord account is named, not tagged, and a one-player field still posts', () => {
  const r = tournamentCompleteText({
    tournamentName: 'Cup', link,
    podium: [{ place: 1, username: 'Ann', discordId: '111' }, { place: 2, username: 'Bo', discordId: null }]
  })
  assert.deepEqual(r.mentionIds, ['111'])
  assert.match(r.content, /🥈 \*\*2nd:\*\* \*\*Bo\*\*/)
  const solo = tournamentCompleteText({ tournamentName: 'Cup', link, podium: [{ place: 1, username: 'Ann', discordId: '111' }] })
  assert.match(solo.content, /champion <@111>/)
  assert.doesNotMatch(solo.content, /Final podium/)
  assert.deepEqual(tournamentCompleteText({ tournamentName: 'Cup', link, podium: [] }).mentionIds, [])
})
