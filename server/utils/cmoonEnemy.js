// server/utils/cmoonEnemy.js
// Validation for the admin-authored side of the cMoon Enemy Battles mini-game —
// CMoonEnemyFaction, CMoonEnemyMember and CMoonEnemyReward rows (see prisma/schema.prisma's
// "cMoon Enemy Battles feature" section). Mirrors server/utils/czoneEffect.js's shape/convention:
// pure functions, no DB access — any "does the referenced row actually exist" check is the
// calling endpoint's job, since that needs Prisma and this module deliberately doesn't.
//
// The combat math itself lives separately in server/utils/cmoonEnemyBattle.js; this file is only
// about what an admin is allowed to save.

export const FACTION_NAME_MAX_LENGTH = 60
export const MEMBER_NAME_MAX_LENGTH = 60
// Free-text blurb shown in the admin list; capped so one runaway paste can't bloat every list
// response that includes it.
export const FACTION_DESCRIPTION_MAX_LENGTH = 500

// Every player starts a fight at PLAYER_MAX_HP (5, see cmoonEnemyBattle.js) and each round deals
// at most one hit either way, so a PER_PLAYER enemy much above ~5 HP is effectively unwinnable
// solo — the high end of this range exists for SHARED_POOL raid-style enemies, whose HP is
// chipped away by many players together.
export const MAX_HP_MIN = 1
export const MAX_HP_MAX = 200

export const CMOON_POINTS_REWARD_MIN = 0
export const CMOON_POINTS_REWARD_MAX = 5000

export const DROP_CHANCE_MIN = 0
export const DROP_CHANCE_MAX = 100

export const REWARD_QUANTITY_MIN = 1
export const REWARD_QUANTITY_MAX = 20

// Admin-list ordering only (see the GET endpoints' orderBy) — a generous but finite band so a
// malformed client value can't land something absurd in an Int column.
export const SORT_ORDER_MIN = -9999
export const SORT_ORDER_MAX = 9999

// Create-time defaults for the optional member fields — kept identical to the column defaults in
// prisma/schema.prisma so "omitted in the POST body" means the same thing as "never set".
export const MAX_HP_DEFAULT = 5
export const CMOON_POINTS_REWARD_DEFAULT = 10
export const REWARD_QUANTITY_DEFAULT = 1

export const BATTLE_MODES = ['PER_PLAYER', 'SHARED_POOL']
export const REWARD_TYPES = ['CTOON', 'AVATAR', 'BACKGROUND']

// Which id field a reward row of each type must carry — the XOR Prisma can't express (see the
// CMoonEnemyReward model's own comment).
const REWARD_ID_FIELD = { CTOON: 'ctoonId', AVATAR: 'avatarId', BACKGROUND: 'backgroundId' }
const REWARD_ID_FIELDS = Object.values(REWARD_ID_FIELD)

export function isValidFactionName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= FACTION_NAME_MAX_LENGTH
}

export function isValidMemberName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MEMBER_NAME_MAX_LENGTH
}

export function isValidBattleMode(value) {
  return BATTLE_MODES.includes(value)
}

export function isValidMaxHp(value) {
  return Number.isInteger(value) && value >= MAX_HP_MIN && value <= MAX_HP_MAX
}

export function isValidCMoonPointsReward(value) {
  return Number.isInteger(value) && value >= CMOON_POINTS_REWARD_MIN && value <= CMOON_POINTS_REWARD_MAX
}

export function isValidRewardType(value) {
  return REWARD_TYPES.includes(value)
}

export function isValidDropChance(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= DROP_CHANCE_MIN && value <= DROP_CHANCE_MAX
}

export function isValidRewardQuantity(value) {
  return Number.isInteger(value) && value >= REWARD_QUANTITY_MIN && value <= REWARD_QUANTITY_MAX
}

export function isValidSortOrder(value) {
  return Number.isInteger(value) && value >= SORT_ORDER_MIN && value <= SORT_ORDER_MAX
}

// Slightly stricter than czoneEffect.js's bare Number(body.field): only a real number or a
// non-blank numeric string is parsed; anything else (null, '', true, an object/array) becomes NaN
// so every isValid*() check below rejects it, rather than Number() quietly turning null/''/false
// into 0 and true into 1. No rounding either — 5.5 HP is rejected, not silently made 6.
function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

// `undefined` => keep `fallback`; otherwise the value must be a real boolean (a string 'false'
// would be truthy under a bare !!value, which is exactly the kind of silent flip we don't want on
// an on/off switch). Returns null for an invalid value so the caller can report it.
function toBoolean(value, fallback) {
  if (value === undefined) return fallback
  return typeof value === 'boolean' ? value : null
}

// Nullable id field: absent/null/'' => null, a non-empty string => that string, anything else
// (number, object, ...) => undefined, which callers treat as invalid.
function toOptionalId(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

// Shared by the faction create/update endpoints. `existing` is the current row on an update
// (undefined on create); `body.field === undefined` means "leave unchanged", same convention as
// parseCZoneEffectBody.
export function parseFactionBody(body, existing) {
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : (typeof body.name === 'string' ? body.name.trim() : '')

  let description
  if (body?.description === undefined) {
    description = existing ? existing.description : null
  } else if (body.description === null) {
    description = null
  } else if (typeof body.description === 'string') {
    description = body.description.trim() || null
  } else {
    return { ok: false, message: 'Description must be text' }
  }

  const active = toBoolean(body?.active, existing ? existing.active : true)
  const sortOrder = body?.sortOrder === undefined
    ? (existing ? existing.sortOrder : 0)
    : toNumber(body.sortOrder)

  if (!isValidFactionName(name)) {
    return { ok: false, message: `Name is required (max ${FACTION_NAME_MAX_LENGTH} characters)` }
  }
  if (description !== null && description.length > FACTION_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, message: `Description must be ${FACTION_DESCRIPTION_MAX_LENGTH} characters or fewer` }
  }
  if (active === null) {
    return { ok: false, message: 'Active must be true or false' }
  }
  if (!isValidSortOrder(sortOrder)) {
    return { ok: false, message: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}` }
  }

  return { ok: true, data: { name, description, active, sortOrder } }
}

// Shared by the member create/update endpoints, same `existing` convention as parseFactionBody.
// On an update the caller must pass `existing` as the current row PLUS a `hasBattles` boolean
// (whether any CMoonEnemyBattle row references this member) — this function can't query for it.
//
// Does NOT validate that `factionId` points at a real CMoonEnemyFaction (the caller does that
// against the DB), and does NOT touch `currentHp`/`defeatedAt`: those are derived side effects the
// endpoint applies on top of `data`, not raw body fields an admin sets directly —
//   - on create, the endpoint always sets currentHp = maxHp (harmless for PER_PLAYER, the correct
//     starting pool for SHARED_POOL);
//   - on update, the endpoint resets currentHp = maxHp only when a SHARED_POOL member's maxHp
//     actually changes (or it is newly switched to SHARED_POOL) — never on an unrelated edit like
//     a rename, which would silently revive a defeated shared-pool enemy. Reviving without a
//     maxHp change is its own explicit action (cmoon-enemy-members/[id]/reset.post.js).
export function parseMemberBody(body, existing) {
  const factionId = body?.factionId === undefined
    ? (existing ? existing.factionId : '')
    : (typeof body.factionId === 'string' ? body.factionId.trim() : '')
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : (typeof body.name === 'string' ? body.name.trim() : '')
  const maxHp = body?.maxHp === undefined
    ? (existing ? existing.maxHp : MAX_HP_DEFAULT)
    : toNumber(body.maxHp)
  const battleMode = body?.battleMode === undefined
    ? (existing ? existing.battleMode : 'PER_PLAYER')
    : (typeof body.battleMode === 'string' ? body.battleMode.trim() : '')
  const cMoonPointsReward = body?.cMoonPointsReward === undefined
    ? (existing ? existing.cMoonPointsReward : CMOON_POINTS_REWARD_DEFAULT)
    : toNumber(body.cMoonPointsReward)
  const active = toBoolean(body?.active, existing ? existing.active : true)
  const sortOrder = body?.sortOrder === undefined
    ? (existing ? existing.sortOrder : 0)
    : toNumber(body.sortOrder)

  if (!factionId) {
    return { ok: false, message: 'Faction is required' }
  }
  if (!isValidMemberName(name)) {
    return { ok: false, message: `Name is required (max ${MEMBER_NAME_MAX_LENGTH} characters)` }
  }
  if (!isValidBattleMode(battleMode)) {
    return { ok: false, message: 'Battle mode must be PER_PLAYER or SHARED_POOL' }
  }
  if (existing && existing.hasBattles && battleMode !== existing.battleMode) {
    // Same idea as czoneEffect.js's "kind cannot change after creation": flipping PER_PLAYER <->
    // SHARED_POOL under an enemy that already has battle history would make its logged fights
    // mean something different after the fact (per-battle HP vs. one shared pool) and could strand
    // an in-progress battle mid-fight under the other mode's rules. Compared against the RESOLVED
    // mode (not raw body.battleMode) so an omitted field is never mistaken for a change.
    return { ok: false, message: 'Battle mode cannot change once this enemy has been fought' }
  }
  if (!isValidMaxHp(maxHp)) {
    return { ok: false, message: `Max HP must be a whole number between ${MAX_HP_MIN} and ${MAX_HP_MAX}` }
  }
  if (!isValidCMoonPointsReward(cMoonPointsReward)) {
    return { ok: false, message: `cMoon points reward must be a whole number between ${CMOON_POINTS_REWARD_MIN} and ${CMOON_POINTS_REWARD_MAX}` }
  }
  if (active === null) {
    return { ok: false, message: 'Active must be true or false' }
  }
  if (!isValidSortOrder(sortOrder)) {
    return { ok: false, message: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}` }
  }

  return { ok: true, data: { factionId, name, maxHp, battleMode, cMoonPointsReward, active, sortOrder } }
}

// Create-only (reward rows are added/removed whole, never partially patched — see
// cmoon-enemy-members/[id]/rewards.post.js), so there's no `existing` parameter. Enforces the
// exactly-one-id-matching-rewardType rule here, since Prisma can't: the id field for the chosen
// type must be set, and the other two must be absent/null/''. Existence of the referenced
// cToon/avatar/background is the caller's DB check.
export function parseRewardBody(body) {
  const rewardType = typeof body?.rewardType === 'string' ? body.rewardType.trim() : ''
  if (!isValidRewardType(rewardType)) {
    return { ok: false, message: 'Reward type must be CTOON, AVATAR, or BACKGROUND' }
  }

  const ids = {}
  for (const field of REWARD_ID_FIELDS) {
    const parsed = toOptionalId(body?.[field])
    if (parsed === undefined) return { ok: false, message: `${field} must be a string id` }
    ids[field] = parsed
  }
  const wantField = REWARD_ID_FIELD[rewardType]
  if (!ids[wantField]) {
    return { ok: false, message: `${wantField} is required when the reward type is ${rewardType}` }
  }
  const extra = REWARD_ID_FIELDS.filter(f => f !== wantField && ids[f])
  if (extra.length) {
    return { ok: false, message: `Reward type ${rewardType} must set only ${wantField} (got ${extra.join(', ')} too)` }
  }

  // Required, no silent default: this is the one number that decides how often a prize drops,
  // so an omitted value is far more likely a client bug than a deliberate "use 10%".
  const dropChancePercent = toNumber(body?.dropChancePercent)
  if (!isValidDropChance(dropChancePercent)) {
    return { ok: false, message: `Drop chance must be a number between ${DROP_CHANCE_MIN} and ${DROP_CHANCE_MAX}` }
  }

  // quantity only means anything for cToons (see the schema comment + buildGrantableReward);
  // for avatars/backgrounds it's stored as 1 regardless of the body, so a stray value from the
  // client can't leave a misleading number in the admin list.
  let quantity = REWARD_QUANTITY_DEFAULT
  if (rewardType === 'CTOON' && body?.quantity !== undefined) {
    quantity = toNumber(body.quantity)
    if (!isValidRewardQuantity(quantity)) {
      return { ok: false, message: `Quantity must be a whole number between ${REWARD_QUANTITY_MIN} and ${REWARD_QUANTITY_MAX}` }
    }
  }

  return {
    ok: true,
    data: {
      rewardType,
      ctoonId: ids.ctoonId,
      avatarId: ids.avatarId,
      backgroundId: ids.backgroundId,
      dropChancePercent,
      quantity,
    },
  }
}
