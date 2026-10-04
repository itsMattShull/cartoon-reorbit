<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-2">
    <div class="absolute inset-0 bg-black/50" @click="onClose"></div>
    <div class="relative bg-white w-full max-w-md rounded-lg shadow-lg flex flex-col max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Preview Encounter</h3>
        <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="onClose">✕</button>
      </div>

      <div class="p-4 space-y-3 text-sm">
        <p class="text-[11px] text-gray-500">
          Test-only — nothing here is saved: no battle log, no rewards, no points, and it never
          counts toward your own "prior wins" total.
        </p>

        <div v-if="loading" class="text-gray-500">Loading…</div>
        <p v-else-if="error" class="text-red-600">{{ error }}</p>

        <template v-else-if="enemy">
          <div class="flex items-center gap-3">
            <div class="w-16 h-16 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
              <img v-if="enemy.imagePath" :src="enemy.imagePath" alt="" class="max-w-full max-h-full object-contain" />
              <span v-else class="text-gray-400 text-[10px]">No art</span>
            </div>
            <div class="min-w-0">
              <div class="font-semibold">
                {{ enemy.name }}
                <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="RANK_BADGE_CLASS[enemy.rank]">{{ RANK_LABELS[enemy.rank] }}</span>
              </div>
              <div class="text-[11px] text-gray-500">{{ enemy.faction?.name }} · {{ enemy.battleMode === 'SHARED_POOL' ? 'Shared pool' : 'Per player' }}</div>
            </div>
          </div>

          <div class="space-y-1">
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-12 flex-shrink-0 text-gray-500">Enemy</span>
              <div class="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                <div class="h-full bg-red-500" :style="{ width: enemyHpPercent + '%' }"></div>
              </div>
              <span class="w-14 flex-shrink-0 text-right tabular-nums">{{ state.enemyHpRemaining }}/{{ enemy.maxHp }}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-12 flex-shrink-0 text-gray-500">You</span>
              <div class="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                <div class="h-full bg-green-500" :style="{ width: playerHpPercent + '%' }"></div>
              </div>
              <span class="w-14 flex-shrink-0 text-right tabular-nums">{{ state.playerHpRemaining }}/{{ PLAYER_MAX_HP }}</span>
            </div>
          </div>

          <p v-if="lastRound" class="text-[11px]" :class="lastRoundClass">{{ lastRoundLabel }}</p>

          <template v-if="!outcome">
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" :disabled="busy" @click="act('ATTACK_HIGH')">Attack High</button>
              <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" :disabled="busy" @click="act('ATTACK_LOW')">Attack Low</button>
              <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="busy" @click="act('BLOCK_HIGH')">Block High</button>
              <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="busy" @click="act('BLOCK_LOW')">Block Low</button>
            </div>
          </template>

          <template v-else>
            <div class="border rounded p-3 space-y-1" :class="outcome === 'WIN' ? 'bg-green-50 border-green-200' : outcome === 'LOSS' ? 'bg-red-50 border-red-200' : 'bg-gray-50'">
              <p class="font-semibold">{{ outcomeLabel }}</p>
              <template v-if="outcome === 'WIN'">
                <p class="text-[11px] text-gray-600">Would award {{ wouldGrant?.cMoonPoints || 0 }} cMoon points (if the player is in a cMoon), plus:</p>
                <ul v-if="wouldGrant?.items?.length" class="text-[11px] list-disc pl-4">
                  <li v-for="(item, i) in wouldGrant.items" :key="i">
                    {{ item.type === 'CTOON' ? `${item.label}${item.quantity > 1 ? ` x${item.quantity}` : ''}` : '' }}
                    {{ item.type === 'AVATAR' ? `Avatar: ${item.label}` : '' }}
                    {{ item.type === 'BACKGROUND' ? `Background: ${item.label}` : '' }}
                    {{ item.type === 'POINTS' ? `${item.quantity} points` : '' }}
                  </li>
                </ul>
                <p v-else class="text-[11px] text-gray-500">No prize rows hit this roll — re-preview to try again.</p>
              </template>
            </div>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="restart">Fight again</button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ memberId: { type: String, required: true } })
const emit = defineEmits(['close'])

const PLAYER_MAX_HP = 5
const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }
const RANK_BADGE_CLASS = {
  GOON: 'bg-gray-200 text-gray-700',
  ENFORCER: 'bg-blue-100 text-blue-700',
  UNDERBOSS: 'bg-purple-100 text-purple-700',
  FINAL_BOSS: 'bg-red-100 text-red-700',
}

const loading = ref(true)
const error = ref('')
const busy = ref(false)
const enemy = ref(null)
const state = reactive({ playerHpRemaining: PLAYER_MAX_HP, enemyHpRemaining: 0, roundNumber: 1 })
const lastRound = ref(null)
const outcome = ref(null)
const wouldGrant = ref(null)

const enemyHpPercent = computed(() => {
  const max = enemy.value?.maxHp || 1
  return Math.max(0, Math.min(100, Math.round((state.enemyHpRemaining / max) * 100)))
})
const playerHpPercent = computed(() => Math.max(0, Math.min(100, Math.round((state.playerHpRemaining / PLAYER_MAX_HP) * 100))))

const ACTION_LABELS = { ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low' }
const lastRoundLabel = computed(() => {
  if (!lastRound.value) return ''
  const { playerAction, enemyAction, playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit } = lastRound.value
  const actions = `You ${ACTION_LABELS[playerAction]}, they ${ACTION_LABELS[enemyAction]} — `
  const critNote = (playerCrit || enemyCrit) ? ' (CRITICAL!)' : ''
  if (playerHit && enemyHit) return `${actions}you both landed a hit!${critNote}`
  if (playerHit) return `${actions}you took a hit!${critNote}`
  if (enemyHit) return `${actions}you landed a hit!${critNote}`
  if (playerBlocked) return `${actions}you blocked it and healed 1 HP!`
  if (enemyBlocked) return `${actions}they blocked it and healed 1 HP!`
  return `${actions}no hits landed.`
})
const lastRoundClass = computed(() => {
  if (!lastRound.value) return ''
  const { playerHit, enemyHit } = lastRound.value
  if (enemyHit && !playerHit) return 'text-green-600 font-semibold'
  if (playerHit && !enemyHit) return 'text-red-600 font-semibold'
  return 'text-gray-500'
})
const outcomeLabel = computed(() => {
  if (outcome.value === 'WIN') return 'Preview result: Win'
  if (outcome.value === 'LOSS') return 'Preview result: Loss'
  return 'Preview ended (round cap reached)'
})

async function startPreview() {
  loading.value = true
  error.value = ''
  outcome.value = null
  wouldGrant.value = null
  lastRound.value = null
  try {
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${props.memberId}/preview`, { method: 'POST' })
    enemy.value = res.enemy
    Object.assign(state, res.state)
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Could not start preview.'
  } finally {
    loading.value = false
  }
}

async function act(action) {
  if (busy.value || outcome.value) return
  busy.value = true
  try {
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${props.memberId}/preview-action`, {
      method: 'POST',
      body: { action, playerHpRemaining: state.playerHpRemaining, enemyHpRemaining: state.enemyHpRemaining, roundNumber: state.roundNumber },
    })
    lastRound.value = res.round
    Object.assign(state, res.state)
    outcome.value = res.outcome
    wouldGrant.value = res.wouldGrant
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Something went wrong.'
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
