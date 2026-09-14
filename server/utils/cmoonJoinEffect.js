// server/utils/cmoonJoinEffect.js
// Validation for admin-authored CMoonJoinEffect rows — the customizable alternative to the
// closed CMoonEffectType enum (see prisma/schema.prisma). Kept as its own file rather than
// growing server/utils/cmoon.js further, matching this codebase's convention of splitting
// cMoon-adjacent concerns into dedicated files (cmoonRankTiers.js, cmoonImageStorage.js, ...).
export const NAME_MAX_LENGTH = 60
export const TEXT_MAX_LENGTH = 80

export const TEXT_POSITIONS = ['ABOVE_IMAGE', 'BELOW_IMAGE']

export function isValidJoinEffectTextPosition(value) {
  return TEXT_POSITIONS.includes(value)
}

// Caption length is capped tight (vs. a generic long-text field) because this renders as a
// single line of large clamp()-scaled text over a full-screen image on a 320px phone — see
// components/effects/CustomJoinEffect.vue and the mobile-friendliness review this feature went
// through: an uncapped caption reliably overflows or wraps unreadably on small screens.
export function isValidJoinEffectText(value) {
  return value === null || (typeof value === 'string' && value.length <= TEXT_MAX_LENGTH)
}

export function isValidJoinEffectName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= NAME_MAX_LENGTH
}
