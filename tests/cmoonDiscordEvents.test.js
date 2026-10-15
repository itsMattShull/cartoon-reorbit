import test from 'node:test'
import assert from 'node:assert/strict'
import {
  crossedRoundNumberMilestone, isPingCooldownExpired, resolveCMoonChannelId,
  buildTeamEnemiesMilestoneMessage, buildTeamPointsMilestoneMessage, buildRankUpMessage,
  buildFinalBossPingMessage, buildWelcomeMessage, buildSeasonGoalReachedMessage,
  buildWeeklyRecapMessage, buildSeasonMvpMessage,
} from '../server/utils/cmoonDiscordEvents.js'

test('crossedRoundNumberMilestone: fires exactly when a multiple of interval is crossed', () => {
  assert.equal(crossedRoundNumberMilestone(95, 105, 100), 100)
  assert.equal(crossedRoundNumberMilestone(0, 100, 100), 100)
  assert.equal(crossedRoundNumberMilestone(199, 300, 100), 300)
  assert.equal(crossedRoundNumberMilestone(50, 99, 100), null)
  assert.equal(crossedRoundNumberMilestone(100, 100, 100), null)
})

test('crossedRoundNumberMilestone: never fires on a non-increase or a misconfigured interval', () => {
  assert.equal(crossedRoundNumberMilestone(150, 90, 100), null)
  assert.equal(crossedRoundNumberMilestone(90, 150, 0), null)
  assert.equal(crossedRoundNumberMilestone(90, 150, -5), null)
})

test('isPingCooldownExpired: never pinged before, or a non-positive cooldown, always counts as expired', () => {
  assert.equal(isPingCooldownExpired(null, 60), true)
  assert.equal(isPingCooldownExpired(new Date(), 0), true)
  assert.equal(isPingCooldownExpired(new Date(), -5), true)
})

test('isPingCooldownExpired: respects the cooldown window against a fixed `now`', () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const fiveMinAgo = new Date('2026-01-01T11:55:00Z')
  const oneHourAgo = new Date('2026-01-01T11:00:00Z')
  assert.equal(isPingCooldownExpired(fiveMinAgo, 60, now), false)
  assert.equal(isPingCooldownExpired(oneHourAgo, 60, now), true)
})

test('resolveCMoonChannelId: cMoon-own channel wins, then the raid-boss fallback, then env', () => {
  const config = { cMoonRaidBossDiscordChannelId: 'fallback-channel' }
  assert.equal(resolveCMoonChannelId('own-channel', config), 'own-channel')
  assert.equal(resolveCMoonChannelId('', config), 'fallback-channel')
  assert.equal(resolveCMoonChannelId(null, {}), process.env.DISCORD_ANNOUNCEMENTS_CHANNEL || null)
})

test('message builders: tolerate missing names and never throw', () => {
  assert.match(buildTeamEnemiesMilestoneMessage('The Foxes', 100), /The Foxes/)
  assert.match(buildTeamEnemiesMilestoneMessage(null, 100), /Your cMoon/)
  assert.match(buildTeamPointsMilestoneMessage('The Foxes', 1000), /1,000/)
  assert.match(buildRankUpMessage('alice', 'Underboss'), /alice.*Underboss/)
  assert.match(buildFinalBossPingMessage(null, null), /Final Boss/)
  assert.match(buildWelcomeMessage('bob'), /bob/)
  assert.match(buildSeasonGoalReachedMessage('Enemies Defeated', 1000), /1,000/)
})

test('buildWeeklyRecapMessage/buildSeasonMvpMessage: null slayer means no post at all', () => {
  assert.equal(buildWeeklyRecapMessage('The Foxes', null), null)
  assert.equal(buildSeasonMvpMessage('The Foxes', null), null)
  assert.match(buildWeeklyRecapMessage('The Foxes', { username: 'alice', wins: 3 }), /alice.*3/)
  assert.match(buildSeasonMvpMessage('The Foxes', { username: 'alice', wins: 1 }), /alice.*1.*enemy defeat\b/)
})
