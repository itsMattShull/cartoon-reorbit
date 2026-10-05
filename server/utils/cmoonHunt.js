// server/utils/cmoonHunt.js
// DB-touching logic for the cMoon Split-Clue Scavenger Hunt (see prisma/schema.prisma's
// CMoonHunt model comment). Pure clue-distribution math lives in cmoonHuntAssignment.js instead
// (see that file's own comment on why); pure answer comparison is reused unchanged from
// cmoonRiddleAnswer.js.

import { recomputeCMoonTeamScores } from './cmoon.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'
import { resolveCMoonRaidDiscordChannelId, sendCMoonTeamUpdate, sendDiscordDMByDiscordId } from './discord.js'
import { broadcastToAllCMoonChannels } from './cmoonRiddle.js'
import { assignCluesRoundRobin } from './cmoonHuntAssignment.js'
import { isCorrectRiddleAnswer } from './cmoonRiddleAnswer.js'

// CMoonHunt.finalAnswer plays the same role CMoonRiddle.answer does — compared the same
// case/whitespace-insensitive way, just under a differently-named column (a hunt's "answer" is a
// specific, more deliberate name: it's the one thing the whole team converges on, not a single
// clue's own text).
export function isCorrectHuntAnswer(hunt, submitted) {
  return isCorrectRiddleAnswer({ answer: hunt?.finalAnswer }, submitted)
}

// Posts a hunt: DMs every current member of every cMoon exactly one clue (round-robin per team,
// see assignCluesRoundRobin), announces to every cMoon's own channel that a hunt has begun, and
// marks it posted. Never re-posts an already-posted hunt (the DMs already went out; doing it
// again would reshuffle who has which clue mid-hunt). Returns a `reason` when nothing was sent.
export async function postCMoonHunt(prisma, huntId) {
  const hunt = await prisma.cMoonHunt.findUnique({ where: { id: huntId }, include: { clues: { orderBy: { sortOrder: 'asc' } } } })
  if (!hunt) return { posted: false, reason: 'not_found' }
  if (hunt.postedAt) return { posted: false, reason: 'already_posted' }
  if (!hunt.clues.length) return { posted: false, reason: 'no_clues' }

  const members = await prisma.user.findMany({
    where: { cMoonId: { not: null }, active: true, banned: false },
    select: { id: true, cMoonId: true, discordId: true },
  })
  const membersByCMoon = new Map()
  for (const m of members) {
    if (!membersByCMoon.has(m.cMoonId)) membersByCMoon.set(m.cMoonId, [])
    membersByCMoon.get(m.cMoonId).push(m)
  }

  const clueIds = hunt.clues.map(c => c.id)
  const assignmentRows = []
  for (const [cMoonId, teamMembers] of membersByCMoon.entries()) {
    const pairs = assignCluesRoundRobin(teamMembers.map(m => m.id), clueIds)
    for (const { userId, clueId } of pairs) assignmentRows.push({ huntId: hunt.id, clueId, cMoonId, userId })
  }
  if (assignmentRows.length) {
    await prisma.cMoonHuntAssignment.createMany({ data: assignmentRows })
  }

  // DMs go out fire-and-forget (sendDiscordDMByDiscordId never throws) — an admin posting a hunt
  // to potentially dozens of members across every cMoon must not wait on that many sequential
  // Discord round trips before this function (and the HTTP request that triggered it) returns.
  const memberById = new Map(members.map(m => [m.id, m]))
  const clueById = new Map(hunt.clues.map(c => [c.id, c]))
  for (const row of assignmentRows) {
    const member = memberById.get(row.userId)
    const clue = clueById.get(row.clueId)
    if (!member || !clue) continue
    sendDiscordDMByDiscordId(
      member.discordId,
      `🧩 **${hunt.title}** — Team Scavenger Hunt!\nYour clue: ${clue.text}\n\nShare what you learn with your team, then have anyone submit the final answer with \`/hunt\`.`,
    ).catch(() => {})
  }

  broadcastToAllCMoonChannels(
    prisma,
    `🧭 **A new Team Scavenger Hunt has begun: "${hunt.title}"!**\nCheck your DMs for your own personal clue, share it with your team, then submit the combined answer with \`/hunt\`.`,
  ).catch(() => {})

  await prisma.cMoonHunt.update({ where: { id: hunt.id }, data: { postedAt: new Date() } })
  return { posted: true, assignedCount: assignmentRows.length }
}

// Every currently-open hunt for one specific cMoon — active, already posted, and NOT yet
// completed by THIS cMoon (every cMoon can complete the same hunt once, independently; see
// CMoonHuntCompletion's own schema comment). A player's submitted answer is checked against all
// of these at once, same reasoning as CMoonRiddle's getOpenWeeklyRiddle/getOpenBossLoreRiddles —
// a player typing an answer has no way to say which hunt they mean.
export async function getOpenCMoonHuntsForCMoon(prisma, cMoonId) {
  if (!cMoonId) return []
  return prisma.cMoonHunt.findMany({
    where: { active: true, postedAt: { not: null }, completions: { none: { cMoonId } } },
  })
}

// Claims a hunt's completion for `cMoonId`, atomically — the @@unique([huntId, cMoonId]) on
// CMoonHuntCompletion IS the guard: a second insert attempt for the same (hunt, cMoon) pair fails
// with Prisma's unique-violation code P2002, exactly as reliably as CMoonRiddle's conditional
// UPDATE guards its own single global winner. Returns { claimed: false } if this cMoon already
// completed this hunt (including a concurrent call that beat this one to it).
export async function claimCMoonHuntCompletion(prisma, { huntId, userId, cMoonId }) {
  try {
    await prisma.cMoonHuntCompletion.create({ data: { huntId, cMoonId, userId } })
  } catch (err) {
    if (err?.code === 'P2002') return { claimed: false }
    throw err
  }

  const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cMoonHuntPoints: true } })
  const pointsAwarded = Math.max(0, Number(config?.cMoonHuntPoints) || 0)
  if (pointsAwarded > 0) {
    await prisma.cMoonScoreLog.create({
      data: { cMoonId, userId, category: 'HUNT_COMPLETE', detail: huntId, points: pointsAwarded, weekStart: new Date() },
    })
    // Live-visible immediately, same pattern as claimCMoonRiddleSolve.
    await recomputeCMoonTeamScores()
    await recomputeCMoonPointsForUsers([userId])
  }

  announceHuntCompletionToTeam(prisma, { userId, cMoonId, pointsAwarded }).catch(() => {})

  return { claimed: true, pointsAwarded }
}

async function announceHuntCompletionToTeam(prisma, { userId, cMoonId, pointsAwarded }) {
  const [user, cMoon] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { name: true, discordChannelId: true } }),
  ])
  if (!cMoon) return
  const channelId = await resolveCMoonRaidDiscordChannelId(prisma, cMoon.discordChannelId)
  const pointsLine = pointsAwarded > 0 ? ` (+${pointsAwarded} points)` : ''
  await sendCMoonTeamUpdate(channelId, `🏆 **${cMoon.name}** solved the scavenger hunt! Nice teamwork, ${user?.username || 'a player'}${pointsLine}!`)
}
