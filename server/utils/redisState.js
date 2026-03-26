/**
 * Redis-backed state persistence for real-time game sessions.
 *
 * Serializable data (game state, deadlines, metadata) is stored in Redis with
 * a TTL so active sessions survive a socket-server restart.  Timer handles
 * (setTimeout refs) cannot be serialised, so they are always kept in-memory
 * and reconstructed on boot from the stored deadline timestamps.
 *
 * Key prefixes:
 *   battle:{id}        – monster 1v1 battle state
 *   battle:user:{uid}  – userId → battleId lookup
 *   pvproom:{id}       – PvP lobby room
 *   traderoom:{name}   – live trade room
 *   pvematch:{id}      – active clash PvE game
 *   pvpmatch:{id}      – active clash PvP game
 */

import { getRedis } from './redis.js'

const BATTLE_TTL     = 3600  // 1 hour  (seconds)
const PVP_ROOM_TTL   = 1800  // 30 min
const TRADE_TTL      = 1800  // 30 min
const PVE_MATCH_TTL  = 7200  // 2 hours (active clash PvE game)
const PVP_MATCH_TTL  = 7200  // 2 hours (active clash PvP game)

// ── Serialisation helpers ────────────────────────────────────────────────────

function serializeBattle(battle) {
  return {
    state:        battle.state,
    recordId:     battle.recordId,
    actions:      battle.actions,
    deadlines:    battle.deadlines,
    lastActivity: battle.lastActivity,
  }
}

function deserializeBattle(data) {
  return {
    ...data,
    // Timer handles are always reconstructed in memory; never stored
    timers:           { player1: null, player2: null },
    disconnectTimers: { player1: null, player2: null },
  }
}

function serializePvpRoom(room) {
  return {
    players:       room.players,
    decks:         room.decks,
    deckSnapshots: room.deckSnapshots,
    ready:         room.ready,
    usernames:     room.usernames,
    stakePoints:   room.stakePoints,
    lastActivity:  room.lastActivity,
  }
}

function serializeTradeRoom(room) {
  return {
    traderA:      room.traderA,
    traderB:      room.traderB,
    spectators:   Array.from(room.spectators || []),  // Set → Array
    offers:       room.offers,
    confirmed:    room.confirmed,
    finalized:    room.finalized,
    lastActivity: room.lastActivity,
  }
}

function deserializeTradeRoom(data) {
  return {
    ...data,
    spectators: new Set(data.spectators || []),  // Array → Set
  }
}

// ── Generic SCAN helper ──────────────────────────────────────────────────────

async function scanKeys(pattern) {
  const redis = getRedis()
  const keys = []
  let cursor = '0'
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')
  return keys
}

// ── Monster Battles ──────────────────────────────────────────────────────────

export async function setBattle(battleId, battle) {
  const redis = getRedis()
  await redis.setex(`battle:${battleId}`, BATTLE_TTL, JSON.stringify(serializeBattle(battle)))
}

export async function delBattle(battleId, userIds = []) {
  const redis = getRedis()
  const keys = [
    `battle:${battleId}`,
    ...userIds.map(uid => `battle:user:${uid}`)
  ]
  await redis.del(...keys)
}

export async function setBattleByUser(userId, battleId) {
  const redis = getRedis()
  await redis.setex(`battle:user:${userId}`, BATTLE_TTL, battleId)
}

export async function scanBattles() {
  const redis = getRedis()
  const allKeys  = await scanKeys('battle:*')
  const stateKeys = allKeys.filter(k => !k.startsWith('battle:user:'))
  const results  = new Map()
  if (!stateKeys.length) return results

  const values = await redis.mget(...stateKeys)
  for (let i = 0; i < stateKeys.length; i++) {
    if (!values[i]) continue
    try {
      const battleId = stateKeys[i].slice('battle:'.length)
      results.set(battleId, deserializeBattle(JSON.parse(values[i])))
    } catch { /* skip corrupt entries */ }
  }
  return results
}

export async function scanBattleByUser() {
  const redis = getRedis()
  const keys  = await scanKeys('battle:user:*')
  const results = new Map()
  if (!keys.length) return results

  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    const userId = keys[i].slice('battle:user:'.length)
    results.set(userId, values[i])
  }
  return results
}

// ── PvP Lobby Rooms ──────────────────────────────────────────────────────────

export async function setPvpRoom(roomId, room) {
  const redis = getRedis()
  await redis.setex(`pvproom:${roomId}`, PVP_ROOM_TTL, JSON.stringify(serializePvpRoom(room)))
}

export async function delPvpRoom(roomId) {
  const redis = getRedis()
  await redis.del(`pvproom:${roomId}`)
}

export async function scanPvpRooms() {
  const redis = getRedis()
  const keys  = await scanKeys('pvproom:*')
  const results = new Map()
  if (!keys.length) return results

  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const roomId = keys[i].slice('pvproom:'.length)
      results.set(roomId, JSON.parse(values[i]))
    } catch { /* skip corrupt entries */ }
  }
  return results
}

// ── Trade Rooms ──────────────────────────────────────────────────────────────

export async function setTradeRoom(roomName, room) {
  const redis = getRedis()
  await redis.setex(`traderoom:${roomName}`, TRADE_TTL, JSON.stringify(serializeTradeRoom(room)))
}

export async function delTradeRoom(roomName) {
  const redis = getRedis()
  await redis.del(`traderoom:${roomName}`)
}

export async function scanTradeRooms() {
  const redis = getRedis()
  const keys  = await scanKeys('traderoom:*')
  const results = new Map()
  if (!keys.length) return results

  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const roomName = keys[i].slice('traderoom:'.length)
      results.set(roomName, deserializeTradeRoom(JSON.parse(values[i])))
    } catch { /* skip corrupt entries */ }
  }
  return results
}

// ── Clash PvE Matches ─────────────────────────────────────────────────────────
// Stores the serializable parts of an active PvE clash game so the new process
// can restore the match state after a graceful reload.

function serializePveMatch(match) {
  return {
    id:              match.id,
    recordId:        match.recordId,
    playerUserId:    match.playerUserId,
    selectDeadline:  match.selectDeadline,
    lastActivity:    match.lastActivity,
    battleState:     match.battle.state,
    // _pendingActions holds the current-turn selections inside the battle closure
    pendingActions:  match.battle._pendingActions
      ? { player: match.battle._pendingActions.player, ai: match.battle._pendingActions.ai }
      : { player: null, ai: null },
  }
}

export async function setPveMatch(gameId, match) {
  const redis = getRedis()
  await redis.setex(`pvematch:${gameId}`, PVE_MATCH_TTL, JSON.stringify(serializePveMatch(match)))
}

export async function delPveMatch(gameId) {
  const redis = getRedis()
  await redis.del(`pvematch:${gameId}`)
}

export async function scanPveMatches() {
  const redis   = getRedis()
  const keys    = await scanKeys('pvematch:*')
  const results = new Map()
  if (!keys.length) return results

  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const gameId = keys[i].slice('pvematch:'.length)
      results.set(gameId, JSON.parse(values[i]))
    } catch { /* skip corrupt entries */ }
  }
  return results
}

// ── Clash PvP Matches ─────────────────────────────────────────────────────────
// Stores the serializable parts of an active PvP clash game.

function serializePvpMatch(match) {
  return {
    recordId:       match.recordId,
    userSide:       match.userSide,
    pending:        match.pending,
    confirmed:      match.confirmed,
    selectDeadline: match.selectDeadline,
    lastActivity:   match.lastActivity,
    battleState:    match.battle.state,
    pendingActions: match.battle._pendingActions
      ? { player: match.battle._pendingActions.player, ai: match.battle._pendingActions.ai }
      : { player: null, ai: null },
  }
}

export async function setPvpMatch(roomId, match) {
  const redis = getRedis()
  await redis.setex(`pvpmatch:${roomId}`, PVP_MATCH_TTL, JSON.stringify(serializePvpMatch(match)))
}

export async function delPvpMatch(roomId) {
  const redis = getRedis()
  await redis.del(`pvpmatch:${roomId}`)
}

export async function scanPvpMatches() {
  const redis   = getRedis()
  const keys    = await scanKeys('pvpmatch:*')
  const results = new Map()
  if (!keys.length) return results

  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const roomId = keys[i].slice('pvpmatch:'.length)
      results.set(roomId, JSON.parse(values[i]))
    } catch { /* skip corrupt entries */ }
  }
  return results
}
