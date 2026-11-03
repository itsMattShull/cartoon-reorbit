// server/utils/cmoonStaminaAdjustmentValidation.js
// Pure (no Prisma/achievements import) validation for the "Manage User HP" admin tool's Stamina
// section (server/api/admin/users/[id]/stamina.post.js, server/api/admin/users/
// stamina-mass-adjust.post.js) — mirrors cmoonHpAdjustmentValidation.js exactly; see that file's
// own comment on why this stays import-free.
//
// Bounds match GlobalGameConfig.cMoonEnemyBattleStartingStamina's own admin-settings validation
// (server/api/admin/cmoon-settings.post.js: "a whole number between 0 and 50") — 0 is a valid
// target here (it's the same "mechanic off" state the global default already supports), unlike
// HP_TARGET_MIN (1), which can never be 0 since combinePlayerMaxHp floors HP at 1.
export const STAMINA_TARGET_MIN = 0
export const STAMINA_TARGET_MAX = 50
export const STAMINA_DELTA_MIN = -STAMINA_TARGET_MAX
export const STAMINA_DELTA_MAX = STAMINA_TARGET_MAX

// Body for setting one player's natural max stamina to an exact number.
export function validateSetUserStaminaBody(body) {
  const targetStamina = Number(body?.targetStamina)
  if (!Number.isInteger(targetStamina) || targetStamina < STAMINA_TARGET_MIN || targetStamina > STAMINA_TARGET_MAX) {
    return { error: `targetStamina must be a whole number between ${STAMINA_TARGET_MIN} and ${STAMINA_TARGET_MAX}` }
  }
  return { targetStamina }
}

// Body for the mass tool — mode 'delta' raises/lowers everyone's stamina BY a number (can be
// negative), mode 'absolute' sets everyone's stamina TO a number.
export function validateMassStaminaAdjustBody(body) {
  const mode = body?.mode
  if (mode !== 'delta' && mode !== 'absolute') {
    return { error: "mode must be 'delta' or 'absolute'" }
  }
  const value = Number(body?.value)
  if (mode === 'delta') {
    if (!Number.isInteger(value) || value < STAMINA_DELTA_MIN || value > STAMINA_DELTA_MAX || value === 0) {
      return { error: `value must be a non-zero whole number between ${STAMINA_DELTA_MIN} and ${STAMINA_DELTA_MAX}` }
    }
    return { mode, value }
  }
  if (!Number.isInteger(value) || value < STAMINA_TARGET_MIN || value > STAMINA_TARGET_MAX) {
    return { error: `value must be a whole number between ${STAMINA_TARGET_MIN} and ${STAMINA_TARGET_MAX}` }
  }
  return { mode, value }
}
