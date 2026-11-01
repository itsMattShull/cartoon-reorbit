// server/utils/cmoonPrestigeLevels.js
//
// Pure cMoon Prestige helpers — deliberately kept free of any Prisma import (unlike
// server/utils/cmoonPrestige.js, which re-exports everything here) so these can be unit-tested
// directly, same "pure logic has no imports" split server/utils/cmoonEnemyRaid.js already uses for
// publicParticipantTeam/rankTierLevel/etc.

// Admin-facing bounds for CMoonPrestigeLevel rows — shared by the create/edit admin endpoints
// (server/api/admin/cmoon-prestige-levels.post.js and .../[id].put.js) so they can never drift
// apart from each other.
export const PRESTIGE_LEVEL_MIN = 1
export const PRESTIGE_LEVEL_MAX = 100
// Same ceiling CMoonRankTier.pointThreshold already uses (server/api/admin/cmoon-rank-tiers.post.js)
// — this is the same kind of "cumulative cMoonPoints" number.
export const PRESTIGE_THRESHOLD_MAX = 5_000_000

export const CMOON_PRESTIGE_ERRORS = {
  DISABLED: 'DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  NO_CMOON: 'NO_CMOON',
  BELOW_THRESHOLD: 'BELOW_THRESHOLD',
  NO_LEVEL_CONFIGURED: 'NO_LEVEL_CONFIGURED',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  NOT_PRESTIGE_CMOON: 'NOT_PRESTIGE_CMOON',
  LOCKED: 'LOCKED',
  SAME_CMOON: 'SAME_CMOON',
  ACTIVE_BATTLE: 'ACTIVE_BATTLE',
  ACTIVE_RAID: 'ACTIVE_RAID',
}

export class CMoonPrestigeError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// Pure — given the full sorted list of configured levels and a player's CURRENT level, finds the
// row that unlocks their NEXT one (level: currentLevel + 1). Returns null if an admin hasn't
// configured that far yet, which is a normal, non-error state (see this module's own header
// comment) — not every player can expect to keep prestiging forever.
export function findNextPrestigeLevel(levels, currentLevel) {
  const target = (currentLevel || 0) + 1
  return levels.find(l => l.level === target) || null
}
