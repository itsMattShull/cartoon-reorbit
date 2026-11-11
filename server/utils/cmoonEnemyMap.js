// server/utils/cmoonEnemyMap.js
//
// Pure, DB-free map-selection logic AND admin request-body validation for "cMoon Enemy Maps"
// (CMoonEnemyMap) — animated raid-battle backgrounds, used by BOTH NPC raids
// (server/utils/cmoonRaidSocket.js) and cMoon PvP matches (server/utils/cmoonPvpSocket.js),
// never solo battles. The selection functions take already-loaded rows (the caller's own
// Prisma query) and return a plain decision — no I/O, matching this codebase's own precedent
// for keeping selection/pairing math testable in isolation (pickWeightedEnemy in cmoonEnemy.js,
// cmoonPvpTournament.js's bracket math). parseEnemyMapBody below follows that same file's own
// parseFactionBody/parseMemberBody "body field undefined => keep existing" convention — kept
// here rather than in cmoonEnemy.js since this whole model is this file's own concern.
//
// Resolution order for a RAID: the boss's own overrideMapId (if isRaidBoss and set) wins
// outright, even if that map is currently inactive — an admin assigning a map to a specific
// boss is a deliberate choice that shouldn't silently stop working the moment the map is
// toggled off (same "persists independent of the flag" stance CMoonEnemyMember.raidRoundLimit
// etc. already take). Else the faction's own defaultMapId, same "still honored even if
// inactive" rule. Else a weighted-random pick from the active, non-assignedEnemiesOnly pool.
// PvP has no faction/boss concept at all, so it always draws from that same random pool.
//
// Deliberately NOT importing isValidHexColor from cmoon.js here, even though the check is
// identical (see HEX_COLOR_RE there) — cmoon.js transitively pulls in queues.js's BullMQ/Redis
// connections, Discord, and cron aggregation, which breaks this file's own "pure, DB-free"
// contract (and, in a test/sandbox process with no reachable Redis, leaves dangling reconnect
// timers that keep the process from ever exiting).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

// Relative weight in the random-pool pick — NOT a percent out of 100, never required to sum
// to 100 across the pool (see CMoonEnemyMap.occurrenceWeight's own schema comment), same
// "non-positive/non-finite weight floors to 1 rather than being excluded outright" semantics
// pickWeightedSpecialAttack (cmoonEnemyBattle.js) already uses for an analogous weighted list.
export function pickWeightedMap(candidates) {
  if (!candidates?.length) return null
  const weights = candidates.map(c => {
    const w = Number(c.occurrenceWeight)
    return Number.isFinite(w) && w > 0 ? w : 1
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  // Floating-point rounding can in principle leave `roll` fractionally positive after the last
  // subtraction — the last candidate is the correct pick either way (its slice is what was left).
  return candidates[candidates.length - 1]
}

// The pool a random pick (raid fallback or any PvP match) draws from — every map actually
// biddable for THIS roll. A map excluded by assignedEnemiesOnly can still be reached via an
// explicit override/default, just never by this random pool.
function randomPool(activeMaps) {
  return (activeMaps || []).filter(m => m?.active && !m.assignedEnemiesOnly)
}

// `enemyMember` is the raid boss actually being fought ({ isRaidBoss, overrideMap } — the
// relation itself, not just overrideMapId, so an inactive-but-assigned map still resolves
// correctly without a second lookup). `faction` is that boss's own CMoonEnemyFaction ({
// defaultMap }). `activeMaps` is every currently-active CMoonEnemyMap row, used only for the
// final random-pool fallback.
export function resolveMapForRaid(enemyMember, faction, activeMaps) {
  if (enemyMember?.isRaidBoss && enemyMember.overrideMap) return enemyMember.overrideMap
  if (faction?.defaultMap) return faction.defaultMap
  return pickWeightedMap(randomPool(activeMaps))
}

// PvP has no faction/boss to check — always the same random pool a raid falls back to.
export function resolveMapForPvp(activeMaps) {
  return pickWeightedMap(randomPool(activeMaps))
}

/* ── Admin request-body validation ───────────────────────────────────────────────────────────── */

export const MAP_NAME_MAX_LENGTH = 80
export const MAP_ANIMATIONS = ['GLOW', 'SMOKE', 'GLITTER', 'STATIC_COLOR']
// Same range/semantics as CMoonEnemyMember.occurrencePercent (cmoonEnemy.js) — a relative
// weight, not a percent out of 100, just reusing that same familiar 1-100 admin-facing range.
export const OCCURRENCE_WEIGHT_MIN = 1
export const OCCURRENCE_WEIGHT_MAX = 100
export const OCCURRENCE_WEIGHT_DEFAULT = 50
export const SPECIAL_THRESHOLD_REDUCTION_MIN = 0
export const SPECIAL_THRESHOLD_REDUCTION_MAX = 9
export const MAP_HAZARD_AMOUNT_MIN = 0
export const MAP_HAZARD_AMOUNT_MAX = 100
export const MAP_HAZARD_INTERVAL_MIN = 0
export const MAP_HAZARD_INTERVAL_MAX = 50

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}
function toBoolean(value, fallback) {
  if (value === undefined) return fallback
  return typeof value === 'boolean' ? value : null
}

// Same "body field undefined => keep existing (or default on create)" convention as
// parseFactionBody/parseMemberBody in cmoonEnemy.js. `existing` is the current row on an
// update (undefined on create). `isBaseMap` is deliberately never read from `body` at all —
// it's set once by this feature's own seed migration and never admin-editable (see
// CMoonEnemyMap.isBaseMap's own schema comment) — but the CALLER (the PUT endpoint) still
// restricts a base-map update to occurrenceWeight only, since this function alone can't know
// which row it's validating against is the protected one.
export function parseEnemyMapBody(body, existing) {
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : (typeof body.name === 'string' ? body.name.trim() : '')
  const active = toBoolean(body?.active, existing ? !!existing.active : false)
  const backgroundAnimation = body?.backgroundAnimation === undefined
    ? (existing ? existing.backgroundAnimation : 'STATIC_COLOR')
    : (typeof body.backgroundAnimation === 'string' ? body.backgroundAnimation.trim() : '')
  const backgroundColor = body?.backgroundColor === undefined
    ? (existing ? existing.backgroundColor : '#000000')
    : (typeof body.backgroundColor === 'string' ? body.backgroundColor.trim() : '')
  const occurrenceWeight = body?.occurrenceWeight === undefined
    ? (existing ? existing.occurrenceWeight : OCCURRENCE_WEIGHT_DEFAULT)
    : toNumber(body.occurrenceWeight)
  const assignedEnemiesOnly = toBoolean(body?.assignedEnemiesOnly, existing ? !!existing.assignedEnemiesOnly : false)
  const specialThresholdReduction = body?.specialThresholdReduction === undefined
    ? (existing ? existing.specialThresholdReduction : 0)
    : toNumber(body.specialThresholdReduction)
  const poisonAmount = body?.poisonAmount === undefined
    ? (existing ? existing.poisonAmount : 0)
    : toNumber(body.poisonAmount)
  const poisonIntervalRounds = body?.poisonIntervalRounds === undefined
    ? (existing ? existing.poisonIntervalRounds : 0)
    : toNumber(body.poisonIntervalRounds)
  const poisonAffectsPlayers = toBoolean(body?.poisonAffectsPlayers, existing ? existing.poisonAffectsPlayers !== false : true)
  const poisonAffectsEnemies = toBoolean(body?.poisonAffectsEnemies, existing ? existing.poisonAffectsEnemies !== false : true)
  const healAmount = body?.healAmount === undefined
    ? (existing ? existing.healAmount : 0)
    : toNumber(body.healAmount)
  const healIntervalRounds = body?.healIntervalRounds === undefined
    ? (existing ? existing.healIntervalRounds : 0)
    : toNumber(body.healIntervalRounds)
  const healAffectsPlayers = toBoolean(body?.healAffectsPlayers, existing ? existing.healAffectsPlayers !== false : true)
  const healAffectsEnemies = toBoolean(body?.healAffectsEnemies, existing ? existing.healAffectsEnemies !== false : true)
  const fogOfWarEnabled = toBoolean(body?.fogOfWarEnabled, existing ? !!existing.fogOfWarEnabled : false)

  if (!name || name.length > MAP_NAME_MAX_LENGTH) {
    return { ok: false, message: `Name is required (max ${MAP_NAME_MAX_LENGTH} characters)` }
  }
  if (active === null) return { ok: false, message: 'Active must be true or false' }
  if (!MAP_ANIMATIONS.includes(backgroundAnimation)) {
    return { ok: false, message: `Background animation must be one of ${MAP_ANIMATIONS.join(', ')}` }
  }
  if (!isValidHexColor(backgroundColor)) {
    return { ok: false, message: 'Background color must be a valid #RRGGBB hex color' }
  }
  if (!Number.isInteger(occurrenceWeight) || occurrenceWeight < OCCURRENCE_WEIGHT_MIN || occurrenceWeight > OCCURRENCE_WEIGHT_MAX) {
    return { ok: false, message: `Occurrence weight must be a whole number between ${OCCURRENCE_WEIGHT_MIN} and ${OCCURRENCE_WEIGHT_MAX}` }
  }
  if (assignedEnemiesOnly === null) return { ok: false, message: 'Assigned enemies only must be true or false' }
  if (!Number.isInteger(specialThresholdReduction) || specialThresholdReduction < SPECIAL_THRESHOLD_REDUCTION_MIN || specialThresholdReduction > SPECIAL_THRESHOLD_REDUCTION_MAX) {
    return { ok: false, message: `Special threshold reduction must be a whole number between ${SPECIAL_THRESHOLD_REDUCTION_MIN} and ${SPECIAL_THRESHOLD_REDUCTION_MAX}` }
  }
  if (!Number.isInteger(poisonAmount) || poisonAmount < MAP_HAZARD_AMOUNT_MIN || poisonAmount > MAP_HAZARD_AMOUNT_MAX) {
    return { ok: false, message: `Poison amount must be a whole number between ${MAP_HAZARD_AMOUNT_MIN} and ${MAP_HAZARD_AMOUNT_MAX}` }
  }
  if (!Number.isInteger(poisonIntervalRounds) || poisonIntervalRounds < MAP_HAZARD_INTERVAL_MIN || poisonIntervalRounds > MAP_HAZARD_INTERVAL_MAX) {
    return { ok: false, message: `Poison interval must be a whole number of rounds between ${MAP_HAZARD_INTERVAL_MIN} and ${MAP_HAZARD_INTERVAL_MAX}` }
  }
  if (poisonAffectsPlayers === null) return { ok: false, message: 'Poison affects players must be true or false' }
  if (poisonAffectsEnemies === null) return { ok: false, message: 'Poison affects enemies must be true or false' }
  if (!Number.isInteger(healAmount) || healAmount < MAP_HAZARD_AMOUNT_MIN || healAmount > MAP_HAZARD_AMOUNT_MAX) {
    return { ok: false, message: `Heal amount must be a whole number between ${MAP_HAZARD_AMOUNT_MIN} and ${MAP_HAZARD_AMOUNT_MAX}` }
  }
  if (!Number.isInteger(healIntervalRounds) || healIntervalRounds < MAP_HAZARD_INTERVAL_MIN || healIntervalRounds > MAP_HAZARD_INTERVAL_MAX) {
    return { ok: false, message: `Heal interval must be a whole number of rounds between ${MAP_HAZARD_INTERVAL_MIN} and ${MAP_HAZARD_INTERVAL_MAX}` }
  }
  if (healAffectsPlayers === null) return { ok: false, message: 'Heal affects players must be true or false' }
  if (healAffectsEnemies === null) return { ok: false, message: 'Heal affects enemies must be true or false' }
  if (fogOfWarEnabled === null) return { ok: false, message: 'Fog of war must be true or false' }

  return {
    ok: true,
    data: {
      name, active, backgroundAnimation, backgroundColor, occurrenceWeight, assignedEnemiesOnly,
      specialThresholdReduction, poisonAmount, poisonIntervalRounds, poisonAffectsPlayers, poisonAffectsEnemies,
      healAmount, healIntervalRounds, healAffectsPlayers, healAffectsEnemies, fogOfWarEnabled,
    },
  }
}
