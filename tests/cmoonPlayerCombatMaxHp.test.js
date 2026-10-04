import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// server/utils/cmoon.js eagerly constructs BullMQ Queue instances on import (see
// tests/cmoonEffectTypes.test.js's comment), so this reads it as text instead of importing it —
// same convention as tests/cmoonBalanceNoPrizeGrant.test.js. The actual default+bonus arithmetic
// getPlayerCombatMaxHp() delegates to (combinePlayerMaxHp, in the DB-free cmoonEnemyBattle.js) is
// unit-tested directly in tests/cmoonEnemyBattle.test.js instead — these checks only confirm the
// two files are still wired together the way this split assumes.
const __dirname = dirname(fileURLToPath(import.meta.url))
const cmoonSrc = readFileSync(join(__dirname, '../server/utils/cmoon.js'), 'utf8')

test('getPlayerCombatMaxHp exists and delegates its arithmetic to combinePlayerMaxHp', () => {
  assert.match(cmoonSrc, /export async function getPlayerCombatMaxHp\s*\(/, 'getPlayerCombatMaxHp not found — has it been renamed?')
  const start = cmoonSrc.indexOf('export async function getPlayerCombatMaxHp')
  const nextFn = cmoonSrc.indexOf('\nexport ', start + 1)
  const body = cmoonSrc.slice(start, nextFn === -1 ? undefined : nextFn)
  assert.match(body, /combinePlayerMaxHp\s*\(/, 'getPlayerCombatMaxHp must delegate its default+bonus math to combinePlayerMaxHp, not reimplement it inline')
  assert.match(body, /cMoonEnemyBattleDefaultHp/, 'getPlayerCombatMaxHp must read GlobalGameConfig.cMoonEnemyBattleDefaultHp')
  assert.match(body, /currentCMoonRank/, 'getPlayerCombatMaxHp must read the player\'s current cMoon rank for the bonus')
})

test('getPlayerCombatMaxHp only reads a bonus through a CMoonRankTier, never a bare CMoonRank', () => {
  const start = cmoonSrc.indexOf('export async function getPlayerCombatMaxHp')
  const nextFn = cmoonSrc.indexOf('\nexport ', start + 1)
  const body = cmoonSrc.slice(start, nextFn === -1 ? undefined : nextFn)
  // A hand-authored per-cMoon custom rank (CMoonRank.tierId null) must never grant a bonus — see
  // CMoonRankTier.cMoonEnemyBattleHpBonus's own "global ranks only" schema comment. This greps
  // for the select reaching through `.tier.` rather than reading cMoonEnemyBattleHpBonus straight
  // off currentCMoonRank, which would read it even when tierId is null.
  assert.match(body, /currentCMoonRank[\s\S]*?tier[\s\S]*?cMoonEnemyBattleHpBonus/, 'the bonus must be read through currentCMoonRank.tier, not off CMoonRank directly')
})

test('cmoonEnemyBattle.js exports combinePlayerMaxHp for cmoon.js to use', () => {
  const src = readFileSync(join(__dirname, '../server/utils/cmoonEnemyBattle.js'), 'utf8')
  assert.match(src, /export function combinePlayerMaxHp\s*\(/, 'combinePlayerMaxHp not exported from cmoonEnemyBattle.js — has it moved or been renamed?')
})
