// Singleton driver for the cMoon Enemy Battles popup — mirrors useFullscreenEffect.js's
// useState-backed singleton pattern. checkOnNavigate() is called from CMoonBattlePopupHost.vue on
// every route change (see that component's route watcher) and hits
// server/api/cmoon/battle/consider.post.js, which owns the actual chance-roll/cooldown — this
// composable just holds whatever that endpoint hands back and drives the fight once started.
export function useCMoonBattlePopup() {
  const visible = useState('cmoon-battle-visible', () => false)
  // 'OFFER' (an enemy to size up, not yet fought) | 'FIGHT' (an in-progress battle) |
  // 'RESULT' (just resolved — shown until the player dismisses it).
  const phase = useState('cmoon-battle-phase', () => 'OFFER')
  const enemy = useState('cmoon-battle-enemy', () => null)
  const battle = useState('cmoon-battle-battle', () => null)
  const busy = useState('cmoon-battle-busy', () => false)
  const error = useState('cmoon-battle-error', () => '')
  // The just-resolved round's { round, playerAction, enemyAction, playerHit, enemyHit } — display
  // detail only (never read back to resolve anything), cleared whenever a fresh battle starts.
  const lastRound = useState('cmoon-battle-last-round', () => null)

  // Plain module-level flag, not useState: this only ever needs to prevent two concurrent
  // in-flight /consider calls from the same client tick, never anything serialized across SSR.
  let checking = false

  async function checkOnNavigate() {
    // Never interrupt an offer/fight/result already on screen with a fresh roll.
    if (visible.value || checking) return
    checking = true
    try {
      const res = await $fetch('/api/cmoon/battle/consider', { method: 'POST' })
      if (!res?.offered) return
      if (res.resumed) {
        battle.value = res.battle
        phase.value = battle.value?.status === 'RESOLVED' ? 'RESULT' : 'FIGHT'
      } else {
        enemy.value = res.enemy
        battle.value = null
        phase.value = 'OFFER'
      }
      visible.value = true
    } catch {
      // Not logged in, no cMoon, feature off, or a transient error — silently skip, same
      // stance components/CMoonSelectModal.vue's own checkStatus() takes.
    } finally {
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
      if (battle.value.status === 'RESOLVED') {
        phase.value = 'RESULT'
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

  return { visible, phase, enemy, battle, busy, error, lastRound, checkOnNavigate, startBattle, submitAction, decline, close }
}
