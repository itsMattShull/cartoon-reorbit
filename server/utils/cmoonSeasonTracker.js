// server/utils/cmoonSeasonTracker.js
// Validation + parsing for admin-defined cMoon season progress trackers — mirrors
// server/utils/cmoonEnemy.js's shape/convention: pure functions, no DB access.
export const LABEL_MAX_LENGTH = 60
export const METRIC_TYPES = ['BATTLE_WINS', 'BATTLE_LOSSES', 'TEAM_SCORE', 'AVG_POINTS']
export const TARGET_VALUE_MIN = 0
export const TARGET_VALUE_MAX = 1_000_000
export const SORT_ORDER_MIN = -9999
export const SORT_ORDER_MAX = 9999

export function isValidLabel(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= LABEL_MAX_LENGTH
}

export function isValidMetricType(value) {
  return METRIC_TYPES.includes(value)
}

export function isValidTargetValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > TARGET_VALUE_MIN && value <= TARGET_VALUE_MAX
}

export function isValidSortOrder(value) {
  return Number.isInteger(value) && value >= SORT_ORDER_MIN && value <= SORT_ORDER_MAX
}

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

function toBoolean(value, fallback) {
  if (value === undefined) return fallback
  return typeof value === 'boolean' ? value : null
}

// `existing` is the current row on an update (undefined on create), same `undefined` = "leave
// unchanged" convention as parseFactionBody/parseMemberBody in cmoonEnemy.js. metricType CAN be
// changed after creation (unlike CMoonEnemyMember.battleMode, which locks once fought) — a
// tracker has no history of its own to invalidate, it's just re-read live on every request, so
// changing what it measures is always safe.
export function parseTrackerBody(input, existing) {
  const label = input?.label === undefined
    ? (existing ? existing.label : '')
    : (typeof input.label === 'string' ? input.label.trim() : '')

  const metricType = input?.metricType === undefined
    ? (existing ? existing.metricType : '')
    : (typeof input.metricType === 'string' ? input.metricType.trim() : '')

  const targetValue = input?.targetValue === undefined
    ? (existing ? existing.targetValue : NaN)
    : toNumber(input.targetValue)

  const active = toBoolean(input?.active, existing ? existing.active : true)
  const sortOrder = input?.sortOrder === undefined
    ? (existing ? existing.sortOrder : 0)
    : toNumber(input.sortOrder)

  if (!isValidLabel(label)) {
    return { ok: false, message: `Label is required (max ${LABEL_MAX_LENGTH} characters)` }
  }
  if (!isValidMetricType(metricType)) {
    return { ok: false, message: 'Metric must be one of: ' + METRIC_TYPES.join(', ') }
  }
  if (!isValidTargetValue(targetValue)) {
    return { ok: false, message: `Target must be a number greater than 0 (up to ${TARGET_VALUE_MAX})` }
  }
  if (active === null) {
    return { ok: false, message: 'Active must be true or false' }
  }
  if (!isValidSortOrder(sortOrder)) {
    return { ok: false, message: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}` }
  }

  return { ok: true, data: { label, metricType, targetValue, active, sortOrder } }
}
