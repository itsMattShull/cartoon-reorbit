const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const MONSTER_BATTLE_CONSTANTS = {
  MAX_BLOCKS: 3,
  DODGE_BASE: 0.05,
  DODGE_K: 50,
  DODGE_MIN: 0.05,
  DODGE_MAX: 0.25,
  RETREAT_CHANCE: 0.35,
  AI_LOW_HP_THRESHOLD: 0.35,
  AI_DEFAULT_ATTACK_WEIGHT: 0.8,
  AI_LOW_HP_ATTACK_WEIGHT: 0.6
}

export const ACTIONS = {
  ATTACK: 'ATTACK',
  BLOCK: 'BLOCK',
  RETREAT: 'RETREAT'
}

const cloneState = (state) => JSON.parse(JSON.stringify(state))

export function computeDamage(attacker, defender) {
  const raw = attacker.attack * (100 / (100 + defender.defense))
  return Math.round(raw)
}

export function computeDodgeChance(defense, constants = MONSTER_BATTLE_CONSTANTS) {
  const base = constants.DODGE_BASE
  const k = constants.DODGE_K
  const min = constants.DODGE_MIN
  const max = constants.DODGE_MAX
  const chance = base + (defense / (defense + k))
  return clamp(chance, min, max)
}

export function rollDodge(chance, rng = Math.random) {
  return rng() < chance
}

export function rollRetreat(chance, rng = Math.random) {
  return rng() < chance
}

export function createInitialState({
  battleId,
  player1,
  player2,
  player2IsAi = false,
  now = Date.now(),
  constants = MONSTER_BATTLE_CONSTANTS
}) {
  const p1Stats = player1.stats
  const p2Stats = player2.stats

  return {
    id: battleId,
    status: 'active',
    turnNumber: 1,
    startedAt: now,
    endedAt: null,
    participants: {
      player1: {
        key: 'player1',
        userId: player1.userId,
        monsterId: player1.monsterId,
        maxHealth: p1Stats.maxHealth,
        attack: p1Stats.atk,
        defense: p1Stats.def,
        currentHp: p1Stats.hp ?? p1Stats.maxHealth,
        blocksRemaining: constants.MAX_BLOCKS,
        isAi: false
      },
      player2: {
        key: 'player2',
        userId: player2.userId ?? null,
        monsterId: player2.monsterId ?? null,
        maxHealth: p2Stats.maxHealth,
        attack: p2Stats.atk,
        defense: p2Stats.def,
        currentHp: p2Stats.hp ?? p2Stats.maxHealth,
        blocksRemaining: constants.MAX_BLOCKS,
        isAi: Boolean(player2IsAi)
      }
    },
    lastTurnResult: null,
    winnerKey: null,
    endReason: null,
    turnLog: []
  }
}

export function validateAction(state, playerKey, action) {
  const player = state?.participants?.[playerKey]
  if (!player) return { ok: false, code: 'UnknownPlayer' }
  if (state.status !== 'active') return { ok: false, code: 'BattleEnded' }
  if (!Object.values(ACTIONS).includes(action)) return { ok: false, code: 'InvalidAction' }
  if (action === ACTIONS.RETREAT && player.isAi) return { ok: false, code: 'AiCannotRetreat' }
  if (action === ACTIONS.BLOCK && player.blocksRemaining <= 0) {
    return { ok: false, code: 'NoBlocksRemaining' }
  }
  return { ok: true }
}

const initiativeScore = (participant) =>
  participant.maxHealth + participant.attack + participant.defense

const resolveAttack = ({ attacker, defender, defenderBlocks, rng, constants }) => {
  if (defenderBlocks) {
    return { damage: 0, dodged: false }
  }
  const dodgeChance = computeDodgeChance(defender.defense, constants)
  const dodged = rollDodge(dodgeChance, rng)
  if (dodged) return { damage: 0, dodged: true }
  return { damage: computeDamage(attacker, defender), dodged: false }
}

export function resolveTurn(state, actions, options = {}) {
  const rng = options.rng || Math.random
  const constants = options.constants || MONSTER_BATTLE_CONSTANTS
  const next = cloneState(state)

  const result = {
    turnNumber: next.turnNumber,
    actions: { ...actions },
    firstActor: null,
    dodge: {},
    damage: {},
    hpAfter: {},
    blocksRemaining: {},
    retreat: {}
  }

  if (next.status !== 'active') {
    return { state: next, turnResult: result }
  }

  const p1 = next.participants.player1
  const p2 = next.participants.player2

  const attemptedRetreat = []
  for (const key of ['player1', 'player2']) {
    const action = actions[key]
    if (action === ACTIONS.RETREAT) {
      const success = rollRetreat(constants.RETREAT_CHANCE, rng)
      result.retreat[key] = { attempted: true, success }
      attemptedRetreat.push({ key, success })
    } else {
      result.retreat[key] = { attempted: false, success: false }
    }
  }

  const successfulRetreats = attemptedRetreat.filter(r => r.success)
  if (successfulRetreats.length > 0) {
    next.status = 'finished'
    next.endedAt = Date.now()
    next.endReason = 'RETREAT'
    if (successfulRetreats.length === 1) {
      const loserKey = successfulRetreats[0].key
      next.winnerKey = loserKey === 'player1' ? 'player2' : 'player1'
    } else {
      next.winnerKey = null
    }
    result.endReason = next.endReason
    result.winnerKey = next.winnerKey
    result.hpAfter = { player1: p1.currentHp, player2: p2.currentHp }
    result.blocksRemaining = {
      player1: p1.blocksRemaining,
      player2: p2.blocksRemaining
    }
    return { state: next, turnResult: result }
  }

  const normalizedActions = {
    player1: actions.player1 === ACTIONS.RETREAT ? null : actions.player1,
    player2: actions.player2 === ACTIONS.RETREAT ? null : actions.player2
  }

  if (normalizedActions.player1 === ACTIONS.BLOCK) p1.blocksRemaining -= 1
  if (normalizedActions.player2 === ACTIONS.BLOCK) p2.blocksRemaining -= 1

  const p1Blocks = normalizedActions.player1 === ACTIONS.BLOCK
  const p2Blocks = normalizedActions.player2 === ACTIONS.BLOCK

  const p1Attacks = normalizedActions.player1 === ACTIONS.ATTACK
  const p2Attacks = normalizedActions.player2 === ACTIONS.ATTACK

  if (p1Attacks || p2Attacks) {
    if (p1Attacks && p2Attacks) {
      const p1Score = initiativeScore(p1)
      const p2Score = initiativeScore(p2)
      if (p1Score === p2Score) {
        result.firstActor = rng() < 0.5 ? 'player1' : 'player2'
      } else {
        result.firstActor = p1Score < p2Score ? 'player1' : 'player2'
      }
    } else if (p1Attacks) {
      result.firstActor = 'player1'
    } else {
      result.firstActor = 'player2'
    }

    const attackOrder = result.firstActor === 'player2'
      ? ['player2', 'player1']
      : ['player1', 'player2']

    for (const attackerKey of attackOrder) {
      const defenderKey = attackerKey === 'player1' ? 'player2' : 'player1'
      const attacker = attackerKey === 'player1' ? p1 : p2
      const defender = defenderKey === 'player1' ? p1 : p2
      const attackerAction = normalizedActions[attackerKey]
      const defenderBlocks = normalizedActions[defenderKey] === ACTIONS.BLOCK

      if (attackerAction !== ACTIONS.ATTACK) continue
      if (defender.currentHp <= 0) break

      const { damage, dodged } = resolveAttack({
        attacker,
        defender,
        defenderBlocks,
        rng,
        constants
      })
      if (!result.damage[attackerKey]) result.damage[attackerKey] = 0
      result.damage[attackerKey] += damage
      result.dodge[defenderKey] = dodged
      defender.currentHp = Math.max(0, defender.currentHp - damage)

      if (defender.currentHp <= 0) break
    }
  }

  result.hpAfter = { player1: p1.currentHp, player2: p2.currentHp }
  result.blocksRemaining = {
    player1: p1.blocksRemaining,
    player2: p2.blocksRemaining
  }

  if (p1.currentHp <= 0 || p2.currentHp <= 0) {
    next.status = 'finished'
    next.endedAt = Date.now()
    next.endReason = 'KO'
    if (p1.currentHp <= 0 && p2.currentHp <= 0) {
      next.winnerKey = null
    } else {
      next.winnerKey = p1.currentHp <= 0 ? 'player2' : 'player1'
    }
    result.endReason = next.endReason
    result.winnerKey = next.winnerKey
  }

  next.lastTurnResult = result
  return { state: next, turnResult: result }
}

export function applyForfeit(state, loserKey, reason) {
  const next = cloneState(state)
  const result = {
    turnNumber: next.turnNumber,
    actions: {},
    firstActor: null,
    dodge: {},
    damage: {},
    hpAfter: {
      player1: next.participants.player1.currentHp,
      player2: next.participants.player2.currentHp
    },
    blocksRemaining: {
      player1: next.participants.player1.blocksRemaining,
      player2: next.participants.player2.blocksRemaining
    }
  }

  if (next.status !== 'active') return { state: next, turnResult: result }

  next.status = 'finished'
  next.endedAt = Date.now()
  next.endReason = reason
  next.winnerKey = loserKey === 'player1' ? 'player2' : 'player1'
  result.endReason = reason
  result.winnerKey = next.winnerKey

  next.lastTurnResult = result
  return { state: next, turnResult: result }
}

export function chooseAiAction(state, rng = Math.random, constants = MONSTER_BATTLE_CONSTANTS) {
  const aiKey = state.participants.player1.isAi ? 'player1' : 'player2'
  const ai = state.participants[aiKey]
  const hpRatio = ai.currentHp / ai.maxHealth
  const canBlock = ai.blocksRemaining > 0

  let attackWeight = constants.AI_DEFAULT_ATTACK_WEIGHT
  if (hpRatio < constants.AI_LOW_HP_THRESHOLD && canBlock) {
    attackWeight = constants.AI_LOW_HP_ATTACK_WEIGHT
  }
  if (!canBlock) return ACTIONS.ATTACK

  return rng() < attackWeight ? ACTIONS.ATTACK : ACTIONS.BLOCK
}
