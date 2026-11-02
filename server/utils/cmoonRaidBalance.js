// server/utils/cmoonRaidBalance.js
//
// Monte Carlo balance solver behind the admin "Automate stats for 7hp players" button (see
// server/api/admin/cmoon-enemy-members/auto-balance-7hp.post.js). Given an admin-chosen Max HP,
// finds attack chance / crit-from / crit-against values such that a 4-player party, all at
// exactly 7 HP, has roughly a 25% chance of beating the boss — both numbers are the literal
// target the feature was asked for, not admin-adjustable.
//
// This is the same simulation technique used to investigate Chief Justice/Big Wig's real win
// rates earlier in this project's history, now turned into a reusable solver. Pure, DB-free
// (same discipline as cmoonEnemyBattle.js/cmoonEnemyRaid.js) — no Prisma import, so it's cheap to
// unit-test directly (see tests/cmoonRaidBalance.test.js).
//
// ── What's simulated vs. assumed ──────────────────────────────────────────────────────────────
// The party comp is a fixed stand-in ("a decent comp"), not read from this boss's actual
// CMoonSpecialAttack catalog — that catalog is open-ended admin content (any effect type, any
// numbers) and modeling it generically here would be both huge in scope and still only a guess at
// what a real party would actually bring. Instead: 1 player runs a paralyze-type special (60%
// accuracy, 2-round lockout, 4-hit-streak charge — the real shape of this game's "Pausing Punch"),
// 3 players run a flat-damage special (+7 unblockable, 3-hit-streak charge — "Hearty Pie"'s
// shape). The boss's own kit is likewise a generic stand-in: a 3-flat-damage unblockable AoE that
// auto-fires once the boss's shared hit-streak reaches 3 (the "Cog Anvil Drop" shape), not
// whatever faction special this specific boss actually has assigned.
//
// Wind-up/telegraph moves ARE simulated for real, from whatever the admin has entered in the form
// for THIS boss — they're genuine per-boss config already known at solve time, not a guess.
// Rational play is assumed: the whole party holds any charged special and blocks the telegraphed
// lane instead, exactly as recommended against a real telegraph (see closeRound's own comment on
// the mechanic in cmoonRaidSocket.js).
//
// accuracy is held at 100% (the convention every current boss uses) and baseDamage at 1 (already
// the field's floor) — only attackChancePercent / critChanceFromPercent / critChanceAgainstPercent
// are solved for.

function rand() { return Math.random() }
function randomLane() { return rand() < 0.5 ? 'HIGH' : 'LOW' }

const PARALYZE_ACCURACY = 0.6
const PARALYZE_ROUNDS = 2
const PARALYZE_STREAK_THRESHOLD = 4
const FLAT_DAMAGE_AMOUNT = 7
const FLAT_DAMAGE_STREAK_THRESHOLD = 3
const BOSS_AOE_DAMAGE = 3
const BOSS_AOE_STREAK_THRESHOLD = 3
const ROUND_LIMIT = 300
const ROLES = ['paralyze', 'flat_damage', 'flat_damage', 'flat_damage']

/**
 * One simulated raid. `windUpMoves`: [{ occurrencePercent, bonusType: 'HEAL_PARTY'|'DAMAGE_ENEMY',
 * bonusAmount }] — each checked independently per round (first match wins), same semantics as the
 * real engine. Returns 'WIN' | 'WIPE' | 'TIMEOUT'.
 */
export function simulateRaidTrial({ bossHp, attackChancePercent, critChanceFromPercent, critChanceAgainstPercent, playerHp, windUpMoves = [] }) {
  const attackChance = attackChancePercent / 100
  const critFrom = critChanceFromPercent / 100
  const critAgainst = critChanceAgainstPercent / 100

  const players = ROLES.map(role => ({ hp: playerHp, maxHp: playerHp, streak: 0, charged: false, alive: true, role }))
  let boss = bossHp, bossStreak = 0, paralyzedRoundsLeft = 0, rounds = 0

  while (boss > 0 && players.some(p => p.alive) && rounds < ROUND_LIMIT) {
    rounds++

    let telegraph = null
    if (paralyzedRoundsLeft === 0 && windUpMoves.length) {
      let roll = rand() * 100
      for (const move of windUpMoves) {
        const chance = Number(move.occurrencePercent) || 0
        if (roll < chance) { telegraph = move; break }
        roll -= chance
      }
    }
    const isTelegraph = !!telegraph

    let bossAction
    if (paralyzedRoundsLeft > 0) { bossAction = { type: 'PARALYZED' }; paralyzedRoundsLeft-- }
    else if (isTelegraph) bossAction = { type: 'ATTACK', lane: randomLane() }
    else if (rand() < attackChance) bossAction = { type: 'ATTACK', lane: randomLane() }
    else bossAction = { type: 'BLOCK', lane: randomLane() }

    let bossHitSomeone = false
    let paralyzeLandedThisRound = false

    for (const p of players) {
      if (!p.alive) continue
      const hpPct = p.hp / p.maxHp
      let action
      if (isTelegraph) {
        // Rational play: hold any charged special and block the revealed lane instead.
        action = { type: 'BLOCK', lane: bossAction.lane }
      } else if (p.charged) action = { type: 'SPECIAL' }
      else if (hpPct < 0.4) action = { type: 'BLOCK', lane: randomLane() }
      else action = { type: 'ATTACK', lane: randomLane() }

      if (action.type === 'SPECIAL') {
        p.charged = false
        if (p.role === 'paralyze') {
          if (rand() < PARALYZE_ACCURACY) paralyzeLandedThisRound = true
        } else {
          boss -= FLAT_DAMAGE_AMOUNT
        }
        if (bossAction.type === 'ATTACK') {
          const isCrit = rand() < critFrom
          p.hp -= isCrit ? 2 : 1
          bossHitSomeone = true
        }
      } else {
        const pIsAttack = action.type === 'ATTACK'
        if (pIsAttack) {
          const blockedByBoss = bossAction.type === 'BLOCK' && bossAction.lane === action.lane
          if (!blockedByBoss) {
            const isCrit = rand() < critAgainst
            boss -= isCrit ? 2 : 1
            p.streak++
            const threshold = p.role === 'paralyze' ? PARALYZE_STREAK_THRESHOLD : FLAT_DAMAGE_STREAK_THRESHOLD
            if (p.streak >= threshold) { p.charged = true; p.streak = threshold }
          }
        }
        if (bossAction.type === 'ATTACK') {
          const blockedByPlayer = action.type === 'BLOCK' && action.lane === bossAction.lane
          if (!blockedByPlayer) {
            const isCrit = rand() < critFrom
            p.hp -= isCrit ? 2 : 1
            bossHitSomeone = true
          }
        }
      }
      if (p.hp <= 0) { p.hp = 0; p.alive = false }
    }

    if (paralyzeLandedThisRound) paralyzedRoundsLeft = PARALYZE_ROUNDS

    if (isTelegraph) {
      // Every alive participant blocked the revealed lane above -> the party always "passes" a
      // telegraph round under this rational-play assumption, same as the real engine's own
      // all-alive-participants-blocked-correctly condition.
      if (telegraph.bonusType === 'HEAL_PARTY') {
        const amount = Number(telegraph.bonusAmount) || 0
        for (const p of players) if (p.alive) p.hp = Math.min(p.maxHp, p.hp + amount)
      } else {
        boss -= Number(telegraph.bonusAmount) || 0
      }
      bossStreak = 0
    } else {
      if (bossHitSomeone) bossStreak++ ; else bossStreak = 0
    }
    if (bossStreak >= BOSS_AOE_STREAK_THRESHOLD) {
      for (const p of players) { if (p.alive) { p.hp -= BOSS_AOE_DAMAGE; if (p.hp <= 0) { p.hp = 0; p.alive = false } } }
      bossStreak = 0
    }

    if (boss <= 0) return 'WIN'
    if (!players.some(p => p.alive)) return 'WIPE'
  }
  return 'TIMEOUT'
}

export function estimateWinRate(params, trials = 8000) {
  let wins = 0
  for (let i = 0; i < trials; i++) if (simulateRaidTrial(params) === 'WIN') wins++
  return (100 * wins) / trials
}

// Generic single-parameter bisection toward a target win rate. `higherIsHarder`: true when
// raising the lever's value lowers the win rate (attackChance, critFrom); false when raising it
// raises the win rate (critAgainst). Self-corrects toward whichever bound is closer even when the
// target isn't actually reachable within [lo, hi] — the caller checks `converged` to know whether
// to escalate to the next lever.
function searchLever(evalWinRate, lo, hi, target, { tolerance = 1, maxIter = 10, higherIsHarder = true } = {}) {
  let a = lo, b = hi
  let mid = (a + b) / 2
  let wr = evalWinRate(mid)
  for (let i = 0; i < maxIter; i++) {
    if (Math.abs(wr - target) <= tolerance) return { value: mid, winRate: wr, converged: true }
    const tooHard = wr < target // win rate below target -> current value is too punishing
    if (higherIsHarder) {
      if (tooHard) b = mid; else a = mid
    } else {
      if (tooHard) a = mid; else b = mid
    }
    mid = (a + b) / 2
    wr = evalWinRate(mid)
  }
  return { value: mid, winRate: wr, converged: Math.abs(wr - target) <= tolerance }
}

const DEFAULT_CRIT_FROM = 90
const DEFAULT_CRIT_AGAINST = 10

/**
 * Solves for attackChancePercent / critChanceFromPercent / critChanceAgainstPercent such that a
 * 4-player, all-7hp party (the "decent comp" above) hits ~targetWinRatePercent against `bossHp`.
 * windUpMoves reflects whatever the admin has currently entered for this boss (may be empty).
 * Returns { attackChancePercent, critChanceFromPercent, critChanceAgainstPercent,
 * attackAccuracyPercent: 100, baseDamage: 1, achievedWinRatePercent, targetReached }.
 */
export function solveForTargetWinRate({
  bossHp, windUpMoves = [], targetWinRatePercent = 25, playerHp = 7,
  searchTrials = 6000, finalTrials = 30000, tolerancePercent = 1.5,
}) {
  const hp = Math.max(1, Number(bossHp) || 1)
  const moves = Array.isArray(windUpMoves) ? windUpMoves : []

  const evalFor = (attackChancePercent, critChanceFromPercent, critChanceAgainstPercent) => (value, trials = searchTrials) =>
    estimateWinRate({
      bossHp: hp, playerHp, windUpMoves: moves,
      attackChancePercent: attackChancePercent === null ? value : attackChancePercent,
      critChanceFromPercent: critChanceFromPercent === null ? value : critChanceFromPercent,
      critChanceAgainstPercent: critChanceAgainstPercent === null ? value : critChanceAgainstPercent,
    }, trials)

  // Step 1: attack chance, holding crit-from/crit-against at the roster's usual defaults.
  let attackChance = 50, critFrom = DEFAULT_CRIT_FROM, critAgainst = DEFAULT_CRIT_AGAINST
  let step1 = searchLever(evalFor(null, critFrom, critAgainst), 10, 95, targetWinRatePercent, { tolerance: tolerancePercent, higherIsHarder: true })
  attackChance = step1.value

  let converged = step1.converged
  if (!converged) {
    // Step 2: crit-from, holding attack chance at wherever step 1 saturated.
    const step2 = searchLever(evalFor(attackChance, null, critAgainst), 10, 95, targetWinRatePercent, { tolerance: tolerancePercent, higherIsHarder: true })
    critFrom = step2.value
    converged = step2.converged
    if (!converged) {
      // Step 3: crit-against (raising it makes the party kill faster -> shorter exposure -> HIGHER
      // win rate, so this lever runs the opposite direction from the first two).
      const step3 = searchLever(evalFor(attackChance, critFrom, null), 5, 90, targetWinRatePercent, { tolerance: tolerancePercent, higherIsHarder: false })
      critAgainst = step3.value
      converged = step3.converged
    }
  }

  const finalWinRate = estimateWinRate({
    bossHp: hp, playerHp, windUpMoves: moves,
    attackChancePercent: attackChance, critChanceFromPercent: critFrom, critChanceAgainstPercent: critAgainst,
  }, finalTrials)

  return {
    attackChancePercent: Math.round(attackChance * 10) / 10,
    critChanceFromPercent: Math.round(critFrom * 10) / 10,
    critChanceAgainstPercent: Math.round(critAgainst * 10) / 10,
    attackAccuracyPercent: 100,
    baseDamage: 1,
    achievedWinRatePercent: Math.round(finalWinRate * 10) / 10,
    // A little looser than the per-step tolerance: the final check re-samples at higher trial
    // count, so a config that converged during search can still land just outside the per-step
    // band by chance — this is "close enough to report as a real success," not a second search.
    targetReached: Math.abs(finalWinRate - targetWinRatePercent) <= tolerancePercent * 2,
  }
}
