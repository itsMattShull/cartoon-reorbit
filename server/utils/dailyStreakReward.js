// Pure validator for one DailyStreakReward row (Admin > Manage Daily Streak). Same import-free,
// DB-free contract as server/utils/myOrbitRoom.js/myOrbitAssets.js — the route handler does its
// own DB existence checks (does this ctoonId/packId actually exist) and the actual create/delete.
export const DAILY_STREAK_REWARD_TYPES = Object.freeze(['CTOON', 'PACK', 'POINTS', 'CMOON_POINTS'])
export const DAILY_STREAK_DAY_MIN = 1
export const DAILY_STREAK_DAY_MAX = 3650 // ~10 years - generous, but not literally unbounded
export const DAILY_STREAK_AMOUNT_MIN = 1
export const DAILY_STREAK_AMOUNT_MAX = 100000
// CTOON/PACK amounts are a COPY COUNT granted to every qualifying player on that streak day,
// not a points value — the admin UI itself has always labeled this field "Qty (1-20)" (its
// intent is a reasonable per-day drop, never a mass mint), but nothing actually enforced that
// tighter cap until now: an admin typing or pasting a large number straight into the input
// bypassed the HTML `max` attribute (which only clamps the stepper arrows) and this validator's
// own, much larger, POINTS/CMOON_POINTS-oriented ceiling.
export const DAILY_STREAK_COPY_AMOUNT_MAX = 20

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

/**
 * `body` is the raw request body for creating ONE reward row. Returns `{ ok: true, data }` with
 * `data` shaped exactly like the Prisma create input (`day`, `rewardType`, plus exactly the one
 * id/amount field that reward type needs, every other field explicitly null) or
 * `{ ok: false, message }`.
 */
export function parseDailyStreakRewardBody(body) {
  const day = toNumber(body?.day)
  if (!Number.isInteger(day) || day < DAILY_STREAK_DAY_MIN || day > DAILY_STREAK_DAY_MAX) {
    return { ok: false, message: `Day must be a whole number between ${DAILY_STREAK_DAY_MIN} and ${DAILY_STREAK_DAY_MAX}` }
  }

  const rewardType = typeof body?.rewardType === 'string' ? body.rewardType.trim() : ''
  if (!DAILY_STREAK_REWARD_TYPES.includes(rewardType)) {
    return { ok: false, message: `Reward type must be one of ${DAILY_STREAK_REWARD_TYPES.join(', ')}` }
  }

  const ctoonId = typeof body?.ctoonId === 'string' && body.ctoonId ? body.ctoonId : null
  const packId = typeof body?.packId === 'string' && body.packId ? body.packId : null

  if (rewardType === 'CTOON' && !ctoonId) return { ok: false, message: 'ctoonId is required when the reward type is CTOON' }
  if (rewardType === 'PACK' && !packId) return { ok: false, message: 'packId is required when the reward type is PACK' }
  if (rewardType !== 'CTOON' && ctoonId) return { ok: false, message: `Reward type ${rewardType} must not set ctoonId` }
  if (rewardType !== 'PACK' && packId) return { ok: false, message: `Reward type ${rewardType} must not set packId` }

  // `amount` means a copy count for CTOON/PACK, a points amount for POINTS/CMOON_POINTS. Required
  // for every type, no silent default — an admin adding a prize with no amount is far more likely
  // a mistake than a deliberate "0 of this". CTOON/PACK gets its own, much tighter ceiling (see
  // DAILY_STREAK_COPY_AMOUNT_MAX's own comment) — every qualifying player receives this many
  // copies on that streak day, so the generous points/cMoon-points range would let a typo mint
  // thousands of copies of a single cToon instead of merely awarding an oversized points reward.
  const amountMax = (rewardType === 'CTOON' || rewardType === 'PACK') ? DAILY_STREAK_COPY_AMOUNT_MAX : DAILY_STREAK_AMOUNT_MAX
  const amount = toNumber(body?.amount)
  if (!Number.isInteger(amount) || amount < DAILY_STREAK_AMOUNT_MIN || amount > amountMax) {
    return { ok: false, message: `Amount must be a whole number between ${DAILY_STREAK_AMOUNT_MIN} and ${amountMax}` }
  }

  return { ok: true, data: { day, rewardType, ctoonId, packId, amount } }
}
