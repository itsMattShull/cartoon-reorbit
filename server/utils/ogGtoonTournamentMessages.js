// server/utils/ogGtoonTournamentMessages.js
//
// The Discord DM texts for OG gToons tournament pairings played under the async + live rules. Pure (no Discord, no Prisma) so the
// wording can be tested: they must never say both players need to be online, never spoil a result (no cards or scores beyond the
// two public goal cards), and always carry the link and what not moving costs.
import { introScenario } from '../../utils/ogGtoonIntro.js'

/** The address of one game's board (pages/newsite/gtoons-classic/[id].vue). The one place that spells it out. */
export const gameUrl = (baseUrl, gameId) => `${baseUrl}/newsite/gtoons-classic/${gameId}`

const title = (c) => (c ? c.charAt(0) + c.slice(1).toLowerCase() : 'None')

/**
 * How the game will be decided, as one line (the same rules the board's intro screen shows).
 * `goalColors` = [yourGoalColor, opponentGoalColor].
 */
export function decidedByLine(goalColors) {
  const s = introScenario(goalColors)
  if (s.key === 'two') return `${s.title} (${s.colors.map(title).join(' and ')}): more cards of each color than your opponent wins the game outright, otherwise points decide.`
  if (s.key === 'one') return `${s.title} (${s.colors.map(title).join(', ')}): decided by points, and more cards of that color earns 15 bonus points.`
  return `${s.title}: decided by points only.`
}

const goalLine = (name, goal) => (goal ? `${goal.name} (${title(goal.color)})` : `no target color`) + (name ? '' : '')

/**
 * Sent to BOTH players when the game is created (the second Start, or the previous game ending): the link to this game, its goal
 * cards and how it is decided, and the deadline. `me` / `opp` = { username, goalColor, goalCard: { name, color } | null }.
 */
export function gameStartedText({ tournamentName, label, gameNumber, me, opp, link, dueText, firstGame }) {
  return [
    `🎮 ${tournamentName} — ${label}: Game ${gameNumber} is ready!`,
    `You are playing ${opp.username}.`,
    `• Your goal: ${goalLine(me.username, me.goalCard)} · ${opp.username}'s goal: ${goalLine(opp.username, opp.goalCard)}`,
    `• ${decidedByLine([me.goalColor, opp.goalColor])}`,
    `• Play it any time before ${dueText} — you don't need to be online at the same time, and there are no turn timers. If you are both on the board it plays live.`,
    `• Whoever the game is waiting on when time runs out loses the match, so make your move before then.${firstGame ? '' : ' (The next game starts by itself when one ends — no need to press Start again.)'}`,
    `• Open the game: ${link}`
  ].join('\n')
}

/** Sent to the player who has something to do after their opponent played (never says what was played). */
export function yourTurnText({ tournamentName, gameNumber, oppUsername, link, dueText }) {
  return [
    `🎮 ${tournamentName}: ${oppUsername} has played — it's your move in Game ${gameNumber}.`,
    `• Make your move before ${dueText}. If you haven't by then, you lose the match.`,
    `• Open the game: ${link}`
  ].join('\n')
}

/** Sent when a game cannot be created because a locked card left a player's collection. */
export function deckProblemText({ tournamentName, mine, oppUsername, link, dueText }) {
  return mine
    ? [
      `⚠️ ${tournamentName}: a card in your locked deck is no longer in your collection, so your next game against ${oppUsername} cannot start.`,
      `• A locked deck cannot be changed. If the card is not back in your collection by ${dueText}, you lose the match.`,
      `• ${link}`
    ].join('\n')
    : [
      `⏳ ${tournamentName}: ${oppUsername} has a problem with their locked deck, so your next game cannot start yet.`,
      `• If it is not sorted out by ${dueText}, they lose the match and you advance.`,
      `• ${link}`
    ].join('\n')
}

/** Sent to the player who was NOT there when the match was decided by the last game. */
export function matchDecidedAwayText({ tournamentName, won, oppUsername, link }) {
  return `🏆 ${tournamentName}: your match vs ${oppUsername} was decided — ${won ? 'you advance with the win!' : 'it did not go your way.'}\n${link}`
}

/** The round-open pairing DM for a pairing played under the async rules (the older text says both players must be online). */
export function roundOpenAsyncText({ tournamentName, label, oppUsername, dueText, link }) {
  return [
    `🏆 ${tournamentName} — ${label}`,
    `You are paired with ${oppUsername}.`,
    `• Best of 3 (first to 2 wins). You do NOT need to be online at the same time: press Start, play your turns whenever you can, and you can also play live if you are both on the board.`,
    `• Finish by: ${dueText}`,
    `• If you press Start and your opponent never does, you win when time runs out.`,
    `• Open your match and press Start: ${link}`
  ].join('\n')
}

/** The 24h / 4h reminder for an async pairing. */
export function reminderAsyncText({ tournamentName, oppUsername, label, dueText, link }) {
  return `⏰ ${tournamentName}: your match vs ${oppUsername} is due in about ${label} (${dueText}). Whoever the game is waiting on when time runs out loses, so open it and make your move: ${link}`
}
