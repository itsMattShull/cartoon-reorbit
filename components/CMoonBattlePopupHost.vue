<template>
  <Teleport to="body">
    <div v-if="visible" class="cbp-overlay">
      <div class="cbp-modal" role="dialog" aria-modal="true" aria-labelledby="cbp-title">
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
          <h2 id="cbp-title" class="cbp-title">{{ enemy?.name || 'An enemy appears!' }}</h2>
          <p class="cbp-sub">
            {{ enemy?.faction?.name ? `${enemy.faction.name} · ` : '' }}
            {{ enemy?.battleMode === 'SHARED_POOL' ? 'Shared HP' : 'Solo fight' }} · {{ enemy?.hp }} HP
          </p>
          <p class="cbp-flavor">
            Pick the right move each round to land hits — you have {{ PLAYER_MAX_HP }} HP of your own.
            A win earns cMoon points for your team and a chance at prizes.
          </p>
          <p v-if="error" class="cbp-error">{{ error }}</p>
          <div class="cbp-actions">
            <button type="button" class="cbp-btn cbp-btn-primary" :disabled="busy" @click="onFight">
              {{ busy ? 'Starting…' : 'Fight!' }}
            </button>
            <button type="button" class="cbp-btn cbp-btn-secondary" :disabled="busy" @click="onClose">Not now</button>
          </div>
        </div>

        <!-- ── Fight: an in-progress battle ────────────────────────────── -->
        <div v-else-if="phase === 'FIGHT'" class="cbp-body">
          <div class="cbp-portrait-wrap">
            <img v-if="battle?.enemy?.imagePath" :src="battle.enemy.imagePath" alt="" class="cbp-portrait" />
          </div>
          <h2 id="cbp-title" class="cbp-title">{{ battle?.enemy?.name }}</h2>

          <div class="cbp-hp-row">
            <span class="cbp-hp-label">Enemy</span>
            <div class="cbp-hp-bar"><div class="cbp-hp-fill cbp-hp-fill-enemy" :style="{ width: enemyHpPercent + '%' }"></div></div>
            <span class="cbp-hp-count">{{ battle?.enemyHpRemaining }}/{{ battle?.enemy?.maxHp }}</span>
          </div>
          <div class="cbp-hp-row">
            <span class="cbp-hp-label">You</span>
            <div class="cbp-hearts">
              <span v-for="i in PLAYER_MAX_HP" :key="i" class="cbp-heart" :class="{ 'cbp-heart-lost': i > (battle?.playerHpRemaining ?? PLAYER_MAX_HP) }">♥</span>
            </div>
          </div>

          <p v-if="lastRound" class="cbp-round-summary">
            You {{ actionLabel(lastRound.playerAction) }}, they {{ actionLabel(lastRound.enemyAction) }} —
            <span :class="lastRoundClass">{{ lastRoundLabel }}</span>
          </p>
          <p v-if="error" class="cbp-error">{{ error }}</p>

          <div class="cbp-move-grid">
            <button type="button" class="cbp-move cbp-move-attack" :disabled="busy" @click="act('ATTACK_HIGH')">Attack High</button>
            <button type="button" class="cbp-move cbp-move-attack" :disabled="busy" @click="act('ATTACK_LOW')">Attack Low</button>
            <button type="button" class="cbp-move cbp-move-block" :disabled="busy" @click="act('BLOCK_HIGH')">Block High</button>
            <button type="button" class="cbp-move cbp-move-block" :disabled="busy" @click="act('BLOCK_LOW')">Block Low</button>
          </div>
          <p class="cbp-hint">Blocking the same side as their attack cancels it — anything else lands a hit.</p>
        </div>

        <!-- ── Result: just resolved ───────────────────────────────────── -->
        <div v-else class="cbp-body">
          <h2 id="cbp-title" class="cbp-title" :class="resultTitleClass">{{ resultTitle }}</h2>
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
            <button type="button" class="cbp-btn cbp-btn-primary" @click="onClose">Close</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Kept in sync with server/utils/cmoonEnemyBattle.js's own PLAYER_MAX_HP — that file is
// server-only and can't be imported client-side, same reasoning as the admin page's hardcoded
// HP/points bounds mirroring server/utils/cmoonEnemy.js.
const PLAYER_MAX_HP = 5

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/newsite/admin'))

const { visible, phase, enemy, battle, busy, error, lastRound, checkOnNavigate, startBattle, submitAction, decline, close } = useCMoonBattlePopup()

const bannerStyle = computed(() => {
  const path = phase.value === 'OFFER' ? enemy.value?.faction?.bannerImagePath : battle.value?.enemy?.faction?.bannerImagePath
  return path ? { backgroundImage: `url(${path})` } : {}
})

const enemyHpPercent = computed(() => {
  const max = battle.value?.enemy?.maxHp || 1
  const cur = battle.value?.enemyHpRemaining ?? max
  return Math.max(0, Math.min(100, Math.round((cur / max) * 100)))
})

const ACTION_LABELS = { ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low' }
function actionLabel(a) { return ACTION_LABELS[a] || a }

const lastRoundLabel = computed(() => {
  if (!lastRound.value) return ''
  const { playerHit, enemyHit } = lastRound.value
  if (playerHit && enemyHit) return 'you both landed a hit!'
  if (playerHit) return 'you took a hit!'
  if (enemyHit) return 'you landed a hit!'
  return 'no hits landed.'
})
const lastRoundClass = computed(() => {
  if (!lastRound.value) return ''
  const { playerHit, enemyHit } = lastRound.value
  if (enemyHit && !playerHit) return 'cbp-round-good'
  if (playerHit && !enemyHit) return 'cbp-round-bad'
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
    return `Background${r.quantity > 1 ? ` x${r.quantity}` : ''}`
  })
})

async function onFight() {
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
  background: rgba(0, 0, 0, 0.55);
}
.cbp-modal {
  width: 100%;
  max-width: 380px;
  max-height: 92vh;
  overflow-y: auto;
  background: #fff;
  color: #111;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
.cbp-banner {
  position: relative;
  height: 64px;
  background: linear-gradient(135deg, #3a1d5c, #1c0f33);
  background-size: cover;
  background-position: center;
  border-radius: 14px 14px 0 0;
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
  width: 96px;
  height: 96px;
  margin: -50px auto 6px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cbp-portrait { max-width: 90%; max-height: 90%; object-fit: contain; }
.cbp-title { font-size: 18px; font-weight: 700; margin: 4px 0 2px; }
.cbp-title-win { color: #15803d; }
.cbp-title-loss { color: #b91c1c; }
.cbp-sub { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
.cbp-flavor { font-size: 12px; color: #374151; margin-bottom: 12px; line-height: 1.4; }
.cbp-error { font-size: 12px; color: #b91c1c; margin-bottom: 8px; }

.cbp-actions { display: flex; flex-direction: column; gap: 8px; }
.cbp-btn {
  padding: 9px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.cbp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.cbp-btn-primary { background: #4f46e5; color: #fff; }
.cbp-btn-secondary { background: #f3f4f6; color: #374151; }

.cbp-hp-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.cbp-hp-label { font-size: 11px; font-weight: 600; color: #6b7280; width: 42px; text-align: left; flex-shrink: 0; }
.cbp-hp-bar { flex: 1; height: 10px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
.cbp-hp-fill-enemy { height: 100%; background: #dc2626; transition: width 0.25s ease; }
.cbp-hp-count { font-size: 11px; color: #6b7280; width: 44px; text-align: right; flex-shrink: 0; }
.cbp-hearts { flex: 1; display: flex; gap: 3px; }
.cbp-heart { color: #dc2626; font-size: 15px; }
.cbp-heart-lost { color: #e5e7eb; }

.cbp-round-summary { font-size: 12px; color: #374151; margin: 8px 0; }
.cbp-round-good { color: #15803d; font-weight: 600; }
.cbp-round-bad { color: #b91c1c; font-weight: 600; }
.cbp-round-neutral { color: #6b7280; font-weight: 600; }

.cbp-move-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.cbp-move {
  padding: 12px 6px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: #fff;
  border: none;
  cursor: pointer;
}
.cbp-move:disabled { opacity: 0.6; cursor: not-allowed; }
.cbp-move-attack { background: #dc2626; }
.cbp-move-block { background: #2563eb; }
.cbp-hint { font-size: 10.5px; color: #9ca3af; margin-top: 8px; }

.cbp-points { font-size: 15px; font-weight: 700; color: #15803d; margin-bottom: 8px; }
.cbp-rewards { text-align: left; background: #f9fafb; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
.cbp-rewards-title { font-size: 11px; font-weight: 700; color: #6b7280; margin-bottom: 4px; }
.cbp-rewards ul { margin: 0; padding-left: 16px; font-size: 12px; }
</style>
