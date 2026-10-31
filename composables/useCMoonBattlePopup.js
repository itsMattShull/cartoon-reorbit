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

// Generic result stinger, reused from the Win Ball mini-game's own win/lose cues rather than
// commissioning new audio — only a fallback for whichever enemies have no admin-uploaded
// victory/defeatSoundPath of their own (see the RESOLVED branch below), so an admin's custom
// sound is never layered under or replaced by this.
const RESULT_STINGER = { WIN: '/winball/win.mp3', LOSS: '/winball/lose.mp3' }

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
  // Special attacks (see CMoonSpecialAttack's own schema comment) each carry their own one sound,
  // independent of the enemy's six battle-moment sounds above — both a player's own cast and the
  // enemy's automatic one can appear in the same round's `specials` list.
  for (const special of round.specials || []) playSound(special.soundPath)
}

// One random pick from an enemy's admin-authored taunt pool for a given moment (see
// CMoonEnemyTaunt's own schema comment) — the server sends every active row for both triggers
// rather than pre-picking one itself, so a resumed battle or a plain re-fetch never "locks in"
// whichever line happened to be rolled first; the random choice lives entirely here, client-side.
function pickRandomTaunt(list) {
  if (!Array.isArray(list) || !list.length) return null
  return list[Math.floor(Math.random() * list.length)]
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
  // The currently-showing enemy taunt line (see CMoonEnemyTaunt's own schema comment) — set on
  // reveal (an APPEAR taunt, shown for the OFFER screen) and on a landed enemy crit (a CRIT
  // taunt, shown alongside that round's summary); '' means nothing to show. Cleared whenever the
  // moment it belongs to has passed (Fight pressed, a non-crit round, battle closed) rather than
  // left stale on screen past its own moment.
  const currentTaunt = useState('cmoon-battle-taunt', () => '')
  // Whether the just-resolved WIN is this player's first-ever victory over this specific enemy
  // member (see action.post.js's resolveWin, the only place this is computed) — display-only, a
  // one-time toast on the RESULT screen, never read back to resolve anything. Always false for a
  // LOSS/ABANDONED outcome, since the server only computes/sends it on a WIN.
  const isFirstWinAgainstThisEnemy = useState('cmoon-battle-first-win', () => false)
  // Whether a player can currently create a private/invite-only raid, as of the /consider call
  // that offered this encounter (see GlobalGameConfig.cMoonRaidPrivateLobbiesEnabled) — only
  // meaningful for a raid-boss OFFER, default true (the normal/allowed state) so the checkbox
  // shows by default and only hides once a real "disabled" answer comes back. The server stays
  // the real authority either way (cmoonraid:start silently forces isPrivate false when this is
  // off) — this is purely so the player isn't shown an option that will silently do nothing.
  const raidPrivateLobbiesEnabled = useState('cmoon-battle-raid-private-lobbies-enabled', () => true)
  // Same shape as raidPrivateLobbiesEnabled above, for GlobalGameConfig.cMoonRaidSoloQueueEnabled
  // — drives whether the OFFER screen's flavor text mentions fighting a raid boss solo at all.
  const raidSoloQueueEnabled = useState('cmoon-battle-raid-solo-queue-enabled', () => true)

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
        currentTaunt.value = ''
        isFirstWinAgainstThisEnemy.value = false
        checking = false
        return
      }

      enemy.value = res.enemy
      battle.value = null
      phase.value = 'OFFER'
      // Only meaningful (and only sent) for a raid-boss offer — see consider.post.js's own
      // comment. Defaults true for any other offer so a stale non-raid value never hides the
      // checkbox/flavor text it doesn't even apply to.
      raidPrivateLobbiesEnabled.value = res.raidPrivateLobbiesEnabled !== false
      raidSoloQueueEnabled.value = res.raidSoloQueueEnabled !== false

      const reveal = () => {
        visible.value = true
        playSound(res.enemy?.appearSoundPath)
        const taunt = pickRandomTaunt(res.enemy?.taunts?.appear)
        if (taunt) {
          currentTaunt.value = taunt.text
          playSound(taunt.soundPath)
        } else {
          currentTaunt.value = ''
        }
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
      // The OFFER-screen appear taunt (if any) belongs to that screen alone — clear it the moment
      // the fight actually begins rather than leaving it stuck on screen through the whole battle.
      currentTaunt.value = ''
      isFirstWinAgainstThisEnemy.value = false
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
      // A CRIT taunt only fires on the enemy's OWN landed crit — never the player's — matching
      // CMoonEnemyTaunt.trigger's own schema comment on why there's no player-crit slot to pick
      // from here. NOTE the field name: round.playerCrit means "a crit landed ON THE PLAYER"
      // (dealt by the enemy, rolled against critChanceFromPercent — see resolveRound's own
      // comment), exactly like playerHit already means "the player got hit," NOT "the player's
      // own crit" — round.enemyCrit is the opposite, a crit the PLAYER landed on the enemy.
      // Cleared on any other round so a previous round's line doesn't linger once it's no longer
      // relevant.
      if (res.round?.playerCrit) {
        const taunt = pickRandomTaunt(battle.value?.enemy?.taunts?.crit)
        if (taunt) {
          currentTaunt.value = taunt.text
          playSound(taunt.soundPath)
        } else {
          currentTaunt.value = ''
        }
      } else {
        currentTaunt.value = ''
      }
      if (battle.value.status === 'RESOLVED') {
        phase.value = 'RESULT'
        isFirstWinAgainstThisEnemy.value = !!res.isFirstWinAgainstThisEnemy
        if (battle.value.outcome === 'WIN') playSound(battle.value.enemy?.victorySoundPath || RESULT_STINGER.WIN)
        else if (battle.value.outcome === 'LOSS') playSound(battle.value.enemy?.defeatSoundPath || RESULT_STINGER.LOSS)
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

  // consider.post.js never stamps the cooldown/spawn-cap for a mere offer (see its own comment) —
  // only an actual "Fight!"/raid-start does, in start.post.js / cmoonRaidSocket.js. So declining
  // costs nothing server-side; this is purely a client-side dismiss.
  function decline() {
    visible.value = false
    enemy.value = null
    lastRound.value = null
    currentTaunt.value = ''
    isFirstWinAgainstThisEnemy.value = false
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
    currentTaunt.value = ''
    isFirstWinAgainstThisEnemy.value = false
  }

  return {
    visible, phase, enemy, battle, inCMoon, busy, error, lastRound, currentTaunt, isFirstWinAgainstThisEnemy,
    raidPrivateLobbiesEnabled, raidSoloQueueEnabled,
    checkOnNavigate, startBattle, submitAction, decline, close,
  }
}
