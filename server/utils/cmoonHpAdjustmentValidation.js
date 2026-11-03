// server/utils/cmoonHpAdjustmentValidation.js
// Pure (no Prisma/achievements import) validation for the admin "Manage User HP" tool
// (server/api/admin/users/[id]/hp.post.js, server/api/admin/users/hp-mass-adjust.post.js) — kept
// import-free so it can be unit-tested directly, same split as cmoonPrestigeRankValidation.js vs
// cmoonPrestigeRankTiers.js (see that file's own comment on why server/utils/cmoon.js can't be
// imported in a short-lived test process).
import { MAX_HP_MIN, MAX_HP_MAX } from './cmoonEnemy.js'

export const HP_TARGET_MIN = MAX_HP_MIN
export const HP_TARGET_MAX = MAX_HP_MAX
export const HP_DELTA_MIN = -MAX_HP_MAX
export const HP_DELTA_MAX = MAX_HP_MAX

// Body for setting one player's effective HP to an exact number.
export function validateSetUserHpBody(body) {
  const targetHp = Number(body?.targetHp)
  if (!Number.isInteger(targetHp) || targetHp < HP_TARGET_MIN || targetHp > HP_TARGET_MAX) {
    return { error: `targetHp must be a whole number between ${HP_TARGET_MIN} and ${HP_TARGET_MAX}` }
  }
  return { targetHp }
}

// Body for the mass tool — mode 'delta' raises/lowers everyone's HP BY a number (can be negative),
// mode 'absolute' sets everyone's HP TO a number, both computed off each player's own natural
// (default + rank-bonus) HP so a later rank-up still adds on top either way.
export function validateMassHpAdjustBody(body) {
  const mode = body?.mode
  if (mode !== 'delta' && mode !== 'absolute') {
    return { error: "mode must be 'delta' or 'absolute'" }
  }
  const value = Number(body?.value)
  if (mode === 'delta') {
    if (!Number.isInteger(value) || value < HP_DELTA_MIN || value > HP_DELTA_MAX || value === 0) {
      return { error: `value must be a non-zero whole number between ${HP_DELTA_MIN} and ${HP_DELTA_MAX}` }
    }
    return { mode, value }
  }
  if (!Number.isInteger(value) || value < HP_TARGET_MIN || value > HP_TARGET_MAX) {
    return { error: `value must be a whole number between ${HP_TARGET_MIN} and ${HP_TARGET_MAX}` }
  }
  return { mode, value }
}
