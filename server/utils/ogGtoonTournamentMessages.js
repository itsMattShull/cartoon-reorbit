// server/utils/ogGtoonTournamentMessages.js
//
// The Discord DM texts for OG gToons tournament pairings played under the async + live rules. Pure (no Discord, no Prisma) so the
// wording can be tested: they must never say both players need to be online, never spoil a result (no cards or scores beyond the
// two public goal cards), and always carry the link and what not moving costs.
import { introScenario } from '#utils/ogGtoonIntro.js'

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

const goalLine = (goal) => (goal ? `${goal.name} (${title(goal.color)})` : 'no target color')

/**
 * Sent to BOTH players when the game is created (the second Start, or the previous game ending): the link to this game, its goal
 * cards and how it is decided, and the deadline. `me` / `opp` = { username, goalColor, goalCard: { name, color } | null }.
 */
export function gameStartedText({ tournamentName, label, gameNumber, me, opp, link, dueText, firstGame }) {
  return [
    `🎮 **${tournamentName} — ${label}**`,
    `Game ${gameNumber} is ready! You are playing **${opp.username}**.`,
    '',
    `• **Your goal:** ${goalLine(me.goalCard)}`,
    `• **${opp.username}'s goal:** ${goalLine(opp.goalCard)}`,
    `• **How it's decided:** ${decidedByLine([me.goalColor, opp.goalColor])}`,
    '',
    `• **Play before:** ${dueText}`,
    `• You don't need to be online at the same time, and there are no turn timers. If you are both on the board it plays live.`,
    `• Whoever the game is waiting on when time runs out loses the match, so make your move before then.${firstGame ? '' : ' The next game starts by itself when one ends — no need to press Start again.'}`,
    '',
    `👉 Open the game: ${link}`
  ].join('\n')
}

/** Sent to the player who has something to do after their opponent played (never says what was played). */
export function yourTurnText({ tournamentName, gameNumber, oppUsername, link, dueText }) {
  return [
    `🎮 **${tournamentName}**`,
    `${oppUsername} has played — it's your move in Game ${gameNumber}.`,
    '',
    `• **Move before:** ${dueText}`,
    `• If you haven't by then, you lose the match.`,
    '',
    `👉 Open the game: ${link}`
  ].join('\n')
}

/** Sent when a game cannot be created because a locked card left a player's collection. */
export function deckProblemText({ tournamentName, mine, oppUsername, link, dueText }) {
  return mine
    ? [
      `⚠️ **${tournamentName}**`,
      `A card in your locked deck is no longer in your collection, so your next game against ${oppUsername} cannot start.`,
      '',
      `• A locked deck cannot be changed.`,
      `• If the card is not back in your collection by ${dueText}, you lose the match.`,
      '',
      `👉 ${link}`
    ].join('\n')
    : [
      `⏳ **${tournamentName}**`,
      `${oppUsername} has a problem with their locked deck, so your next game cannot start yet.`,
      '',
      `• If it is not sorted out by ${dueText}, they lose the match and you advance.`,
      '',
      `👉 ${link}`
    ].join('\n')
}

/** Sent to the player who was NOT there when the match was decided by the last game. */
export function matchDecidedAwayText({ tournamentName, won, oppUsername, link }) {
  return [
    `🏆 **${tournamentName}**`,
    `Your match vs ${oppUsername} was decided — ${won ? 'you advance with the win!' : 'it did not go your way.'}`,
    '',
    `👉 ${link}`
  ].join('\n')
}

/** The round-open pairing DM for a pairing played under the async rules (the older text says both players must be online). */
export function roundOpenAsyncText({ tournamentName, label, oppUsername, dueText, link }) {
  return [
    `🏆 **${tournamentName} — ${label}**`,
    `You are paired with **${oppUsername}**.`,
    '',
    `• **Format:** best of 3 (first to 2 wins)`,
    `• **Finish by:** ${dueText}`,
    `• You do NOT need to be online at the same time: press Start, play your turns whenever you can, and you can also play live if you are both on the board.`,
    `• If you press Start and your opponent never does, you win when time runs out.`,
    '',
    `👉 Open your match and press Start: ${link}`
  ].join('\n')
}

/** The pairing DM under the older (both players online) rules. `dueText` may be null. */
export function roundOpenLiveText({ tournamentName, label, oppUsername, dueText, link }) {
  return [
    `🏆 **${tournamentName} — ${label}**`,
    `You are paired with **${oppUsername}**.`,
    '',
    `• **Format:** best of 3 (first to 2 wins)`,
    `• Both of you need to be online to play.`,
    ...(dueText ? [`• **Finish by:** ${dueText}`] : []),
    '',
    `👉 Open your match and press Start next game: ${link}`
  ].join('\n')
}

/** The 24h / 4h reminder for an async pairing. */
export function reminderAsyncText({ tournamentName, oppUsername, label, dueText, link }) {
  return [
    `⏰ **${tournamentName}**`,
    `Your match vs ${oppUsername} is due in about ${label}.`,
    '',
    `• **Due:** ${dueText}`,
    `• Whoever the game is waiting on when time runs out loses, so open it and make your move.`,
    '',
    `👉 ${link}`
  ].join('\n')
}

/** The reminder under the older (both players online) rules. */
export function reminderLiveText({ tournamentName, oppUsername, label, dueText, link }) {
  return [
    `⏰ **${tournamentName}**`,
    `Your match vs ${oppUsername} is due in about ${label}.`,
    '',
    `• **Due:** ${dueText}`,
    `• Both of you need to be online to play.`,
    '',
    `👉 ${link}`
  ].join('\n')
}

/** Sent to the waiting player when their opponent presses Start first. */
export function opponentReadyText({ tournamentName, oppUsername, async, link }) {
  return async
    ? [
      `🎮 **${tournamentName}**`,
      `${oppUsername} pressed Start on your match.`,
      '',
      `• Press Start too and the game is created straight away.`,
      `• You don't have to play it right now — just make your moves before the deadline.`,
      `• If you never press Start, they win when time runs out.`,
      '',
      `👉 ${link}`
    ].join('\n')
    : [
      `🎮 **${tournamentName}**`,
      `${oppUsername} is ready to play your match and is waiting for you.`,
      '',
      `👉 Open your match and press Start next game: ${link}`
    ].join('\n')
}

/** Sent to both players when a pairing is decided without (or beyond) the games: deadline, forfeit, admin. */
export function matchDecidedText({ tournamentName, playerA, playerB, reason, result, link }) {
  return [
    `🏆 **${tournamentName}**`,
    `Your match ${playerA} vs ${playerB} was decided.`,
    '',
    `• **Why:** ${reason}`,
    `• **Result:** ${result}`,
    '',
    `👉 ${link}`
  ].join('\n')
}

/** The tournament announcement posted in the channel when sign-ups open. */
export function announcementText({ tournamentName, optInStart, optInEnd, tz, optInCount, link }) {
  return [
    `🏆 **${tournamentName} — OG gToons Tournament**`,
    '',
    `• **Format:** best of 3`,
    `• **Opt-in opens:** ${optInStart}`,
    `• **Opt-in closes:** ${optInEnd} (${tz})`,
    `• **Current opt-ins:** ${optInCount}`,
    '',
    `👉 Lock in a deck and join: ${link}`
  ].join('\n')
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }
const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd' }

/**
 * The channel post when a tournament finishes. `podium` = [{ place, username, discordId | null }] for places 1-3 (fewer when the
 * field was small). A player with a Discord id is tagged (`<@id>`); the caller passes the same ids as the allowed mentions so the
 * tags actually ping. Returns { content, mentionIds }.
 */
export function tournamentCompleteText({ tournamentName, podium, link }) {
  const mentionIds = []
  const who = (p) => {
    if (p.discordId) { mentionIds.push(String(p.discordId)); return `<@${p.discordId}>` }
    return `**${p.username || 'Unknown'}**`
  }
  const ranked = [...(podium || [])].filter(p => MEDALS[p.place]).sort((a, b) => a.place - b.place)
  const [first, ...others] = ranked
  const lines = [`🏆 **${tournamentName} is complete!**`, '']
  if (first) lines.push(`${MEDALS[1]} Congratulations to our champion ${who(first)}!`, '')
  if (others.length) {
    lines.push('**Final podium**')
    for (const p of ranked) lines.push(`• ${MEDALS[p.place]} **${ORDINALS[p.place]}:** ${who(p)}`)
    lines.push('')
  }
  lines.push(`📊 Full results: ${link}`)
  return { content: lines.join('\n'), mentionIds: [...new Set(mentionIds)] }
}
