<template>
  <Teleport to="body">
    <div v-if="visible" class="cbp-overlay">
      <div class="cbp-modal" :class="{ 'cbp-shake': shaking, 'cbp-shake-crit': shaking && shakeCrit }" role="dialog" aria-modal="true" aria-labelledby="cbp-title">
        <div
          class="cbp-banner"
          :style="bannerStyle"
        >
          <button
            v-if="phase !== 'FIGHT'" type="button" class="cbp-close" aria-label="Close"
            @click="onClose"
          >✕</button>
        </div>

        <!-- ── Offer: an enemy to size up, not yet fought ─────────────── -->
        <div v-if="phase === 'OFFER'" class="cbp-body">
          <div class="cbp-portrait-wrap">
            <img v-if="enemy?.imagePath" :src="enemy.imagePath" alt="" class="cbp-portrait" />
          </div>
          <h2 id="cbp-title" class="cbp-title">
            {{ enemy?.name || 'An enemy appears!' }}
            <span v-if="enemy?.rank" class="cbp-rank-badge" :class="'cbp-rank-' + enemy.rank">{{ RANK_LABELS[enemy.rank] }}</span>
          </h2>
          <p class="cbp-sub">
            {{ enemy?.faction?.name ? `${enemy.faction.name} · ` : '' }}
            {{ enemy?.battleMode === 'SHARED_POOL' ? 'Shared HP' : 'Solo fight' }} · {{ enemy?.hp }} HP
          </p>
          <p class="cbp-flavor">
            Pick the right move each round to land hits.
            <template v-if="inCMoon">A win earns cMoon points for your team and a chance at prizes.</template>
            <template v-else>A win earns a chance at prizes — join a cMoon to also earn points for a team.</template>
          </p>
          <p v-if="error" class="cbp-error">{{ error }}</p>
          <p v-if="enemy?.isRaidBoss" class="cbp-flavor">
            This is a raid boss — up to 3 other eligible members of your cMoon can join for 60 seconds before it
            auto-starts, and a party win grants everyone who joined the same prize.
          </p>
          <div class="cbp-actions">
            <GreenButton type="button" class="cbp-btn-wide" :disabled="busy" @click="onFight">
              {{ busy ? 'Starting…' : (enemy?.isRaidBoss ? 'Start Raid!' : 'Fight!') }}
            </GreenButton>
            <button type="button" class="cbp-btn-secondary" :disabled="busy" @click="onClose">Not now</button>
          </div>
        </div>

        <!-- ── Fight: an in-progress battle ────────────────────────────── -->
        <div v-else-if="phase === 'FIGHT'" class="cbp-body">
          <div class="cbp-portrait-wrap">
            <img v-if="battle?.enemy?.imagePath" :src="battle.enemy.imagePath" alt="" class="cbp-portrait" />
          </div>
          <h2 id="cbp-title" class="cbp-title">
            {{ battle?.enemy?.name }}
            <span v-if="battle?.enemy?.rank" class="cbp-rank-badge" :class="'cbp-rank-' + battle.enemy.rank">{{ RANK_LABELS[battle.enemy.rank] }}</span>
          </h2>

          <div class="cbp-hp-tile">
            <div class="cbp-hp-row">
              <span class="cbp-hp-label">Enemy</span>
              <div class="cbp-hp-bar"><div class="cbp-hp-fill cbp-hp-fill-enemy" :style="{ width: enemyHpPercent + '%' }"></div></div>
              <span class="cbp-hp-count">{{ battle?.enemyHpRemaining }}/{{ battle?.enemy?.maxHp }}</span>
            </div>
            <div class="cbp-hp-row">
              <span class="cbp-hp-label">You</span>
              <div class="cbp-hearts">
                <span v-for="i in (battle?.playerMaxHp || 1)" :key="i" class="cbp-heart" :class="{ 'cbp-heart-lost': i > (battle?.playerHpRemaining ?? 0) }">♥</span>
              </div>
            </div>
          </div>

          <p v-if="battle?.playerParalyzedTurns > 0" class="cbp-paralyzed-badge">
            ⚡ Paralyzed — can't act for {{ battle.playerParalyzedTurns }} more round{{ battle.playerParalyzedTurns === 1 ? '' : 's' }}
          </p>
          <p v-if="lastRound" class="cbp-round-summary" :class="lastRoundClass">
            {{ lastRoundLabel }}
            <span v-if="lastRound.playerCrit || lastRound.enemyCrit" class="cbp-crit-badge">CRITICAL!</span>
          </p>
          <p v-for="(s, i) in (lastRound?.specials || [])" :key="i" class="cbp-special-flash" :class="s.side === 'PLAYER' ? 'cbp-special-flash-player' : 'cbp-special-flash-enemy'">
            {{ s.side === 'PLAYER' ? 'You' : battle?.enemy?.name || 'The enemy' }} unleashed <strong>{{ s.name }}</strong>!
          </p>
          <p v-if="error" class="cbp-error">{{ error }}</p>

          <div class="cbp-move-grid">
            <button type="button" class="cbp-move cbp-move-attack" :disabled="busy" @click="act('ATTACK_HIGH')">Attack High</button>
            <button type="button" class="cbp-move cbp-move-attack" :disabled="busy" @click="act('ATTACK_LOW')">Attack Low</button>
            <BlueButton type="button" class="cbp-move" :disabled="busy" @click="act('BLOCK_HIGH')">Block High</BlueButton>
            <BlueButton type="button" class="cbp-move" :disabled="busy" @click="act('BLOCK_LOW')">Block Low</BlueButton>
          </div>
          <p class="cbp-hint">Blocking the same side as their attack cancels it (and heals 1 HP) — anything else lands a hit.</p>

          <!-- ── Special attack: dormant until the player's own cMoon has one assigned, then
               fills up with each consecutive hit landed — see useCMoonBattlePopup.js/
               action.post.js for the charge/fire mechanics. ────────────────────────────────── -->
          <div v-if="battle?.playerSpecialAttack" class="cbp-special-wrap">
            <button
              type="button" class="cbp-special-btn" :class="{ 'cbp-special-charged': battle.playerSpecialCharged && !battle.playerParalyzedTurns }"
              :disabled="busy || !battle.playerSpecialCharged || battle.playerParalyzedTurns > 0" :style="specialFillStyle"
              @click="act('SPECIAL_ATTACK')"
            >
              <span class="cbp-special-glow" aria-hidden="true"></span>
              <span class="cbp-special-label">
                <span class="cbp-special-icon">★</span>
                {{ battle.playerSpecialAttack.name }}
              </span>
              <span class="cbp-special-meter">{{ Math.min(battle.playerHitStreak, 3) }}/3</span>
            </button>
            <button
              type="button" class="cbp-special-help" aria-label="What does this special attack do?"
              @click="showSpecialInfo = !showSpecialInfo" @mouseenter="showSpecialInfo = true" @mouseleave="showSpecialInfo = false"
            >?</button>
            <div v-if="showSpecialInfo" class="cbp-special-tooltip" role="tooltip">
              <p class="cbp-special-tooltip-title">{{ battle.playerSpecialAttack.name }}</p>
              <p v-if="battle.playerSpecialAttack.description">{{ battle.playerSpecialAttack.description }}</p>
              <p>{{ specialEffectDescription(battle.playerSpecialAttack) }}</p>
              <p class="cbp-special-tooltip-charge">Land 3 hits in a row to charge it up — it stays ready until you use it.</p>
            </div>
          </div>
        </div>

        <!-- ── Result: just resolved ───────────────────────────────────── -->
        <div v-else class="cbp-body">
          <h2 id="cbp-title" class="cbp-title" :class="resultTitleClass">
            {{ resultTitle }}
            <span v-if="lastRound?.playerCrit || lastRound?.enemyCrit" class="cbp-crit-badge">CRITICAL!</span>
          </h2>
          <p class="cbp-sub">{{ battle?.enemy?.name }}</p>

          <template v-if="battle?.outcome === 'WIN'">
            <p v-if="battle?.pointsAwarded" class="cbp-points">+{{ battle.pointsAwarded }} cMoon points</p>
            <div v-if="rewardsList.length" class="cbp-rewards">
              <p class="cbp-rewards-title">Prizes:</p>
              <ul>
                <li v-for="(r, i) in rewardsList" :key="i">{{ r }}</li>
              </ul>
            </div>
          </template>
          <p v-else-if="battle?.outcome === 'ABANDONED'" class="cbp-flavor">The fight timed out — no penalty, try again anytime.</p>
          <p v-else class="cbp-flavor">No penalty beyond the loss itself — take another shot anytime.</p>

          <div class="cbp-actions">
            <button type="button" class="cbp-btn-secondary cbp-btn-secondary-solid" @click="onClose">Close</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Mirrors server/utils/cmoonEnemy.js's RANK_LABELS — same client-duplication reasoning the old
// hardcoded PLAYER_MAX_HP here used to follow, before a player's max HP became admin/rank-
// dependent (see battle.playerMaxHp, sent fresh by the server on every battle response) rather
// than a single constant safe to mirror client-side.
const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/newsite/admin'))

const { visible, phase, enemy, battle, inCMoon, busy, error, lastRound, checkOnNavigate, startBattle, submitAction, decline, close } = useCMoonBattlePopup()

const bannerStyle = computed(() => {
  const path = phase.value === 'OFFER' ? enemy.value?.faction?.bannerImagePath : battle.value?.enemy?.faction?.bannerImagePath
  return path ? { backgroundImage: `url(${path})` } : {}
})

const enemyHpPercent = computed(() => {
  const max = battle.value?.enemy?.maxHp || 1
  const cur = battle.value?.enemyHpRemaining ?? max
  return Math.max(0, Math.min(100, Math.round((cur / max) * 100)))
})

// SPECIAL_ATTACK/PARALYZED mirror the server's own sentinel actions (see SPECIAL_ACTION/
// PARALYZED_ACTION in server/utils/cmoonEnemyBattle.js) — a round's playerAction/enemyAction can
// be either of these instead of one of the 4 lane moves, and must read as plain English here
// rather than leaking the raw constant into the round summary.
const ACTION_LABELS = {
  ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low',
  SPECIAL_ATTACK: 'used a special attack', PARALYZED: 'were paralyzed',
}
function actionLabel(a) { return ACTION_LABELS[a] || a }

// ── Special attack button (see CMoonSpecialAttack's own schema comment, server-side) ──────────
// Mirrors that model's effectType enum purely for the player-facing "?" tooltip copy — this file
// has no server import, so it's duplicated client-side the same way RANK_LABELS above already is.
function specialEffectDescription(attack) {
  const n = attack?.amount
  switch (attack?.effectType) {
    case 'DAMAGE_OPPONENT': return `Deals ${n} guaranteed damage to the enemy, bypassing block.`
    case 'HEAL_SELF': return `Heals you for ${n} HP.`
    case 'PARALYZE_OPPONENT': return `Stuns the enemy for ${n} round${n === 1 ? '' : 's'} — they can't attack or block.`
    case 'LOWER_OPPONENT_ATTACK': return `Lowers the enemy's attack damage by ${n} for the rest of the fight.`
    case 'RAISE_ALLY_ATTACK': return `Raises your own attack damage by ${n} for the rest of the fight.`
    default: return ''
  }
}
const showSpecialInfo = ref(false)
// 0/1/2/3 hits -> 0/33/66/100% fill, read by .cbp-special-fill below via this CSS variable —
// stays at 100% once charged even if playerHitStreak itself later resets (see that column's own
// schema comment on why the charge latches rather than mirroring the streak 1:1).
const specialFillStyle = computed(() => {
  const pct = battle.value?.playerSpecialCharged ? 100 : Math.min(100, Math.round(((battle.value?.playerHitStreak || 0) / 3) * 100))
  return { '--cbp-special-fill': pct + '%' }
})

// Covers every shape a round can take: a landed hit (either or both sides), a genuinely
// successful block (which now heals 1 HP — see action.post.js's playerBlocked/enemyBlocked), or
// neither (mutual block, nothing thrown to stop). playerBlocked and enemyBlocked can never both
// be true in the same round (each requires the OTHER side to have thrown an actual attack, and a
// single action can't be both an attack and a block), so these branches are mutually exclusive
// by construction, not just in practice.
const lastRoundLabel = computed(() => {
  if (!lastRound.value) return ''
  const { playerAction, enemyAction, playerHit, enemyHit, playerBlocked, enemyBlocked } = lastRound.value
  const actions = `You ${actionLabel(playerAction)}, they ${actionLabel(enemyAction)} — `
  if (playerHit && enemyHit) return `${actions}you both landed a hit!`
  if (playerHit) return `${actions}you took a hit!`
  if (enemyHit) return `${actions}you landed a hit!`
  if (playerBlocked) return `${actions}you blocked it and healed 1 HP!`
  if (enemyBlocked) return `${actions}they blocked it and healed 1 HP!`
  return `${actions}no hits landed.`
})
const lastRoundClass = computed(() => {
  if (!lastRound.value) return ''
  const { playerHit, enemyHit, playerBlocked } = lastRound.value
  if (enemyHit && !playerHit) return 'cbp-round-good'
  if (playerHit && !enemyHit) return 'cbp-round-bad'
  if (playerBlocked) return 'cbp-round-good'
  return 'cbp-round-neutral'
})

const resultTitle = computed(() => {
  if (battle.value?.outcome === 'WIN') return 'Victory!'
  if (battle.value?.outcome === 'ABANDONED') return 'Battle ended'
  return 'Defeated'
})
const resultTitleClass = computed(() => {
  if (battle.value?.outcome === 'WIN') return 'cbp-title-win'
  if (battle.value?.outcome === 'LOSS') return 'cbp-title-loss'
  return ''
})
const rewardsList = computed(() => {
  const rewards = Array.isArray(battle.value?.rewardsGranted) ? battle.value.rewardsGranted : []
  return rewards.map(r => {
    if (r.type === 'CTOON') return `${r.name || 'cToon'}${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'AVATAR') return `Avatar${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'POINTS') return `${r.quantity} points`
    return `Background${r.quantity > 1 ? ` x${r.quantity}` : ''}`
  })
})

// ── Impact feedback: a brief shake on any round with a landed hit, a bigger one on a critical —
// see rollHitDamage's own comment server-side for what counts as a crit. Respects
// prefers-reduced-motion via the .cbp-shake/.cbp-shake-crit rules' own media query, same
// discipline pages/newsite/asteroid.vue's canvas shake already follows for its impact feedback.
const shaking = ref(false)
const shakeCrit = ref(false)
let shakeTimer = null
function triggerShake(isCrit) {
  if (shakeTimer) clearTimeout(shakeTimer)
  shaking.value = false
  shakeCrit.value = false
  // Re-triggering the CSS animation needs a fresh frame between removing and re-adding the class
  // (setting `shaking` true again on an already-true value is a no-op to Vue/the DOM either way).
  requestAnimationFrame(() => {
    shakeCrit.value = !!isCrit
    shaking.value = true
    shakeTimer = setTimeout(() => { shaking.value = false }, 450)
  })
}
watch(lastRound, (round) => {
  if (!round) return
  if (round.playerHit || round.enemyHit) triggerShake(round.playerCrit || round.enemyCrit)
})

// ── Battle music: one faction-wide looping track, playing for as long as the FIGHT phase is
// showing (never during OFFER/RESULT) — see CMoonEnemyFaction.battleMusicPath's own schema
// comment. A plain HTMLAudioElement rather than the Web Audio API buffers useClickSoundEffects.js
// uses: this is one long-running loop, not many short overlapping one-shots, so there's nothing
// to gain from pre-decoding into a reusable AudioBuffer.
let battleMusicEl = null
function stopBattleMusic() {
  if (!battleMusicEl) return
  try { battleMusicEl.pause() } catch {}
  battleMusicEl = null
}
function startBattleMusic(path) {
  stopBattleMusic()
  if (!path || typeof window === 'undefined') return
  try {
    battleMusicEl = new Audio(path)
    battleMusicEl.loop = true
    battleMusicEl.volume = 0.5
    battleMusicEl.play().catch(() => {})
  } catch {}
}
watch(phase, (p) => {
  if (p === 'FIGHT') startBattleMusic(battle.value?.enemy?.faction?.battleMusicPath)
  else { stopBattleMusic(); showSpecialInfo.value = false }
})
onBeforeUnmount(() => {
  stopBattleMusic()
  if (shakeTimer) clearTimeout(shakeTimer)
})

async function onFight() {
  if (enemy.value?.isRaidBoss) {
    const raidSocket = useCMoonRaidSocket()
    raidSocket.lastError.value = ''
    raidSocket.raidState.value = null // clear any stale raid from a previous visit before watching
    raidSocket.startRaid(enemy.value.id)
    decline() // the raid page takes over from here
    const router = useRouter()
    const stopWatching = watch([raidSocket.raidState, raidSocket.lastError], ([state, err]) => {
      if (state?.id) {
        stopWatching()
        router.push(`/newsite/cmoon-raid/${state.id}`)
      } else if (err) {
        stopWatching()
        // The popup is already closed at this point — a raid-start failure (feature disabled,
        // not eligible, enemy no longer available) surfaces as a plain alert rather than
        // resurrecting a dismissed modal just to show one error line.
        window.alert(err)
      }
    })
    return
  }
  await startBattle()
}

async function act(action) {
  await submitAction(action)
}

function onClose() {
  if (phase.value === 'OFFER') decline()
  else close()
}

// Client-only, deliberately not `{ immediate: true }` on a bare top-level watch: this component
// is unconditionally in the layout, so a top-level immediate watch would also run during SSR
// (every component's setup() executes server-side too) — an extra server-side roll against
// /api/cmoon/battle/consider on every full page load, on top of the one this onMounted below
// fires once hydration completes, effectively giving a cold load double the configured chance.
// onMounted never runs during SSR, so this fires exactly once per real page view: on mount for
// the first load, then again on each subsequent client-side route change below.
function maybeCheck() {
  if (isAdminRoute.value) return
  checkOnNavigate()
}
onMounted(maybeCheck)
watch(() => route.path, maybeCheck)
</script>

<style scoped>
.cbp-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(0, 20, 50, 0.75);
}
/* Dark-navy-card-with-OrbitDarkBlue-border is this site's own "on-brand" dialog language (see
   components/newsite/CtoonInfoCard.vue, the cToon info dialog) — reused here instead of this
   popup's old plain-white/indigo palette so it reads as the same product rather than a bolted-on
   mini-game. */
.cbp-modal {
  width: 100%;
  max-width: 380px;
  max-height: 92vh;
  overflow-y: auto;
  background: #0d2a4d;
  color: #fff;
  border: 2px solid var(--OrbitDarkBlue);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
.cbp-banner {
  position: relative;
  height: 64px;
  background: linear-gradient(135deg, #1a4a7a, #0a1f3a);
  background-size: cover;
  background-position: center;
  border-radius: 6px 6px 0 0;
}
.cbp-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.cbp-body {
  padding: 14px 16px 18px;
  text-align: center;
}
.cbp-portrait-wrap {
  /* .cbp-banner is `position: relative` (so its own .cbp-close button can anchor to it), which —
     regardless of DOM order — makes it paint ABOVE any plain in-flow (position: static) sibling
     content per the CSS stacking rules: positioned elements always paint after static ones within
     the same stacking context. This wrap's negative top margin is deliberately designed to overlap
     the banner (a profile-picture-over-a-cover-photo layout), so without its own position + z-index
     the banner was painting on top of exactly that overlapping region — silently hiding the top of
     whatever portrait art was tall enough to reach up that far (e.g. a character's head), even
     though the box/mask/sizing themselves were never clipping it at all. z-index 1 is enough since
     .cbp-banner never sets one of its own (auto, which paints like z-index 0 here).
  */
  position: relative;
  z-index: 1;
  width: 96px;
  height: 96px;
  margin: -50px auto 6px;
  /* NOT a circle (border-radius: 50%, as this used to be): the upload endpoint
     (server/api/admin/cmoon-enemy-members/[id]/image.post.js) deliberately letterboxes every
     portrait into a full 600x600 *square* with `fit: 'contain'` specifically so a character is
     never cropped — "must never lose a head or a tail to cropping". A square that large can't be
     inscribed in a circle this size (a square's corner-to-corner diagonal is ~1.41x its side, well
     past a circle's diameter at any square wide enough to look properly framed), so the circular
     mask was cropping exactly the corners the upload step went out of its way to preserve — e.g.
     clipping a character's shoulders or outstretched arms. A rounded square has no such geometry
     problem: the full contained image is always visible regardless of the art's own aspect ratio.
  */
  border-radius: 18px;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cbp-portrait { max-width: 92%; max-height: 92%; object-fit: contain; }
.cbp-title { font-size: 1.1rem; font-weight: 600; margin: 4px 0 2px; color: #fff; }
.cbp-title-win { color: #4ade80; }
.cbp-title-loss { color: #f87171; }
.cbp-sub { font-size: 0.78rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; }
.cbp-flavor { font-size: 12px; color: rgba(255, 255, 255, 0.75); margin-bottom: 12px; line-height: 1.4; }
.cbp-error { font-size: 12px; color: #f87171; margin-bottom: 8px; }

.cbp-actions { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
.cbp-btn-wide { width: 100%; padding-top: 9px; padding-bottom: 9px; font-size: 0.95rem; }
/* Red "dismiss/close" action, matching CtoonInfoCard.vue's own .ctic-close-action — this site's
   existing convention for a secondary/destructive dialog action, since there's no shared
   RedButton component to import (only BlueButton/GreenButton exist). */
.cbp-btn-secondary {
  padding: 9px 14px;
  border-radius: 6px;
  border: 2px solid #7a1515;
  background: #b91c1c;
  color: #fff;
  font-weight: bold;
  font-size: 0.85rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  cursor: pointer;
}
.cbp-btn-secondary:hover { background: #991b1b; }
.cbp-btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }
.cbp-btn-secondary-solid { width: 100%; }

.cbp-hp-tile {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  padding: 8px 10px;
  margin: 8px 0;
}
.cbp-hp-row { display: flex; align-items: center; gap: 8px; }
.cbp-hp-row + .cbp-hp-row { margin-top: 6px; }
.cbp-hp-label { font-size: 11px; font-weight: 600; color: rgba(255, 255, 255, 0.6); width: 42px; text-align: left; flex-shrink: 0; }
.cbp-hp-bar { flex: 1; height: 10px; border-radius: 999px; background: rgba(0, 0, 0, 0.35); overflow: hidden; }
.cbp-hp-fill-enemy { height: 100%; background: #dc2626; transition: width 0.25s ease; }
.cbp-hp-count { font-size: 11px; color: rgba(255, 255, 255, 0.6); width: 44px; text-align: right; flex-shrink: 0; }
.cbp-hearts { flex: 1; display: flex; gap: 3px; }
.cbp-heart { color: #f87171; font-size: 15px; }
.cbp-heart-lost { color: rgba(255, 255, 255, 0.2); }

.cbp-paralyzed-badge {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 6px;
  padding: 5px 8px;
  margin: 8px 0 0;
}
.cbp-round-summary { font-size: 12px; color: rgba(255, 255, 255, 0.75); margin: 8px 0; }
.cbp-round-good { color: #4ade80; font-weight: 600; }
.cbp-round-bad { color: #f87171; font-weight: 600; }
.cbp-round-neutral { color: rgba(255, 255, 255, 0.6); font-weight: 600; }
.cbp-crit-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #f59e0b;
  color: #1a1200;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  animation: cbp-crit-pop 0.35s ease-out;
}
@keyframes cbp-crit-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Cosmetic difficulty tier badge — see CMoonEnemyRank's own schema comment. Colors escalate
   low-to-high, matching the admin page's own RANK_BADGE_CLASS palette. */
.cbp-rank-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  vertical-align: middle;
}
.cbp-rank-GOON { background: rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.85); }
.cbp-rank-ENFORCER { background: #1d4ed8; color: #dbeafe; }
.cbp-rank-UNDERBOSS { background: #7e22ce; color: #f3e8ff; }
.cbp-rank-FINAL_BOSS { background: #b91c1c; color: #fee2e2; }

.cbp-move-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
/* Block moves use the real BlueButton component (see the template); Attack moves keep a locally
   red-styled button matching BlueButton's own padding/radius/border/font-weight/text-shadow
   treatment, since attack/block's own red-vs-blue color split predates this restyle and there's
   no reusable red move-button component to swap in. */
.cbp-move {
  padding: 12px 6px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  width: 100%;
}
.cbp-move:disabled { opacity: 0.45; cursor: not-allowed; }
.cbp-move-attack {
  border: 2px solid #7a1515;
  background: #dc2626;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset -1px 0 0 rgba(255, 255, 255, 0.25),
    -1px 1px 1px rgba(0, 0, 0, 0.3);
}
.cbp-move-attack:active { box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.3); }
.cbp-hint { font-size: 10.5px; color: rgba(255, 255, 255, 0.5); margin-top: 8px; }

/* ── Special attack button ────────────────────────────────────────────────────────────────
   Dormant (flat, muted) until charged, then lights up gold/epic. --cbp-special-fill (set inline
   via specialFillStyle) drives a bottom-up gradient fill so the meter visibly climbs with each
   consecutive hit, independent of the charged-glow treatment below. */
.cbp-special-wrap { position: relative; display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.cbp-special-btn {
  position: relative;
  flex: 1;
  overflow: hidden;
  padding: 10px 12px;
  border-radius: 8px;
  border: 2px solid #4b4620;
  background:
    linear-gradient(to top, rgba(250, 204, 21, 0.55) 0%, rgba(250, 204, 21, 0.55) var(--cbp-special-fill, 0%), transparent var(--cbp-special-fill, 0%)),
    #241f0f;
  color: rgba(255, 255, 255, 0.55);
  font-weight: bold;
  font-size: 12.5px;
  text-align: left;
  cursor: not-allowed;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.cbp-special-btn:disabled { opacity: 0.85; }
.cbp-special-label { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; }
.cbp-special-icon { font-size: 13px; filter: grayscale(1); transition: filter 0.2s ease; }
.cbp-special-meter {
  position: relative; z-index: 1;
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}
.cbp-special-glow { position: absolute; inset: 0; z-index: 0; opacity: 0; transition: opacity 0.3s ease; }

/* Charged: gold border, bright icon, pulsing glow sweep — unmistakably "ready to use". */
.cbp-special-charged {
  border-color: #facc15;
  color: #fef3c7;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(250, 204, 21, 0.55), inset 0 0 10px rgba(250, 204, 21, 0.25);
  animation: cbp-special-pulse 1.4s ease-in-out infinite;
}
.cbp-special-charged .cbp-special-icon { filter: none; text-shadow: 0 0 6px #facc15; }
.cbp-special-charged .cbp-special-meter { color: #fef3c7; }
.cbp-special-charged .cbp-special-glow {
  opacity: 1;
  background: radial-gradient(circle at 30% 50%, rgba(255, 237, 160, 0.35), transparent 70%);
}
.cbp-special-charged:active { transform: translateY(1px); }
@keyframes cbp-special-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(250, 204, 21, 0.45), inset 0 0 8px rgba(250, 204, 21, 0.2); }
  50% { box-shadow: 0 0 20px rgba(250, 204, 21, 0.85), inset 0 0 14px rgba(250, 204, 21, 0.4); }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-special-charged { animation: none; }
}

.cbp-special-help {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}
.cbp-special-help:hover { background: rgba(255, 255, 255, 0.18); }
.cbp-special-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  width: 220px;
  z-index: 10;
  text-align: left;
  background: #0a1f3a;
  border: 1px solid var(--OrbitDarkBlue);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cbp-special-tooltip-title { font-weight: 800; color: #facc15; margin-bottom: 3px; }
.cbp-special-tooltip-charge { color: rgba(255, 255, 255, 0.55); margin-top: 4px; }

.cbp-special-flash {
  font-size: 12px;
  font-weight: 700;
  margin: 4px 0;
  animation: cbp-special-flash-pop 0.4s ease-out;
}
.cbp-special-flash-player { color: #facc15; }
.cbp-special-flash-enemy { color: #fb7185; }
@keyframes cbp-special-flash-pop {
  0% { transform: scale(0.85); opacity: 0; }
  60% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-special-flash { animation: none; }
}

.cbp-points { font-size: 15px; font-weight: 700; color: #4ade80; margin-bottom: 8px; }
.cbp-rewards { text-align: left; background: rgba(255, 255, 255, 0.07); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
.cbp-rewards-title { font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px; }
.cbp-rewards ul { margin: 0; padding-left: 16px; font-size: 12px; }

/* Impact feedback on a landed hit — a quick horizontal shake, bigger for a critical. Disabled
   under prefers-reduced-motion, same accessibility stance pages/newsite/asteroid.vue's own
   (JS-driven) screen shake takes. */
@keyframes cbp-shake-kf {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
@keyframes cbp-shake-crit-kf {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-8px); }
  40%, 60% { transform: translateX(8px); }
}
.cbp-shake { animation: cbp-shake-kf 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
.cbp-shake-crit { animation: cbp-shake-crit-kf 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
@media (prefers-reduced-motion: reduce) {
  .cbp-shake, .cbp-shake-crit { animation: none; }
}
</style>
