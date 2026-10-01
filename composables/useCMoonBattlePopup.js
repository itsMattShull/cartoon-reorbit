// Singleton driver for the cMoon Enemy Battles popup — mirrors useFullscreenEffect.js's
// useState-backed singleton pattern. checkOnNavigate() is called from CMoonBattlePopupHost.vue on
// every route change (see that component's route watcher) and hits
// server/api/cmoon/battle/consider.post.js, which owns the actual chance-roll/cooldown — this
// composable just holds whatever that endpoint hands back and drives the fight once started.

// Best-effort SFX playback — a plain HTMLAudioElement per play rather than the AudioContext/
// decodeAudioData pool composables/useClickSoundEffects.js uses, since these clips play at most a
// few times per battle (not on every click site-wide), so pre-decoding/caching buys nothing here.
// Never awaited and never throws: a missing/blocked/still-loading sound must not hold up the
// battle flow it's just decorating.
function playSound(path) {
  if (!path || typeof window === 'undefined') return
  try {
    const el = new Audio(path)
    el.volume = 0.7
    el.play().catch(() => {})
  } catch {}
}

// One round can hit both sides at once (both attacked, neither blocked correctly) — both sounds
// then play together rather than one being chosen over the other, matching how the round summary
// text (CMoonBattlePopupHost.vue's lastRoundLabel) already reports "you both landed a hit!" as a
// real simultaneous outcome, not an either/or. enemyBlocked comes straight from
// resolveBattleRound server-side (a genuinely successful block, not just "wasn't hit because
// nobody attacked either way" — see that function's own comment).
function playRoundSounds(round, enemy) {
  if (!round || !enemy) return
  if (round.enemyHit) playSound(enemy.damageTakenSoundPath)
  else if (round.enemyBlocked) playSound(enemy.damageAvoidedSoundPath)
  if (round.playerHit) playSound(enemy.attackingSoundPath)
}

export function useCMoonBattlePopup() {
  const visible = useState('cmoon-battle-visible', () => false)
  // 'OFFER' (an enemy to size up, not yet fought) | 'FIGHT' (an in-progress battle) |
  // 'RESULT' (just resolved — shown until the player dismisses it).
  const phase = useState('cmoon-battle-phase', () => 'OFFER')
  const enemy = useState('cmoon-battle-enemy', () => null)
  const battle = useState('cmoon-battle-battle', () => null)
  // Whether the player has a cMoon right now, as of the /consider call that offered this
  // encounter — drives the OFFER copy in CMoonBattlePopupHost.vue (a non-member can still fight
  // and win everything except cMoon points; see that endpoint's own comment).
  const inCMoon = useState('cmoon-battle-in-cmoon', () => true)
  const busy = useState('cmoon-battle-busy', () => false)
  const error = useState('cmoon-battle-error', () => '')
  // The just-resolved round's { round, playerAction, enemyAction, playerHit, enemyHit,
  // playerBlocked, enemyBlocked, playerCrit, enemyCrit } — display detail only (never read back to
  // resolve anything), cleared whenever a fresh battle starts.
  const lastRound = useState('cmoon-battle-last-round', () => null)

  // Plain module-level flag, not useState: this only ever needs to prevent two concurrent
  // in-flight /consider calls from the same client tick, never anything serialized across SSR.
  // Held true across an optional full-screen appear effect too (see checkOnNavigate below), not
  // just the fetch itself — visible.value stays false for that whole window, so without this a
  // second route change mid-effect could roll and stack a second offer/effect on top of the first.
  let checking = false

  async function checkOnNavigate() {
    // Never interrupt an offer/fight/result already on screen with a fresh roll.
    if (visible.value || checking) return
    checking = true
    try {
      const res = await $fetch('/api/cmoon/battle/consider', { method: 'POST' })
      if (!res?.offered) { checking = false; return }
      inCMoon.value = !!res.inCMoon
      if (res.resumed) {
        battle.value = res.battle
        phase.value = battle.value?.status === 'RESOLVED' ? 'RESULT' : 'FIGHT'
        visible.value = true
        checking = false
        return
      }

      enemy.value = res.enemy
      battle.value = null
      phase.value = 'OFFER'

      const reveal = () => {
        visible.value = true
        playSound(res.enemy?.appearSoundPath)
        checking = false
      }

      // An admin-authored full-screen effect assigned to this enemy's faction (see
      // CMoonEnemyFaction.appearEffect in prisma/schema.prisma) — reuses the exact config shape a
      // cMoon's own join effect plays (utils/cmoonJoinEffectDescriptor.js), just built directly
      // here rather than through that helper since a faction never has a built-in effectType, only
      // ever this one CUSTOM shape.
      const fx = res.enemy?.faction?.appearEffect
      const { active: fxActive, play } = useFullscreenEffect()
      // useFullscreenEffect().play() is single-flight and silently no-ops (never calling
      // onComplete) if another effect is already playing — skip straight to reveal() rather than
      // risk `checking` getting stuck true for the rest of the session behind an onComplete that
      // will never fire.
      if (fx && !fxActive.value) {
        play({ type: 'CUSTOM', config: fx }, { onComplete: reveal })
      } else {
        reveal()
      }
    } catch {
      // Not logged in, no cMoon, feature off, or a transient error — silently skip, same
      // stance components/CMoonSelectModal.vue's own checkStatus() takes.
      checking = false
    }
  }

  async function startBattle() {
    if (!enemy.value || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const res = await $fetch('/api/cmoon/battle/start', { method: 'POST', body: { enemyMemberId: enemy.value.id } })
      battle.value = res.battle
      lastRound.value = null
      phase.value = 'FIGHT'
    } catch (e) {
      error.value = e?.data?.statusMessage || 'Could not start that battle.'
    } finally {
      busy.value = false
    }
  }

  async function submitAction(action) {
    if (!battle.value || busy.value || battle.value.status !== 'IN_PROGRESS') return
    busy.value = true
    error.value = ''
    try {
      const res = await $fetch(`/api/cmoon/battle/${battle.value.id}/action`, {
        method: 'POST',
        body: { action, roundNumber: battle.value.roundNumber },
      })
      battle.value = res.battle
      lastRound.value = res.round || null
      playRoundSounds(res.round, battle.value?.enemy)
      if (battle.value.status === 'RESOLVED') {
        phase.value = 'RESULT'
        if (battle.value.outcome === 'WIN') playSound(battle.value.enemy?.victorySoundPath)
        else if (battle.value.outcome === 'LOSS') playSound(battle.value.enemy?.defeatSoundPath)
        // A win awards cMoon points server-side — refresh auth so the nav's own point/rank
        // display doesn't sit stale until the next unrelated refetch.
        if (battle.value.outcome === 'WIN') {
          try {
            const { fetchSelf } = useAuth()
            await fetchSelf({ force: true })
          } catch {}
        }
      }
    } catch (e) {
      const status = e?.statusCode || e?.response?.status || e?.data?.statusCode
      if (status === 409) {
        // Stale/duplicate round (see action.post.js's atomic claim) — reload the real state from
        // the server rather than leaving the UI stuck on a submission that never applied.
        try {
          const fresh = await $fetch(`/api/cmoon/battle/${battle.value.id}`)
          battle.value = fresh.battle
          phase.value = battle.value.status === 'RESOLVED' ? 'RESULT' : 'FIGHT'
        } catch {
          close()
        }
      } else {
        error.value = e?.data?.statusMessage || 'Something went wrong — try again.'
      }
    } finally {
      busy.value = false
    }
  }

  // The chance-roll's cooldown is already spent at offer time (see consider.post.js updating
  // lastCMoonBattlePopupAt before this ever renders) — declining costs nothing further server-side.
  function decline() {
    visible.value = false
    enemy.value = null
    lastRound.value = null
  }

  // Leaves an IN_PROGRESS battle exactly where it is (reclaimed later by start.post.js's idle
  // timeout if the player never comes back) — just hides the popup. Also used to dismiss a
  // RESULT screen.
  function close() {
    visible.value = false
    enemy.value = null
    battle.value = null
    phase.value = 'OFFER'
    error.value = ''
    lastRound.value = null
  }

  return { visible, phase, enemy, battle, inCMoon, busy, error, lastRound, checkOnNavigate, startBattle, submitAction, decline, close }
}
