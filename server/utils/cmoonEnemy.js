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

export const CRIT_CHANCE_MIN = 0
export const CRIT_CHANCE_MAX = 100
export const CRIT_CHANCE_DEFAULT = 0

// A POINTS reward row's `quantity` is a points amount, not a copy count — same 0-5000 scale as
// CMoonEnemyMember.cMoonPointsReward, since both are "how many points does a win/prize add".
export const POINTS_REWARD_MIN = 1
export const POINTS_REWARD_MAX = 5000

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
export const REWARD_TYPES = ['CTOON', 'AVATAR', 'BACKGROUND', 'POINTS']

// Cosmetic difficulty/importance tier — see CMoonEnemyRank's own schema comment. Declared
// low-to-high, matching the admin dropdown and the enum's own declaration order.
export const ENEMY_RANKS = ['GOON', 'ENFORCER', 'UNDERBOSS', 'FINAL_BOSS']
export const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }
export const RANK_DEFAULT = 'GOON'

// A player's own lifetime cMoon Enemy Battle win count must be at least this before a member can
// be offered to them at all — see CMoonEnemyMember.minPriorDefeats' own schema comment. 0 (the
// default) means no requirement. The upper bound is generous rather than tight: an admin building
// a long unlock chain across many factions could reasonably want a high threshold.
export const MIN_PRIOR_DEFEATS_MIN = 0
export const MIN_PRIOR_DEFEATS_MAX = 100000
export const MIN_PRIOR_DEFEATS_DEFAULT = 0

// Admin-authored Discord template for a raid boss announcement — see
// CMoonEnemyMember.raidAnnouncementText's own schema comment for the {cmoon}/{enemy} placeholders.
// Same cap as FACTION_DESCRIPTION_MAX_LENGTH — one runaway paste shouldn't bloat the admin list.
export const RAID_ANNOUNCEMENT_MAX_LENGTH = 500

// The only CMoonEnemyMember columns a battle-sound upload may target — shared between
// cmoon-enemy-members/[id]/sound.post.js (which validates the client-sent `slot` field against
// this set before ever touching Prisma's `data`) and the admin UI, so the two can't drift.
export const MEMBER_SOUND_SLOTS = [
  'appearSoundPath',
  'damageTakenSoundPath',
  'damageAvoidedSoundPath',
  'attackingSoundPath',
  'victorySoundPath',
  'defeatSoundPath',
]

// Which id field a reward row of each type must carry — the XOR Prisma can't express (see the
// CMoonEnemyReward model's own comment). No entry for POINTS: it has no id column at all, its
// amount lives in `quantity` instead (see parseRewardBody's own handling of that case).
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

export function isValidRank(value) {
  return ENEMY_RANKS.includes(value)
}

export function isValidMinPriorDefeats(value) {
  return Number.isInteger(value) && value >= MIN_PRIOR_DEFEATS_MIN && value <= MIN_PRIOR_DEFEATS_MAX
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

export function isValidCritChance(value) {
  return Number.isInteger(value) && value >= CRIT_CHANCE_MIN && value <= CRIT_CHANCE_MAX
}

export function isValidPointsAmount(value) {
  return Number.isInteger(value) && value >= POINTS_REWARD_MIN && value <= POINTS_REWARD_MAX
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
  // Whether the referenced CMoonJoinEffect actually exists is the caller's DB check (this module
  // deliberately has no Prisma access — see the file header) — this only validates shape.
  const appearEffectId = body?.appearEffectId === undefined
    ? (existing ? existing.appearEffectId : null)
    : toOptionalId(body.appearEffectId)

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
  if (appearEffectId === undefined) {
    return { ok: false, message: 'appearEffectId must be a string id' }
  }

  return { ok: true, data: { name, description, active, sortOrder, appearEffectId } }
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
  const rank = body?.rank === undefined
    ? (existing ? existing.rank : RANK_DEFAULT)
    : (typeof body.rank === 'string' ? body.rank.trim() : '')
  const minPriorDefeats = body?.minPriorDefeats === undefined
    ? (existing ? existing.minPriorDefeats : MIN_PRIOR_DEFEATS_DEFAULT)
    : toNumber(body.minPriorDefeats)
  const cMoonPointsReward = body?.cMoonPointsReward === undefined
    ? (existing ? existing.cMoonPointsReward : CMOON_POINTS_REWARD_DEFAULT)
    : toNumber(body.cMoonPointsReward)
  const critChanceAgainstPercent = body?.critChanceAgainstPercent === undefined
    ? (existing ? existing.critChanceAgainstPercent : CRIT_CHANCE_DEFAULT)
    : toNumber(body.critChanceAgainstPercent)
  const critChanceFromPercent = body?.critChanceFromPercent === undefined
    ? (existing ? existing.critChanceFromPercent : CRIT_CHANCE_DEFAULT)
    : toNumber(body.critChanceFromPercent)
  const active = toBoolean(body?.active, existing ? existing.active : true)
  const sortOrder = body?.sortOrder === undefined
    ? (existing ? existing.sortOrder : 0)
    : toNumber(body.sortOrder)
  const isRaidBoss = toBoolean(body?.isRaidBoss, existing ? existing.isRaidBoss : false)
  const raidAnnouncementTextRaw = body?.raidAnnouncementText === undefined
    ? (existing ? existing.raidAnnouncementText : null)
    : (typeof body.raidAnnouncementText === 'string' ? body.raidAnnouncementText.trim() : '')
  const raidAnnouncementText = raidAnnouncementTextRaw ? raidAnnouncementTextRaw : null

  if (!factionId) {
    return { ok: false, message: 'Faction is required' }
  }
  if (!isValidMemberName(name)) {
    return { ok: false, message: `Name is required (max ${MEMBER_NAME_MAX_LENGTH} characters)` }
  }
  if (!isValidBattleMode(battleMode)) {
    return { ok: false, message: 'Battle mode must be PER_PLAYER or SHARED_POOL' }
  }
  if (!isValidRank(rank)) {
    return { ok: false, message: `Rank must be one of ${ENEMY_RANKS.join(', ')}` }
  }
  if (existing && existing.hasBattles && battleMode !== existing.battleMode) {
    // Same idea as czoneEffect.js's "kind cannot change after creation": flipping PER_PLAYER <->
    // SHARED_POOL under an enemy that already has battle history would make its logged fights
    // mean something different after the fact (per-battle HP vs. one shared pool) and could strand
    // an in-progress battle mid-fight under the other mode's rules. Compared against the RESOLVED
    // mode (not raw body.battleMode) so an omitted field is never mistaken for a change.
    return { ok: false, message: 'Battle mode cannot change once this enemy has been fought' }
  }
  if (existing && existing.hasBattles && rank !== existing.rank) {
    // Same reasoning as the battleMode lock just above: the rank-scoped achievement criteria
    // (cmoonGoonsDefeatedGte etc., see evaluateUserAgainstAchievement) count wins by joining
    // live against this member's CURRENT rank, not a per-battle snapshot — re-ranking a member
    // after it's been fought would silently reclassify every past win under the new rank.
    return { ok: false, message: 'Rank cannot change once this enemy has been fought' }
  }
  if (!isValidMinPriorDefeats(minPriorDefeats)) {
    return { ok: false, message: `Minimum prior defeats must be a whole number between ${MIN_PRIOR_DEFEATS_MIN} and ${MIN_PRIOR_DEFEATS_MAX}` }
  }
  if (!isValidMaxHp(maxHp)) {
    return { ok: false, message: `Max HP must be a whole number between ${MAX_HP_MIN} and ${MAX_HP_MAX}` }
  }
  if (!isValidCMoonPointsReward(cMoonPointsReward)) {
    return { ok: false, message: `cMoon points reward must be a whole number between ${CMOON_POINTS_REWARD_MIN} and ${CMOON_POINTS_REWARD_MAX}` }
  }
  if (!isValidCritChance(critChanceAgainstPercent)) {
    return { ok: false, message: `Critical hit chance against this enemy must be a whole number between ${CRIT_CHANCE_MIN} and ${CRIT_CHANCE_MAX}` }
  }
  if (!isValidCritChance(critChanceFromPercent)) {
    return { ok: false, message: `Critical hit chance from this enemy must be a whole number between ${CRIT_CHANCE_MIN} and ${CRIT_CHANCE_MAX}` }
  }
  if (active === null) {
    return { ok: false, message: 'Active must be true or false' }
  }
  if (!isValidSortOrder(sortOrder)) {
    return { ok: false, message: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}` }
  }
  if (isRaidBoss === null) {
    return { ok: false, message: 'Raid boss must be true or false' }
  }
  // A raid boss is meant to be a headline fight — see isRaidBoss's own schema comment. Enforced
  // here rather than the database so an admin gets an immediate, specific message.
  if (isRaidBoss && rank !== 'FINAL_BOSS') {
    return { ok: false, message: 'Only a Final Boss can be made a raid boss' }
  }
  if (raidAnnouncementText && raidAnnouncementText.length > RAID_ANNOUNCEMENT_MAX_LENGTH) {
    return { ok: false, message: `Raid announcement must be ${RAID_ANNOUNCEMENT_MAX_LENGTH} characters or fewer` }
  }

  return {
    ok: true,
    data: {
      factionId, name, maxHp, battleMode, rank, minPriorDefeats, cMoonPointsReward,
      critChanceAgainstPercent, critChanceFromPercent, active, sortOrder,
      isRaidBoss, raidAnnouncementText,
    },
  }
}

// Create-only (reward rows are added/removed whole, never partially patched — see
// cmoon-enemy-members/[id]/rewards.post.js), so there's no `existing` parameter. Enforces the
// exactly-one-id-matching-rewardType rule here, since Prisma can't: the id field for the chosen
// type must be set, and the other two must be absent/null/''. Existence of the referenced
// cToon/avatar/background is the caller's DB check.
export function parseRewardBody(body) {
  const rewardType = typeof body?.rewardType === 'string' ? body.rewardType.trim() : ''
  if (!isValidRewardType(rewardType)) {
    return { ok: false, message: 'Reward type must be CTOON, AVATAR, BACKGROUND, or POINTS' }
  }

  const ids = {}
  for (const field of REWARD_ID_FIELDS) {
    const parsed = toOptionalId(body?.[field])
    if (parsed === undefined) return { ok: false, message: `${field} must be a string id` }
    ids[field] = parsed
  }
  // POINTS has no id column at all (see REWARD_ID_FIELD's own comment) — wantField is undefined
  // for it, so it's required to carry NONE of the three id fields rather than exactly one.
  const wantField = REWARD_ID_FIELD[rewardType]
  if (wantField) {
    if (!ids[wantField]) {
      return { ok: false, message: `${wantField} is required when the reward type is ${rewardType}` }
    }
    const extra = REWARD_ID_FIELDS.filter(f => f !== wantField && ids[f])
    if (extra.length) {
      return { ok: false, message: `Reward type ${rewardType} must set only ${wantField} (got ${extra.join(', ')} too)` }
    }
  } else {
    const extra = REWARD_ID_FIELDS.filter(f => ids[f])
    if (extra.length) {
      return { ok: false, message: `Reward type ${rewardType} must not set ${extra.join(', ')}` }
    }
  }

  // Required, no silent default: this is the one number that decides how often a prize drops,
  // so an omitted value is far more likely a client bug than a deliberate "use 10%".
  const dropChancePercent = toNumber(body?.dropChancePercent)
  if (!isValidDropChance(dropChancePercent)) {
    return { ok: false, message: `Drop chance must be a number between ${DROP_CHANCE_MIN} and ${DROP_CHANCE_MAX}` }
  }

  // quantity means a copy count for cToons, a points amount for POINTS (see the schema comment +
  // buildGrantableReward), and is otherwise stored as 1 regardless of the body (avatars/
  // backgrounds), so a stray value from the client can't leave a misleading number in the admin
  // list.
  let quantity = REWARD_QUANTITY_DEFAULT
  if (rewardType === 'CTOON' && body?.quantity !== undefined) {
    quantity = toNumber(body.quantity)
    if (!isValidRewardQuantity(quantity)) {
      return { ok: false, message: `Quantity must be a whole number between ${REWARD_QUANTITY_MIN} and ${REWARD_QUANTITY_MAX}` }
    }
  } else if (rewardType === 'POINTS') {
    // Required, no silent default — same reasoning as dropChancePercent above: an admin adding a
    // points prize with no amount is far more likely a mistake than a deliberate "0 points".
    quantity = toNumber(body?.quantity)
    if (!isValidPointsAmount(quantity)) {
      return { ok: false, message: `Points amount must be a whole number between ${POINTS_REWARD_MIN} and ${POINTS_REWARD_MAX}` }
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
