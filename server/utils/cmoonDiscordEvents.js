// server/utils/cmoonDiscordEvents.js
//
// Every "post something fun to a cMoon's own Discord channel" feature added on top of the
// existing raid/riddle/hunt Discord integrations — team milestones, rank-ups, a solo Final Boss
// appearing, a new member joining, the server-wide season goal, and the weekly/season-end recaps.
// Deliberately one file for all of it: every function here is a thin, fire-and-forget wrapper
// around sendCMoonTeamUpdate (server/utils/discord.js) with no new caching/state beyond the few
// atomic-claim columns added alongside this file (CMoonSeasonConfig.enemiesDefeatedGoalAnnouncedAt,
// CMoonEnemyMember.lastFinalBossPingAt), matching this feature set's "near-zero footprint" design
// goal. Every exported *announce*/*ping*/*post* function below swallows its own errors — a missed
// celebratory Discord post must never fail or slow down the gameplay action that triggered it.
import { prisma } from '../prisma.js'
import { sendCMoonTeamUpdate } from './discord.js'

/* ── Pure helpers (unit-tested in tests/cmoonDiscordEvents.test.js) ─────────────────────────── */

// Resolves which Discord channel a cMoon-flavored, non-raid announcement posts to: that cMoon's
// own channel if set, else the shared GlobalGameConfig.cMoonRaidBossDiscordChannelId every other
// cMoon-related announcement already falls back to (see resolveCMoonRaidDiscordChannelId's own
// comment — reused here as a plain sync helper since the caller already has `config` in hand and
// doesn't need a second DB round-trip per cMoon).
export function resolveCMoonChannelId(cMoonDiscordChannelId, config) {
  return (cMoonDiscordChannelId || '').trim()
    || (config?.cMoonRaidBossDiscordChannelId || '').trim()
    || process.env.DISCORD_ANNOUNCEMENTS_CHANNEL
    || null
}

// Did crossing from `beforeValue` to `afterValue` pass at least one multiple of `interval`? If
// so, returns the highest such multiple (the milestone to announce); otherwise null. `interval
// <= 0` (feature misconfigured) and a non-increase (afterValue <= beforeValue — e.g. a team-score
// recompute that went DOWN from a points deduction) both return null, never a milestone.
//
// Known, accepted limitation: team score is not purely monotonic (recomputeCMoonTeamScores can
// lower it via a deduction), so a team that dips below a milestone and later climbs back past it
// will be re-announced for the same milestone. This is a cosmetic celebration post, not a ledger —
// a rare duplicate "congrats" is harmless and not worth a second persisted "last announced tier"
// column per cMoon per metric.
export function crossedRoundNumberMilestone(beforeValue, afterValue, interval) {
  const before = Number(beforeValue) || 0
  const after = Number(afterValue) || 0
  const step = Number(interval) || 0
  if (step <= 0 || after <= before) return null
  const beforeTier = Math.floor(before / step)
  const afterTier = Math.floor(after / step)
  if (afterTier <= beforeTier) return null
  return afterTier * step
}

// Has at least `cooldownMinutes` elapsed since `lastAt`? `null`/`undefined` lastAt (never pinged
// before) and a non-positive cooldown both count as expired.
export function isPingCooldownExpired(lastAt, cooldownMinutes, now = new Date()) {
  const minutes = Number(cooldownMinutes) || 0
  if (!lastAt) return true
  if (minutes <= 0) return true
  return now.getTime() - new Date(lastAt).getTime() >= minutes * 60 * 1000
}

export function buildTeamEnemiesMilestoneMessage(cMoonName, milestone) {
  return `⚔️ **${cMoonName || 'Your cMoon'}** just defeated its **${milestone.toLocaleString()}th** cMoon enemy! Keep the streak going!`
}

export function buildTeamPointsMilestoneMessage(cMoonName, milestone) {
  return `🏅 **${cMoonName || 'Your cMoon'}** just crossed **${milestone.toLocaleString()} points**!`
}

export function buildRankUpMessage(username, rankName) {
  return `📈 **${username || 'A member'}** just ranked up to **${rankName}**!`
}

export function buildFinalBossPingMessage(cMoonName, enemyName) {
  return `😱 A **Final Boss** (${enemyName || 'a legendary enemy'}) just appeared for a member of **${cMoonName || 'your cMoon'}**! Someone go deal with that.`
}

export function buildWelcomeMessage(username) {
  return `👋 Welcome **${username || 'a new member'}** to the team!`
}

export function buildSeasonGoalReachedMessage(label, target) {
  return `🎆 The server-wide **${label || 'Enemies Defeated'}** goal of **${Number(target).toLocaleString()}** has been reached! Great work, everyone.`
}

export function buildSharedPoolBossDefeatedMessage(enemyName) {
  return `🎉 **${enemyName || 'A community boss'}** has been defeated by the combined efforts of every cMoon! Great work, everyone.`
}

export function buildWeeklyRecapMessage(cMoonName, topSlayer) {
  if (!topSlayer) return null
  return `📊 **Weekly Recap for ${cMoonName || 'your cMoon'}**: **${topSlayer.username}** led the team with **${topSlayer.wins}** enemy defeat${topSlayer.wins === 1 ? '' : 's'} this week!`
}

export function buildSeasonMvpMessage(cMoonName, mvp) {
  if (!mvp) return null
  return `🏆 **Season MVP for ${cMoonName || 'your cMoon'}**: **${mvp.username}** with **${mvp.wins}** enemy defeat${mvp.wins === 1 ? '' : 's'} this season! A new season starts now.`
}

/* ── Team milestones (enemies defeated / team score) ─────────────────────────────────────────── */

// Called right after a WIN increments CMoon.battleWins (both solo — action.post.js's resolveWin —
// and raid — cmoonRaidSocket.js) with the pre- and post-increment values already in hand (a plain
// `tx.cMoon.update(...)` return, no extra query). Never awaited by its caller.
export async function announceTeamEnemiesMilestone(cMoonId, beforeWins, afterWins) {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: {
      cMoonTeamMilestoneEnabled: true, cMoonTeamMilestoneEnemiesInterval: true, cMoonRaidBossDiscordChannelId: true,
    } })
    if (!config?.cMoonTeamMilestoneEnabled) return
    const milestone = crossedRoundNumberMilestone(beforeWins, afterWins, config.cMoonTeamMilestoneEnemiesInterval)
    if (!milestone) return
    const cMoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { name: true, discordChannelId: true } })
    if (!cMoon) return
    const channelId = resolveCMoonChannelId(cMoon.discordChannelId, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildTeamEnemiesMilestoneMessage(cMoon.name, milestone))
  } catch (e) {
    console.error('announceTeamEnemiesMilestone failed:', e?.message || e)
  }
}

// Called from recomputeCMoonTeamScores (server/utils/cmoon.js) with a `{ id -> teamScore }` map of
// every cMoon's own value from immediately BEFORE that recompute ran — the only place a "just
// crossed a point milestone" diff can be taken, since teamScore is always fully recomputed, never
// incremented. `afterRows` is the plain cMoon.findMany result the caller already has to fetch
// anyway (id, name, discordChannelId, teamScore).
export async function announceTeamPointsMilestones(beforeById, afterRows, config) {
  if (!config?.cMoonTeamMilestoneEnabled) return
  for (const row of afterRows) {
    try {
      const before = beforeById.get(row.id)
      if (before === undefined) continue
      const milestone = crossedRoundNumberMilestone(before, row.teamScore, config.cMoonTeamMilestonePointsInterval)
      if (!milestone) continue
      const channelId = resolveCMoonChannelId(row.discordChannelId, config)
      if (!channelId) continue
      await sendCMoonTeamUpdate(channelId, buildTeamPointsMilestoneMessage(row.name, milestone))
    } catch (e) {
      console.error('announceTeamPointsMilestones failed for cMoon', row?.id, e?.message || e)
    }
  }
}

/* ── Rank-up ──────────────────────────────────────────────────────────────────────────────────── */

// Called from the normal gameplay rank-up path (grantCMoonRank's return value, surfaced through
// awardAchievementToUser in server/utils/achievements.js). `sortOrder` is the just-granted
// CMoonRank's own sortOrder, checked against cMoonRankUpAnnounceMinSortOrder's floor (see that
// column's own schema comment) before this does anything else — every existing caller already
// has it in hand from the same query that returned the rank's id/name, so this never needs an
// extra lookup.
export async function announceCMoonRankUp(userId, rankName, sortOrder) {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: {
      cMoonRankUpAnnounceEnabled: true, cMoonRaidBossDiscordChannelId: true, cMoonRankUpAnnounceMinSortOrder: true,
    } })
    if (!config?.cMoonRankUpAnnounceEnabled) return
    if ((sortOrder ?? 0) < (config.cMoonRankUpAnnounceMinSortOrder ?? 0)) return
    const user = await prisma.user.findUnique({ where: { id: userId }, select: {
      username: true, cMoon: { select: { name: true, discordChannelId: true } },
    } })
    if (!user?.cMoon) return
    const channelId = resolveCMoonChannelId(user.cMoon.discordChannelId, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildRankUpMessage(user.username, rankName))
  } catch (e) {
    console.error('announceCMoonRankUp failed:', e?.message || e)
  }
}

// Called from the admin "Recalculate cMoon Points" bulk tool (cmoon-rank-recalc.worker.js) for
// each user it classifies as `upgraded` — a genuinely separate code path from grantCMoonRank above
// that never calls it, so this needs its own entry point. The caller already has every field this
// needs in hand (one row per user, already loaded for its own progress feed), so this takes plain
// values rather than re-querying. `sortOrder` is checked the same way announceCMoonRankUp's own
// does — see that function's own comment.
export async function announceCMoonRankUpFromRecalc(cMoonDiscordChannelId, cMoonName, username, newRankName, sortOrder) {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: {
      cMoonRankUpAnnounceEnabled: true, cMoonRaidBossDiscordChannelId: true, cMoonRankUpAnnounceMinSortOrder: true,
    } })
    if (!config?.cMoonRankUpAnnounceEnabled) return
    if ((sortOrder ?? 0) < (config.cMoonRankUpAnnounceMinSortOrder ?? 0)) return
    const channelId = resolveCMoonChannelId(cMoonDiscordChannelId, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildRankUpMessage(username, newRankName))
  } catch (e) {
    console.error('announceCMoonRankUpFromRecalc failed:', e?.message || e)
  }
}

/* ── Final Boss appears (solo only — a raid boss already gets announceCMoonRaidBoss) ───────────── */

// Called from consider.post.js the moment a solo (non-raid) FINAL_BOSS-rank enemy is offered to a
// cMoon member. Uses the SAME atomic-claim shape every other exactly-once write in this codebase
// uses (`UPDATE ... WHERE lastFinalBossPingAt IS NULL OR < cutoff`) so two teammates rolling the
// same enemy within the cooldown window can't both trigger a post.
export async function pingFinalBossAppeared(cMoonId, enemyMemberId, enemyName) {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: {
      cMoonFinalBossPingEnabled: true, cMoonFinalBossPingCooldownMinutes: true, cMoonRaidBossDiscordChannelId: true,
    } })
    if (!config?.cMoonFinalBossPingEnabled) return
    const cutoff = new Date(Date.now() - (Number(config.cMoonFinalBossPingCooldownMinutes) || 0) * 60 * 1000)
    const claim = await prisma.cMoonEnemyMember.updateMany({
      where: { id: enemyMemberId, OR: [{ lastFinalBossPingAt: null }, { lastFinalBossPingAt: { lt: cutoff } }] },
      data: { lastFinalBossPingAt: new Date() },
    })
    if (claim.count === 0) return
    const cMoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { name: true, discordChannelId: true } })
    if (!cMoon) return
    const channelId = resolveCMoonChannelId(cMoon.discordChannelId, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildFinalBossPingMessage(cMoon.name, enemyName))
  } catch (e) {
    console.error('pingFinalBossAppeared failed:', e?.message || e)
  }
}

/* ── New member welcome ──────────────────────────────────────────────────────────────────────── */

// Called ONLY from selectCMoonForUser (server/utils/cmoon.js) — the genuine random-join path —
// never from reassignUserCMoon (admin reassignment, captain-align, Balance Teams, accepted
// team-change requests), matching this feature's "a real join, not a reshuffle" scope.
export async function announceCMoonWelcome(cMoonDiscordChannelId, username) {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: {
      cMoonWelcomePostEnabled: true, cMoonRaidBossDiscordChannelId: true,
    } })
    if (!config?.cMoonWelcomePostEnabled) return
    const channelId = resolveCMoonChannelId(cMoonDiscordChannelId, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildWelcomeMessage(username))
  } catch (e) {
    console.error('announceCMoonWelcome failed:', e?.message || e)
  }
}

/* ── Server-wide "enemies defeated" season goal ──────────────────────────────────────────────── */

// Called after every WIN (solo and raid) — cheap even when the feature is off (one row read, no
// writes) and claims the announcement atomically so concurrent wins racing across the threshold
// can only ever post once. Reset by start-new.post.js on every season rollover.
export async function checkAndAnnounceSeasonGoalReached() {
  try {
    const season = await prisma.cMoonSeasonConfig.findUnique({ where: { id: 'singleton' } })
    if (!season?.enemiesDefeatedGoalEnabled || season.enemiesDefeatedGoalAnnouncedAt) return
    const target = Number(season.enemiesDefeatedGoalTarget) || 0
    if (target <= 0) return
    const current = await prisma.cMoonEnemyBattle.count({ where: { outcome: 'WIN', endedAt: { gte: season.startedAt } } })
    if (current < target) return

    const claim = await prisma.cMoonSeasonConfig.updateMany({
      where: { id: 'singleton', enemiesDefeatedGoalAnnouncedAt: null },
      data: { enemiesDefeatedGoalAnnouncedAt: new Date() },
    })
    if (claim.count === 0) return

    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cMoonRaidBossDiscordChannelId: true } })
    const channelId = resolveCMoonChannelId(null, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildSeasonGoalReachedMessage(season.enemiesDefeatedGoalLabel, target))
  } catch (e) {
    console.error('checkAndAnnounceSeasonGoalReached failed:', e?.message || e)
  }
}

/* ── Server-wide SHARED_POOL boss defeat ─────────────────────────────────────────────────────── */

// Called by action.post.js's atomic currentHp-GREATEST-clamped UPDATE ONLY when that caller's own
// request was the one whose decrement actually brought the pool from >0 to 0 (that UPDATE's own
// WHERE "currentHp" > 0 means a second, simultaneous caller who merely observes an already-0 pool
// never gets credited with the transition) — so this is never called twice for the same kill,
// no additional atomic claim needed here. `enemyName` is already in hand on the caller's own
// `battle.enemyMember`, so this never re-queries it. Posted to the same shared fallback channel
// the server-wide season-goal announcement above uses, since a SHARED_POOL kill has no single
// team to credit.
export async function announceSharedPoolBossDefeated(enemyName) {
  try {
    const config = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { cMoonSharedBossDefeatAnnounceEnabled: true, cMoonRaidBossDiscordChannelId: true },
    })
    if (!config?.cMoonSharedBossDefeatAnnounceEnabled) return
    const channelId = resolveCMoonChannelId(null, config)
    if (!channelId) return
    await sendCMoonTeamUpdate(channelId, buildSharedPoolBossDefeatedMessage(enemyName))
  } catch (e) {
    console.error('announceSharedPoolBossDefeated failed:', e?.message || e)
  }
}

/* ── Weekly top-slayer recap + end-of-season MVP recap ───────────────────────────────────────── */

// The member with the most enemy-defeat WINs for one cMoon within [rangeStart, rangeEnd) — shared
// by both the weekly recap cron and the season-end MVP recap below, just with a different range.
// Returns null if nobody on that team won anything in the window (no recap posted for an idle team).
async function topSlayerForCMoon(cMoonId, rangeStart, rangeEnd) {
  const rows = await prisma.cMoonEnemyBattle.groupBy({
    by: ['userId'],
    // raidId: null — a "top slayer" recap is a solo-kill-style callout; a raid win is a shared
    // party result (every participant gets a synthetic row, see CMoonEnemyBattle.raidId's own
    // schema comment), so counting it here would let one raid inflate several players' tallies
    // off a single kill. The Leaderboards page (server/api/leaderboard/cmoon-enemies.get.js)
    // already draws this same raid/solo line explicitly; this brings this recap in line with it.
    where: { cMoonId, outcome: 'WIN', raidId: null, endedAt: { gte: rangeStart, ...(rangeEnd ? { lt: rangeEnd } : {}) } },
    _count: { _all: true },
    // Bug fix: `orderBy: { _count: { _all: 'desc' } }` is rejected by this Prisma client version
    // ("Unknown argument `_all`"), which meant this query threw on every single call — silently
    // swallowed by this function's callers' own try/catch (postWeeklyTopSlayerRecap/
    // postSeasonMvpRecap), so the weekly and season-rollover top-slayer Discord recaps have never
    // actually posted. Order by a specific grouped field's count instead — same row-count value
    // since `by: ['userId']` with no null userId possible.
    orderBy: { _count: { userId: 'desc' } },
    take: 1,
  })
  if (!rows.length || !rows[0]._count._all) return null
  const user = await prisma.user.findUnique({ where: { id: rows[0].userId }, select: { username: true } })
  return { username: user?.username || 'Someone', wins: rows[0]._count._all }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Cron entry point (server/cron/cmoon-weekly-recap.js) — posts each cMoon's own top enemy-slayer
// over the past 7 days to that cMoon's Discord channel. Every cMoon is looped individually (tens
// of rows, same scale every other admin/cron cMoon-listing query in this codebase already assumes)
// rather than one grouped query across all of them, since each team's post needs its own channel
// resolution anyway.
export async function postWeeklyTopSlayerRecap() {
  const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  if (!config?.cMoonWeeklyRecapEnabled) return
  const cmoons = await prisma.cMoon.findMany({ where: { joinLocked: false }, select: { id: true, name: true, discordChannelId: true } })
  const rangeStart = new Date(Date.now() - WEEK_MS)
  for (const cMoon of cmoons) {
    try {
      const topSlayer = await topSlayerForCMoon(cMoon.id, rangeStart, null)
      const message = buildWeeklyRecapMessage(cMoon.name, topSlayer)
      if (!message) continue
      const channelId = resolveCMoonChannelId(cMoon.discordChannelId, config)
      if (!channelId) continue
      await sendCMoonTeamUpdate(channelId, message)
    } catch (e) {
      console.error('postWeeklyTopSlayerRecap failed for cMoon', cMoon.id, e?.message || e)
    }
  }
}

// Called from start-new.post.js (admin season rollover) BEFORE startedAt moves forward — posts
// each cMoon's own season MVP over the just-ended season's [startedAt, now) range.
export async function postSeasonMvpRecap(seasonStartedAt, seasonEndedAt) {
  try {
    const config = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    if (!config?.cMoonSeasonMvpRecapEnabled) return
    const cmoons = await prisma.cMoon.findMany({ where: { joinLocked: false }, select: { id: true, name: true, discordChannelId: true } })
    for (const cMoon of cmoons) {
      try {
        const mvp = await topSlayerForCMoon(cMoon.id, seasonStartedAt, seasonEndedAt)
        const message = buildSeasonMvpMessage(cMoon.name, mvp)
        if (!message) continue
        const channelId = resolveCMoonChannelId(cMoon.discordChannelId, config)
        if (!channelId) continue
        await sendCMoonTeamUpdate(channelId, message)
      } catch (e) {
        console.error('postSeasonMvpRecap failed for cMoon', cMoon.id, e?.message || e)
      }
    }
  } catch (e) {
    console.error('postSeasonMvpRecap failed:', e?.message || e)
  }
}

/* ── /cmoon stats slash command ──────────────────────────────────────────────────────────────── */

// Backs the /cmoon stats Discord command (server/api/discord/interactions.post.js) — a quick,
// ephemeral personal + team snapshot. Returns a plain content string (never throws; callers decide
// how to present a thrown error, but there's nothing here that should actually throw under normal
// use). `discordId` is the caller's own Discord snowflake, already resolved by the interaction
// handler from interaction.member/user.
export async function buildCMoonStatsReply(discordId) {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: {
      id: true, username: true, cMoonPoints: true,
      currentCMoonRank: { select: { name: true } },
      cMoon: { select: { id: true, name: true, teamScore: true, battleWins: true } },
    },
  })
  if (!user) return "You need a Cartoon ReOrbit account linked to this Discord account first."
  if (!user.cMoon) return "You're not on a cMoon team yet — pick one on the site!"

  const personalWins = await prisma.cMoonEnemyBattle.count({ where: { outcome: 'WIN', cMoonId: user.cMoon.id, userId: user.id } })
  const rankLine = user.currentCMoonRank?.name ? ` (${user.currentCMoonRank.name})` : ''
  return [
    `**${user.cMoon.name}**: ${user.cMoon.teamScore.toLocaleString()} points, ${user.cMoon.battleWins.toLocaleString()} enemies defeated`,
    `**You**: ${user.cMoonPoints.toLocaleString()} points${rankLine}, ${personalWins.toLocaleString()} enemy defeat${personalWins === 1 ? '' : 's'}`,
  ].join('\n')
}
