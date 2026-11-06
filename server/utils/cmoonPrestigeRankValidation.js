// server/utils/cmoonPrestigeRankValidation.js
//
// Pure validation for CMoonPrestigeRankTier bodies — kept free of any Prisma/achievements.js
// import (unlike server/utils/cmoonPrestigeRankTiers.js, which re-exports this and does the
// actual DB provisioning/granting) so this can be unit-tested directly without pulling in
// Prisma/BullMQ/Discord, same "pure logic has no heavy imports" split server/utils/
// cmoonPrestigeLevels.js (vs cmoonPrestige.js) and server/utils/cmoonEnemyRaid.js already use.
import {
  REWARD_TYPES, isValidRewardType, REWARD_QUANTITY_MIN, REWARD_QUANTITY_MAX, isValidRewardQuantity,
  POINTS_REWARD_MIN, POINTS_REWARD_MAX, isValidPointsAmount,
} from './cmoonEnemy.js'

export const PRESTIGE_RANK_THRESHOLD_MAX = 5_000_000
const REWARD_ID_FIELD = { CTOON: 'ctoonId', AVATAR: 'avatarId', BACKGROUND: 'backgroundId', PACK: 'packId' }
const REWARD_ID_FIELDS = Object.values(REWARD_ID_FIELD)

// Same discipline as cmoonEnemy.js's own toNumber/toOptionalId (not exported there, so mirrored
// here rather than widening that file's public API for two tiny internal helpers).
function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}
function toOptionalId(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

// Parses + validates a create/edit request body for one prestige-rank tier into the tier's
// column values, or { error: '<message>' } if invalid. `existing` supplies the fallback for an
// edit's omitted fields; omit it for a create. Mirrors parseRewardBody's exact XOR-by-reward-type
// id validation (server/utils/cmoonEnemy.js) since CMoonPrestigeRankTier's reward union is the
// same five-type shape CMoonEnemyReward already uses, and parsePrestigeLevelBody's existing-
// fallback convention (server/utils/cmoonPrestigeLevels.js).
export function parsePrestigeRankTierBody(body, existing = null) {
  const name = body?.name === undefined && existing ? existing.name : (typeof body?.name === 'string' ? body.name.trim() : '')
  const sortOrder = body?.sortOrder === undefined && existing ? existing.sortOrder : Math.trunc(toNumber(body?.sortOrder))
  const pointThreshold = body?.pointThreshold === undefined && existing ? existing.pointThreshold : Math.trunc(toNumber(body?.pointThreshold))
  const rewardType = body?.rewardType === undefined && existing ? existing.rewardType : (typeof body?.rewardType === 'string' ? body.rewardType.trim() : '')

  if (!name) return { error: 'Name is required' }
  if (!Number.isInteger(sortOrder)) return { error: 'Sort order must be a whole number' }
  if (!Number.isInteger(pointThreshold) || pointThreshold < 0 || pointThreshold > PRESTIGE_RANK_THRESHOLD_MAX) {
    return { error: `Point threshold must be a non-negative whole number up to ${PRESTIGE_RANK_THRESHOLD_MAX}` }
  }
  if (!isValidRewardType(rewardType)) {
    return { error: `Reward type must be one of ${REWARD_TYPES.join(', ')}` }
  }

  const ids = {}
  for (const field of REWARD_ID_FIELDS) {
    const raw = body?.[field] === undefined && existing ? existing[field] : body?.[field]
    const parsed = toOptionalId(raw)
    if (parsed === undefined) return { error: `${field} must be a string id` }
    ids[field] = parsed
  }
  const wantField = REWARD_ID_FIELD[rewardType]
  if (wantField) {
    if (!ids[wantField]) return { error: `${wantField} is required when the reward type is ${rewardType}` }
    const extra = REWARD_ID_FIELDS.filter(f => f !== wantField && ids[f])
    if (extra.length) return { error: `Reward type ${rewardType} must set only ${wantField} (got ${extra.join(', ')} too)` }
  } else {
    const extra = REWARD_ID_FIELDS.filter(f => ids[f])
    if (extra.length) return { error: `Reward type ${rewardType} must not set ${extra.join(', ')}` }
  }

  let quantity = 1
  const rawQuantity = body?.quantity === undefined && existing ? existing.quantity : body?.quantity
  if (rewardType === 'CTOON' || rewardType === 'PACK') {
    quantity = rawQuantity === undefined ? 1 : Math.trunc(toNumber(rawQuantity))
    if (!isValidRewardQuantity(quantity)) {
      return { error: `Quantity must be a whole number between ${REWARD_QUANTITY_MIN} and ${REWARD_QUANTITY_MAX}` }
    }
  } else if (rewardType === 'POINTS') {
    quantity = Math.trunc(toNumber(rawQuantity))
    if (!isValidPointsAmount(quantity)) {
      return { error: `Points amount must be a whole number between ${POINTS_REWARD_MIN} and ${POINTS_REWARD_MAX}` }
    }
  }

  return {
    name, sortOrder, pointThreshold, rewardType,
    ctoonId: ids.ctoonId, avatarId: ids.avatarId, backgroundId: ids.backgroundId, packId: ids.packId,
    quantity,
  }
}
