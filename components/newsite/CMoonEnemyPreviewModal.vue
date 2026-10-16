<template>
  <div class="cepm-overlay">
    <div class="cepm-modal" role="dialog" aria-modal="true" aria-labelledby="cepm-title">
      <div class="cepm-banner" :style="bannerStyle">
        <button type="button" class="cepm-close" aria-label="Close" @click="onClose">✕</button>
      </div>
      <div class="cepm-body">
        <p class="cepm-note">
          Test-only — nothing here is saved: no battle log, no rewards, no points, and it never
          counts toward your own "prior wins" total.
        </p>

        <div v-if="loading" class="cepm-loading">Loading…</div>
        <p v-else-if="startError" class="cepm-start-error">{{ startError }}</p>

        <!-- Same card the live site-wide popup uses (CMoonBattlePopupHost.vue) — see that
             component's own comment on why this is shared rather than a bespoke lookalike, which
             is exactly how this modal drifted out of date (plain hearts/Tailwind look) the first
             time around. -->
        <CMoonBattleCard
          v-else-if="enemy"
          title-id="cepm-title"
          :phase="outcome ? 'RESULT' : 'FIGHT'"
          :enemy-name="enemy.name"
          :enemy-rank="enemy.rank"
          :enemy-image-path="enemy.imagePath"
          :enemy-max-hp="enemy.maxHp"
          :enemy-hp-remaining="state.enemyHpRemaining"
          :player-hp-remaining="state.playerHpRemaining"
          :player-max-hp="state.playerMaxHp"
          :player-stamina="state.playerStamina"
          :player-max-stamina="state.playerMaxStamina"
          :busy="busy"
          :error="actionError"
          :last-round-label="lastRoundLabel"
          :last-round-class="lastRoundClass"
          :crit-badge="!!(lastRound?.playerCrit || lastRound?.enemyCrit)"
          :outcome="outcome"
          :result-title="resultTitle"
          :result-title-class="resultTitleClass"
          :points-awarded="wouldGrant?.cMoonPoints || 0"
          :rewards-list="rewardsList"
          @action="act"
          @close="onClose"
        >
          <template #result-extra>
            <p class="cepm-note cepm-note-result">
              Preview only — nothing above was actually granted (points assume the player is in a cMoon).
            </p>
            <p v-if="outcome === 'WIN' && !rewardsList.length" class="cepm-note cepm-note-result">
              No prize rows hit this roll — re-preview to try again.
            </p>
          </template>
          <template #result-actions>
            <div class="cepm-result-actions">
              <BlueButton type="button" @click="restart">Fight again</BlueButton>
              <button type="button" class="cepm-btn-secondary" @click="onClose">Close</button>
            </div>
          </template>
        </CMoonBattleCard>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ memberId: { type: String, required: true } })
const emit = defineEmits(['close'])

const loading = ref(true)
const startError = ref('')
const actionError = ref('')
const busy = ref(false)
const enemy = ref(null)
// playerMaxHp/playerMaxStamina come from the server (GlobalGameConfig.cMoonEnemyBattleDefaultHp/
// cMoonEnemyBattleStartingStamina — see preview.post.js) rather than hardcoded client constants,
// since an admin can change either default at any time; this preview is deliberately NOT
// personalized by the admin's own cMoon rank (see preview.post.js's own comment), so it's always
// just those plain defaults.
const state = reactive({
  playerHpRemaining: 0, playerMaxHp: 0, playerStamina: 0, playerMaxStamina: 0,
  enemyHpRemaining: 0, roundNumber: 1,
})
const lastRound = ref(null)
const outcome = ref(null)
const wouldGrant = ref(null)

const bannerStyle = computed(() => {
  const path = enemy.value?.faction?.bannerImagePath
  return path ? { backgroundImage: `url(${path})` } : {}
})

const ACTION_LABELS = { ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low' }
// Mirrors CMoonBattlePopupHost.vue's own lastRoundLabel, minus the SPECIAL_ATTACK/PARALYZED/
// specials branches it has to handle — this preview never models either (see preview-action.post.js's
// own header comment), so every round here is always one of the plain 4 lane moves.
const lastRoundLabel = computed(() => {
  if (!lastRound.value) return ''
  const { playerAction, enemyAction, playerHit, enemyHit, playerBlocked, enemyBlocked, counterHit } = lastRound.value
  const actions = `You ${ACTION_LABELS[playerAction]}, they ${ACTION_LABELS[enemyAction]} — `
  if (playerHit && enemyHit) return `${actions}you both landed a hit!`
  if (playerHit) return `${actions}you took a hit!`
  if (enemyHit) return `${actions}you landed a hit!`
  if (playerBlocked && counterHit) return `${actions}you blocked it, healed 1 HP, and countered for damage!`
  if (playerBlocked) return `${actions}you blocked it and healed 1 HP!`
  if (enemyBlocked) return `${actions}they blocked it and healed 1 HP!`
  return `${actions}no hits landed.`
})
const lastRoundClass = computed(() => {
  if (!lastRound.value) return ''
  const { playerHit, enemyHit, playerBlocked } = lastRound.value
  if (enemyHit && !playerHit) return 'cbc-round-good'
  if (playerHit && !enemyHit) return 'cbc-round-bad'
  if (playerBlocked) return 'cbc-round-good'
  return 'cbc-round-neutral'
})
const resultTitle = computed(() => {
  if (outcome.value === 'WIN') return 'Victory!'
  if (outcome.value === 'LOSS') return 'Defeated'
  return 'Battle ended' // the only other outcome this preview can reach is ABANDONED (round cap)
})
const resultTitleClass = computed(() => {
  if (outcome.value === 'WIN') return 'cbc-title-win'
  if (outcome.value === 'LOSS') return 'cbc-title-loss'
  return ''
})
// Matches CMoonBattlePopupHost.vue's own rewardsList formatting exactly, just reading from
// wouldGrant.items (preview-action.post.js's shape) instead of battle.rewardsGranted.
const rewardsList = computed(() => {
  const items = Array.isArray(wouldGrant.value?.items) ? wouldGrant.value.items : []
  return items.map(item => {
    if (item.type === 'CTOON') return `${item.label || 'cToon'}${item.quantity > 1 ? ` x${item.quantity}` : ''}`
    if (item.type === 'AVATAR') return 'Avatar'
    if (item.type === 'BACKGROUND') return 'Background'
    if (item.type === 'POINTS') return `${item.quantity} points`
    return ''
  }).filter(Boolean)
})

async function startPreview() {
  loading.value = true
  startError.value = ''
  actionError.value = ''
  outcome.value = null
  wouldGrant.value = null
  lastRound.value = null
  try {
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${props.memberId}/preview`, { method: 'POST' })
    enemy.value = res.enemy
    Object.assign(state, res.state)
  } catch (e) {
    startError.value = e?.data?.statusMessage || 'Could not start preview.'
  } finally {
    loading.value = false
  }
}

async function act(action) {
  if (busy.value || outcome.value) return
  busy.value = true
  actionError.value = ''
  try {
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${props.memberId}/preview-action`, {
      method: 'POST',
      body: {
        action, playerHpRemaining: state.playerHpRemaining, playerMaxHp: state.playerMaxHp,
        playerStamina: state.playerStamina, playerMaxStamina: state.playerMaxStamina,
        enemyHpRemaining: state.enemyHpRemaining, roundNumber: state.roundNumber,
      },
    })
    lastRound.value = res.round
    Object.assign(state, res.state)
    outcome.value = res.outcome
    wouldGrant.value = res.wouldGrant
  } catch (e) {
    actionError.value = e?.data?.statusMessage || 'Something went wrong.'
  } finally {
    busy.value = false
  }
}

function restart() {
  startPreview()
}

function onClose() {
  emit('close')
}

onMounted(startPreview)
</script>

<style scoped>
/* Same dark navy branded dialog chrome as the live popup (CMoonBattlePopupHost.vue's own
   .cbp-overlay/.cbp-modal/.cbp-banner/.cbp-close) — duplicated rather than shared because this
   modal isn't Teleported and has its own close/restart affordances, but every class here is
   deliberately a copy of that one so the two can never visually drift apart on the OUTER chrome
   either, same reasoning as CMoonBattleCard.vue sharing the INNER battle card. */
.cepm-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(0, 20, 50, 0.75);
}
.cepm-modal {
  position: relative;
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
.cepm-banner {
  position: relative;
  height: 64px;
  background: linear-gradient(135deg, #1a4a7a, #0a1f3a);
  background-size: cover;
  background-position: center;
  border-radius: 6px 6px 0 0;
}
.cepm-close {
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
.cepm-body { padding: 14px 16px 18px; text-align: center; }
.cepm-note { font-size: 11px; font-style: italic; color: rgba(255, 255, 255, 0.55); margin: 0 0 10px; }
.cepm-note-result { margin: 0 0 8px; }
.cepm-loading { font-size: 13px; color: rgba(255, 255, 255, 0.7); padding: 20px 0; }
.cepm-start-error { font-size: 13px; color: #f87171; padding: 20px 0; }

.cepm-result-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.cepm-btn-secondary {
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
.cepm-btn-secondary:hover { background: #991b1b; }
</style>
