// Source-text wiring checks for the Daily Streak feature — same style as
// tests/myOrbitFollowLeaderboardContract.test.js. No live server or database needed: catches
// drift between the schema, the cron registration, the admin CRUD/permissions/UI, and the
// player-facing endpoint/UI.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

// ── Schema ───────────────────────────────────────────────────────────────────────────────────

test('schema has DailyStreakReward, DailyStreakClaim, the User/GlobalGameConfig fields, and a DAILY_STREAK PackSource value', () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /enum DailyStreakRewardType \{\s*CTOON\s*PACK\s*POINTS\s*CMOON_POINTS\s*\}/)
  assert.match(schema, /model DailyStreakReward \{[\s\S]*?@@index\(\[day\]\)/)
  assert.match(schema, /model DailyStreakClaim \{[\s\S]*?@@unique\(\[userId, streakDay\]\)/)
  assert.match(schema, /dailyStreakCount\s+Int\s+@default\(0\)/)
  assert.match(schema, /dailyStreakLastBoundary\s+DateTime\?/)
  assert.match(schema, /dailyStreakRepeatEnabled\s+Boolean\s+@default\(false\)/)
  // A PACK reward row is granted via grantRewardInTx's packSource param (see dailyStreak.js
  // below), which Prisma validates against this enum — without this value, every PACK-type
  // Daily Streak reward throws at grant time (caught by tests/dailyStreakProcessing.db.test.js).
  assert.match(schema, /enum PackSource \{[\s\S]*?DAILY_STREAK[\s\S]*?\}/)
})

// ── Shared task-completion logic + streak math ──────────────────────────────────────────────

test('dailyStreak.js reuses computeDailyTaskStatus/the split evening+morning completeness checks rather than re-deriving task completion', () => {
  const dailyStreak = read('server/utils/dailyStreak.js')
  assert.match(dailyStreak, /from '\.\/dailyTaskStatus\.js'/)
  assert.match(dailyStreak, /computeDailyTaskStatus\(db, user\.id, \{ asOf: justBeforeBoundary, windowEnd: boundary \}\)/)
  assert.match(dailyStreak, /allEnabledEveningTasksComplete\(\{ status, config: taskConfig \}\)/)
  assert.match(dailyStreak, /allEnabledMorningTasksComplete\(\{ status, config: taskConfig \}\)/)
  // Relative imports only — this module is reachable from server/cron/process-daily-streaks.js,
  // a plain `node` entrypoint that cannot resolve the `@/` Nuxt alias.
  assert.doesNotMatch(dailyStreak, /from '@\//)
})

test('an evening-complete-but-morning-incomplete player is deferred (dailyStreakPendingBoundary), never reset early', () => {
  const dailyStreak = read('server/utils/dailyStreak.js')
  assert.match(dailyStreak, /if \(!allEnabledEveningTasksComplete\(\{ status, config: taskConfig \}\)\) \{[\s\S]*?dailyStreakCount: 0/)
  assert.match(dailyStreak, /if \(!allEnabledMorningTasksComplete\(\{ status, config: taskConfig \}\)\) \{[\s\S]*?dailyStreakPendingBoundary: boundary/)
  // Every path that finally decides a streakDay (advance OR reset) must clear the flag again.
  const clears = (dailyStreak.match(/dailyStreakPendingBoundary: null/g) || []).length
  assert.ok(clears >= 3, `expected the pending flag to be cleared on every resolving path (found ${clears})`)
})

test('resolvePendingDailyStreaks resolves the closed morning window via morningWindowEnd, stamping the ORIGINAL evening boundary', () => {
  const dailyStreak = read('server/utils/dailyStreak.js')
  assert.match(dailyStreak, /export async function resolvePendingDailyStreaks/)
  assert.match(dailyStreak, /morningWindowEnd: morningBoundary/)
  assert.match(dailyStreak, /dailyStreakPendingBoundary: eveningBoundary/)
  assert.match(dailyStreak, /boundary: eveningBoundary/) // advanceOneUserStreak's own `boundary` param, not the morning one
})

test('computeDailyTaskStatus resolves Lotto from the immutable LottoLog, not the live counter, whenever morningWindowEnd is given', () => {
  const taskStatus = read('server/utils/dailyTaskStatus.js')
  assert.match(taskStatus, /morningWindowEnd = null/)
  assert.match(taskStatus, /db\.lottoLog\.count\(\{ where: \{ userId, createdAt: morningCreatedAt \} \}\)/)
  assert.match(taskStatus, /export function allEnabledEveningTasksComplete/)
  assert.match(taskStatus, /export function allEnabledMorningTasksComplete/)
})

test('a PACK reward grants with packSource DAILY_STREAK, and a CMOON_POINTS reward is skipped (not the whole day) when the user has no cMoon', () => {
  const dailyStreak = read('server/utils/dailyStreak.js')
  assert.match(dailyStreak, /grantRewardInTx\(tx, userId, bundle, 'DAILY_STREAK', 'DAILY_STREAK'\)/)
  assert.match(dailyStreak, /const grantCMoonPoints = cMoonId \? cmoonPointsRows : \[\]/)
})

test('resolveDailyStreakEffectiveDay is a single pure implementation, re-exported (not duplicated) by dailyStreak.js', () => {
  const cycle = read('server/utils/dailyStreakCycle.js')
  assert.match(cycle, /export function resolveDailyStreakEffectiveDay\(streakDay, maxDay, repeatEnabled\)/)
  const dailyStreak = read('server/utils/dailyStreak.js')
  assert.match(dailyStreak, /from '\.\/dailyStreakCycle\.js'/)
  assert.match(dailyStreak, /export \{ resolveDailyStreakEffectiveDay \}/)
})

// ── Cron registration ───────────────────────────────────────────────────────────────────────

test('the nightly cron is registered in jobs.js, just after the Chicago 8pm daily-task boundary, and wired in jobHandlers.js', () => {
  const jobs = read('server/cron/jobs.js')
  assert.match(jobs, /\{ name: 'processDailyStreaks', tier: TIER_CRITICAL, pattern: '5 20 \* \* \*', tz: CHI/)
  const handlers = read('server/cron/jobHandlers.js')
  assert.match(handlers, /import \{ runProcessDailyStreaks \} from '\.\/process-daily-streaks\.js'/)
  assert.match(handlers, /processDailyStreaks: runProcessDailyStreaks,/)
})

test('the morning resolution cron is registered just after the 8am task boundary, with its own lease columns, and wired in jobHandlers.js', () => {
  const jobs = read('server/cron/jobs.js')
  assert.match(jobs, /\{ name: 'resolvePendingDailyStreaks', tier: TIER_CRITICAL, pattern: '5 8 \* \* \*', tz: CHI/)
  const handlers = read('server/cron/jobHandlers.js')
  assert.match(handlers, /import \{ runResolvePendingDailyStreaks \} from '\.\/resolve-pending-daily-streaks\.js'/)
  assert.match(handlers, /resolvePendingDailyStreaks: runResolvePendingDailyStreaks,/)

  const cron = read('server/cron/resolve-pending-daily-streaks.js')
  assert.match(cron, /"dailyStreakMorningCronClaimedAt" = NOW\(\), "dailyStreakMorningCronClaimToken" = \$\{token\}/)
  assert.match(cron, /resolvePendingDailyStreaks\(\)/)
  assert.match(cron, /finally \{/)
  assert.match(cron, /"dailyStreakMorningCronClaimedAt" = NULL, "dailyStreakMorningCronClaimToken" = NULL/)

  const schema = read('prisma/schema.prisma')
  assert.match(schema, /dailyStreakPendingBoundary DateTime\?/)
  assert.match(schema, /dailyStreakMorningCronClaimedAt\s+DateTime\?/)
  assert.match(schema, /dailyStreakMorningCronClaimToken\s+String\?/)
})

test('the cron claims a GlobalGameConfig lease (not an advisory lock) and always releases it', () => {
  const cron = read('server/cron/process-daily-streaks.js')
  assert.match(cron, /"dailyStreakCronClaimedAt" = NOW\(\), "dailyStreakCronClaimToken" = \$\{token\}/)
  assert.match(cron, /processDailyStreaks\(\)/)
  assert.match(cron, /finally \{/)
  assert.match(cron, /"dailyStreakCronClaimedAt" = NULL, "dailyStreakCronClaimToken" = NULL/)
})

// ── Admin: CRUD + settings + permissions + UI ───────────────────────────────────────────────

test('admin reward CRUD endpoints validate via parseDailyStreakRewardBody, check referenced ctoon/pack existence, and audit-log every write', () => {
  const create = read('server/api/admin/daily-streak-rewards/index.post.js')
  assert.match(create, /from '@\/server\/utils\/dailyStreakReward'/)
  assert.match(create, /parseDailyStreakRewardBody\(body\)/)
  assert.match(create, /db\.ctoon\.count\(\{ where: \{ id: ctoonId \} \}\)/)
  assert.match(create, /db\.pack\.count\(\{ where: \{ id: packId \} \}\)/)
  assert.match(create, /logAdminChange\(db, \{/)
  assert.match(create, /requireAdmin\(event\)/)
  assert.match(create, /assertSameOrigin\(event\)/)

  const del = read('server/api/admin/daily-streak-rewards/[id].delete.js')
  assert.match(del, /requireAdmin\(event\)/)
  assert.match(del, /logAdminChange\(db, \{/)
})

test('admin settings endpoints read/write GlobalGameConfig.dailyStreakRepeatEnabled, audited', () => {
  const post = read('server/api/admin/daily-streak-settings.post.js')
  assert.match(post, /requireAdmin\(event\)/)
  assert.match(post, /dailyStreakRepeatEnabled: !!body\.dailyStreakRepeatEnabled/)
  assert.match(post, /logAdminChange\(db, \{/)
  const get = read('server/api/admin/daily-streak-settings.get.js')
  assert.match(get, /dailyStreakRepeatEnabled/)
})

test('both admin URL segments are mapped to the dailyStreak permission key, which is registered and granted to the events preset', () => {
  const perms = read('utils/adminPermissions.js')
  assert.match(perms, /'daily-streak-rewards': \['dailyStreak'\]/)
  assert.match(perms, /'daily-streak-settings': \['dailyStreak'\]/)
  assert.match(perms, /ADMIN_PERMISSION_KEYS = \[[\s\S]*?'dailyStreak'[\s\S]*?\]/)

  const adminPermTest = read('tests/adminPermissions.test.js')
  assert.match(adminPermTest, /ADDED_SINCE[\s\S]*?'dailyStreak'[\s\S]*?\]/)
})

test('the admin section is registered and the panel talks to the reward CRUD + settings endpoints', () => {
  const sections = read('utils/adminSections.js')
  assert.match(sections, /S\('dailyStreak', 'Manage Daily Streak', 'games', nu\('AdminDailyStreak'\)\)/)

  const panel = read('components/newsite/AdminDailyStreak.vue')
  assert.match(panel, /\$fetch\('\/api\/admin\/daily-streak-rewards'\)/)
  assert.match(panel, /\$fetch\('\/api\/admin\/daily-streak-rewards', \{ method: 'POST', body \}\)/)
  assert.match(panel, /\$fetch\(`\/api\/admin\/daily-streak-rewards\/\$\{r\.id\}`, \{ method: 'DELETE' \}\)/)
  assert.match(panel, /\$fetch\('\/api\/admin\/daily-streak-settings', \{ method: 'POST', body: \{ \.\.\.settings \} \}\)/)
})

// ── Player-facing surface ───────────────────────────────────────────────────────────────────

test('the player status endpoint resolves cToon/pack reward previews server-side and marks reached milestones off the viewer\'s own streak count', () => {
  const status = read('server/api/daily-streak/status.get.js')
  assert.match(status, /db\.user\.findUnique\(\{ where: \{ id: userId \}, select: \{ dailyStreakCount: true \} \}\)/)
  assert.match(status, /db\.dailyStreakReward\.findMany\(\{/)
  assert.match(status, /reached: streakCount >= day/)
})

test('Onboarding.vue fetches the streak status alongside the daily checklist and mounts the rewards modal', () => {
  const onboarding = read('components/Onboarding.vue')
  assert.match(onboarding, /import DailyStreakRewardsModal from '@\/components\/newsite\/DailyStreakRewardsModal\.vue'/)
  assert.match(onboarding, /const streakData = ref\(null\)/)
  assert.match(onboarding, /\$fetch\('\/api\/daily-streak\/status', \{ credentials: 'include' \}\)/)
  // Fetched in the same watcher that already loads the daily checklist, so the two can never
  // silently drift (one refreshing on tab-open/login while the other goes stale).
  const watchBlock = onboarding.slice(onboarding.indexOf('watch([isOpen, activeTab]'), onboarding.indexOf('watch([isOpen, activeTab]') + 800)
  assert.match(watchBlock, /fetchDaily\(\)/)
  assert.match(watchBlock, /fetchStreak\(\)/)
  assert.match(onboarding, /<DailyStreakRewardsModal/)
  assert.match(onboarding, /:streak-count="streakData\.streakCount"/)
  assert.match(onboarding, /:milestones="streakData\.milestones"/)
})

test('DailyStreakRewardsModal.vue accepts streakCount/maxDay/repeatEnabled/milestones props and renders the current count', () => {
  const modal = read('components/newsite/DailyStreakRewardsModal.vue')
  assert.match(modal, /streakCount:\s*\{\s*type:\s*Number/)
  assert.match(modal, /milestones:\s*\{\s*type:\s*Array/)
  assert.match(modal, /Current streak:.*\{\{\s*streakCount\s*\}\}/)
})
