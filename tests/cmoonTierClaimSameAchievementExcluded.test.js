import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// server/utils/achievements.js pulls in server/utils/queues.js (BullMQ Queue construction) and
// server/utils/discord.js transitively, so this is read as text rather than imported — same
// reasoning as tests/cmoonBalanceNoPrizeGrant.test.js and tests/cmoonEffectTypes.test.js.
//
// Requirement under test: claimAchievementReward's "has this universal rank tier's reward
// already been claimed in a DIFFERENT cMoon" guard must exclude the achievement being claimed
// right now from its own count. Without the `achievementId: { not: achievementId }` exclusion, a
// same-achievement double-submit retry (the exact case the per-achievement unique constraint on
// AchievementClaim exists to handle, per this function's own header comment) always loses the
// race to the broader tier-count check and reports the misleading TIER_ALREADY_CLAIMED
// ("...in another cMoon") instead of ALREADY_CLAIMED — even though no other cMoon is involved.
const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, '../server/utils/achievements.js'), 'utf8')

function claimAchievementRewardBody() {
  const start = src.indexOf('export async function claimAchievementReward')
  assert.ok(start !== -1, 'claimAchievementReward not found in server/utils/achievements.js — has it been renamed?')
  const nextFn = src.indexOf('\nexport ', start + 1)
  return src.slice(start, nextFn === -1 ? src.length : nextFn)
}

test('the cross-cMoon tier-claim guard excludes the achievement being claimed right now', () => {
  const body = claimAchievementRewardBody()
  const countCallStart = body.indexOf('const alreadyClaimedTier')
  assert.ok(countCallStart !== -1, 'alreadyClaimedTier guard not found — has claimAchievementReward been rewritten?')
  assert.ok(
    body.slice(countCallStart, countCallStart + 200).includes('tx.achievementClaim.count'),
    'alreadyClaimedTier is no longer assigned from tx.achievementClaim.count — has the guard been rewritten?',
  )

  // The count() call feeding that guard must filter out this exact achievementId, otherwise a
  // same-achievement retry always sees its own already-committed claim and reports the wrong,
  // cross-cMoon error code instead of falling through to the ordinary per-achievement
  // unique-constraint check (which reports ALREADY_CLAIMED).
  const countCallEnd = body.indexOf('})', countCallStart)
  const countCall = body.slice(countCallStart, countCallEnd)

  assert.ok(
    /achievementId:\s*\{\s*not:\s*achievementId\s*\}/.test(countCall),
    'the tier-claim count query must exclude `achievementId: { not: achievementId }` — otherwise a ' +
    'same-achievement double-submit retry reports TIER_ALREADY_CLAIMED ("claimed in another cMoon") ' +
    'instead of ALREADY_CLAIMED, even though no other cMoon is involved',
  )
})
