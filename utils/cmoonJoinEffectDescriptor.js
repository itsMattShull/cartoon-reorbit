// utils/cmoonJoinEffectDescriptor.js
// Builds the single descriptor shape useFullscreenEffect().play() expects, from any cMoon-shaped
// object (or a claim/select API response carrying the same two fields) that may have EITHER a
// built-in effectType OR a resolved customJoinEffect config — never both, see CMoon.effectType in
// prisma/schema.prisma. Centralized so every call site (CMoonSelectModal.vue,
// MyAchievements.vue, and the three admin preview helpers in AdminCMoon.vue) builds this the
// same way instead of re-deriving the branch each time.
export function cmoonJoinEffectDescriptor(source) {
  if (!source) return null
  if (source.customJoinEffect) return { type: 'CUSTOM', config: source.customJoinEffect }
  if (source.effectType) return { type: source.effectType }
  return null
}
