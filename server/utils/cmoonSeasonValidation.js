// server/utils/cmoonSeasonValidation.js
// Validation + parsing for admin season create/edit bodies — mirrors server/utils/
// cmoonSeasonTracker.js's shape/convention (pure functions, no DB access) and reuses its
// per-tracker field validators so a season's trackers array is checked identically to how the
// retired standalone tracker endpoints validated them.
import {
  isValidLabel, isValidMetricType, isValidTargetValue, isValidSortOrder,
  LABEL_MAX_LENGTH,
} from './cmoonSeasonTracker.js'

export const HEADER_MAX_LENGTH = 80
export const ENEMIES_GOAL_LABEL_MAX_LENGTH = 60
export const ENEMIES_GOAL_TARGET_MIN = 1
export const ENEMIES_GOAL_TARGET_MAX = 1_000_000

function parseDate(value, label) {
  if (!value) return { ok: false, message: `${label} is required` }
  const d = new Date(value)
  if (isNaN(d.getTime())) return { ok: false, message: `${label} is invalid` }
  return { ok: true, value: d }
}

function parseTrackers(input) {
  if (input === undefined) return { ok: true, value: [] }
  if (!Array.isArray(input)) return { ok: false, message: 'trackers must be an array' }
  const out = []
  for (const [i, t] of input.entries()) {
    const label = typeof t?.label === 'string' ? t.label.trim() : ''
    const metricType = typeof t?.metricType === 'string' ? t.metricType.trim() : ''
    const targetValue = typeof t?.targetValue === 'number' ? t.targetValue : Number(t?.targetValue)
    const active = typeof t?.active === 'boolean' ? t.active : true
    const sortOrder = Number.isInteger(t?.sortOrder) ? t.sortOrder : Math.trunc(Number(t?.sortOrder)) || i

    if (!isValidLabel(label)) return { ok: false, message: `trackers[${i}]: label is required (max ${LABEL_MAX_LENGTH} characters)` }
    if (!isValidMetricType(metricType)) return { ok: false, message: `trackers[${i}]: invalid metric` }
    if (!isValidTargetValue(targetValue)) return { ok: false, message: `trackers[${i}]: target must be a positive number` }
    if (!isValidSortOrder(sortOrder)) return { ok: false, message: `trackers[${i}]: invalid sort order` }

    out.push({ label, metricType, targetValue, active, sortOrder })
  }
  return { ok: true, value: out }
}

// Validates and normalizes a season create/edit body. Returns { ok: true, data, trackers } or
// { ok: false, message }. Does not sanitize the blurb (callers should run it through
// sanitizeEncyclopediaHtml themselves, same as the old cmoon-season.post.js did) or check
// start/end ordering against other seasons (see assertNoOverlap in cmoonSeasons.js) — this is pure
// shape/field validation only.
export function parseSeasonBody(body) {
  const header = typeof body?.header === 'string' ? body.header.trim() : ''
  if (!header || header.length > HEADER_MAX_LENGTH) {
    return { ok: false, message: `Header is required (max ${HEADER_MAX_LENGTH} characters)` }
  }

  const start = parseDate(body?.startAt, 'Start date')
  if (!start.ok) return start
  const end = parseDate(body?.endAt, 'End date')
  if (!end.ok) return end
  if (start.value >= end.value) {
    return { ok: false, message: 'Start date must be before end date' }
  }

  const enemiesDefeatedGoalEnabled = !!body?.enemiesDefeatedGoalEnabled
  const enemiesDefeatedGoalLabel = typeof body?.enemiesDefeatedGoalLabel === 'string' ? body.enemiesDefeatedGoalLabel.trim() : ''
  const enemiesDefeatedGoalTarget = Number(body?.enemiesDefeatedGoalTarget)

  if (enemiesDefeatedGoalEnabled) {
    if (!enemiesDefeatedGoalLabel || enemiesDefeatedGoalLabel.length > ENEMIES_GOAL_LABEL_MAX_LENGTH) {
      return { ok: false, message: `Enemies-defeated goal label is required (max ${ENEMIES_GOAL_LABEL_MAX_LENGTH} characters)` }
    }
    if (!Number.isInteger(enemiesDefeatedGoalTarget) || enemiesDefeatedGoalTarget < ENEMIES_GOAL_TARGET_MIN || enemiesDefeatedGoalTarget > ENEMIES_GOAL_TARGET_MAX) {
      return { ok: false, message: `Enemies-defeated goal target must be a whole number between ${ENEMIES_GOAL_TARGET_MIN} and ${ENEMIES_GOAL_TARGET_MAX}` }
    }
  }

  const trackers = parseTrackers(body?.trackers)
  if (!trackers.ok) return trackers

  return {
    ok: true,
    data: {
      header,
      startAt: start.value,
      endAt: end.value,
      enemiesDefeatedGoalEnabled,
      enemiesDefeatedGoalLabel: enemiesDefeatedGoalLabel || 'Enemies Defeated',
      enemiesDefeatedGoalTarget: Number.isInteger(enemiesDefeatedGoalTarget) ? enemiesDefeatedGoalTarget : 1000,
    },
    trackers: trackers.value,
  }
}
