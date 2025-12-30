import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIONS,
  MONSTER_BATTLE_CONSTANTS,
  applyForfeit,
  chooseAiAction,
  computeDamage,
  computeDodgeChance,
  createInitialState,
  resolveTurn,
  validateAction
} from '../server/utils/monsterBattleEngine.js'

const makeState = (overrides = {}) => {
  const base = createInitialState({
    battleId: 'battle-1',
    player1: {
      userId: 'user-1',
      monsterId: 'monster-1',
      stats: { hp: 50, maxHealth: 50, atk: 20, def: 10 }
    },
    player2: {
      userId: 'user-2',
      monsterId: 'monster-2',
      stats: { hp: 50, maxHealth: 50, atk: 18, def: 12 }
    }
  })
  return { ...base, ...overrides }
}

test('computeDamage uses the expected formula', () => {
  const attacker = { attack: 50 }
  const defender = { defense: 50 }
  assert.equal(computeDamage(attacker, defender), 33)
})

test('computeDodgeChance caps at 25%', () => {
  const chance = computeDodgeChance(10_000)
  assert.equal(chance, MONSTER_BATTLE_CONSTANTS.DODGE_MAX)
})

test('block negates damage and consumes blocks', () => {
  const state = makeState()
  const { state: next } = resolveTurn(state, {
    player1: ACTIONS.ATTACK,
    player2: ACTIONS.BLOCK
  }, { rng: () => 0.9 })
  assert.equal(next.participants.player2.currentHp, state.participants.player2.currentHp)
  assert.equal(next.participants.player2.blocksRemaining, MONSTER_BATTLE_CONSTANTS.MAX_BLOCKS - 1)
})

test('cannot block when no blocks remain', () => {
  const state = makeState()
  state.participants.player1.blocksRemaining = 0
  const result = validateAction(state, 'player1', ACTIONS.BLOCK)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'NoBlocksRemaining')
})

test('attack-vs-attack KO prevents counterattack', () => {
  const state = makeState()
  state.participants.player1.attack = 200
  state.participants.player1.maxHealth = 10
  state.participants.player1.currentHp = 10
  state.participants.player2.maxHealth = 10
  state.participants.player2.currentHp = 10
  const { state: next, turnResult } = resolveTurn(state, {
    player1: ACTIONS.ATTACK,
    player2: ACTIONS.ATTACK
  }, { rng: () => 0.9 })
  assert.equal(turnResult.winnerKey, 'player1')
  assert.equal(next.participants.player1.currentHp, 10)
  assert.equal(next.participants.player2.currentHp, 0)
})

test('retreat success ends battle and retreater loses', () => {
  const state = makeState()
  const { state: next, turnResult } = resolveTurn(state, {
    player1: ACTIONS.RETREAT,
    player2: ACTIONS.ATTACK
  }, { rng: () => 0 })
  assert.equal(next.status, 'finished')
  assert.equal(turnResult.endReason, 'RETREAT')
  assert.equal(turnResult.winnerKey, 'player2')
})

test('timeout/disconnect forfeits set winner and reason', () => {
  const state = makeState()
  const { state: next, turnResult } = applyForfeit(state, 'player2', 'TIMEOUT')
  assert.equal(next.status, 'finished')
  assert.equal(next.endReason, 'TIMEOUT')
  assert.equal(turnResult.winnerKey, 'player1')
})

test('disconnect forfeit sets winner and reason', () => {
  const state = makeState()
  const { state: next, turnResult } = applyForfeit(state, 'player1', 'DISCONNECT')
  assert.equal(next.status, 'finished')
  assert.equal(next.endReason, 'DISCONNECT')
  assert.equal(turnResult.winnerKey, 'player2')
})

test('AI weighting shifts under low HP', () => {
  const state = makeState()
  state.participants.player2.isAi = true
  state.participants.player2.currentHp = 10
  state.participants.player2.maxHealth = 50
  const lowHpAction = chooseAiAction(state, () => 0.7)
  assert.equal(lowHpAction, ACTIONS.BLOCK)

  state.participants.player2.currentHp = 50
  const normalAction = chooseAiAction(state, () => 0.7)
  assert.equal(normalAction, ACTIONS.ATTACK)
})
