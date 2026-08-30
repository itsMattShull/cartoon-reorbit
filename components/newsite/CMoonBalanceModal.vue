<!-- components/newsite/CMoonBalanceModal.vue
     Admin tool: preview and execute a "Balance Teams" rebalance — moves the minimum number of
     non-captain players between unlocked cMoons so every team's member count is as even as
     possible. Shown as a confirmation step before anything is written: the admin sees exactly
     who would move (grouped by destination team, collapsed by default) before committing.

     Moves are grouped by destination rather than shown as one flat per-player list — a rebalance
     can involve dozens of players, and a flat list would be an unusable wall of rows on a phone.
-->
<template>
  <!-- z-[60]: the globally-mounted "Daily" onboarding widget (components/Onboarding.vue) is
       fixed/z-50 in the bottom-right corner on every page — an open modal must always render
       above it, not tie with it. -->
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!busy && $emit('close')"></div>
    <div class="cbm relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Balance Teams</h3>
        <button class="cbm-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" @click="$emit('close')" :disabled="busy">✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <div v-if="loading" class="text-xs text-gray-600">Loading…</div>

        <template v-else-if="error">
          <p class="text-xs text-red-600">{{ error }}</p>
        </template>

        <template v-else>
          <p class="text-[11px] text-gray-600">
            Moves non-captain players between unlocked cMoons to even out membership. Captains,
            admins, and locked cMoons are never touched. No new prize cToons are awarded, and each
            player's existing cMoon points/history moves with them.
          </p>

          <div v-if="!moves.length" class="text-xs text-gray-700 bg-gray-50 border rounded p-3">
            Teams are already balanced — nothing to move.
          </div>

          <template v-else>
            <div class="border rounded divide-y">
              <div v-for="t in teams" :key="t.id" class="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                <span class="flex items-center gap-1.5 min-w-0">
                  <span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ background: t.color }"></span>
                  <span class="break-words min-w-0">{{ t.name }}</span>
                </span>
                <span class="flex-shrink-0 text-gray-600">{{ t.current }} → {{ t.target }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <div v-for="grp in groupedByDestination" :key="grp.toCMoonId" class="border rounded">
                <button
                  type="button"
                  class="cbm-tap w-full flex items-center justify-between gap-2 px-2 text-left text-[11px] font-medium"
                  @click="toggleExpanded(grp.toCMoonId)"
                >
                  <span class="flex items-center gap-1.5 min-w-0">
                    <span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ background: grp.toColor }"></span>
                    <span class="break-words min-w-0">{{ grp.toName }}: +{{ grp.moves.length }} player{{ grp.moves.length === 1 ? '' : 's' }}</span>
                  </span>
                  <span class="flex-shrink-0 text-gray-400">{{ expanded.has(grp.toCMoonId) ? '▾' : '▸' }}</span>
                </button>
                <div v-if="expanded.has(grp.toCMoonId)" class="border-t divide-y">
                  <div v-for="mv in grp.moves" :key="mv.userId" class="px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
                    <span class="break-words min-w-0">{{ mv.username }}</span>
                    <span class="flex-shrink-0 text-gray-500">from {{ mv.fromName }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <button type="button" class="cbm-tap px-3 border rounded" @click="$emit('close')" :disabled="busy">Cancel</button>
        <button
          v-if="!loading && !error && moves.length"
          type="button"
          class="cbm-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
          :disabled="busy"
          @click="confirmBalance"
        >{{ busy ? 'Moving…' : `Move ${moves.length} player${moves.length === 1 ? '' : 's'}` }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const emit = defineEmits(['close', 'done'])

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const teams = ref([])
const moves = ref([])
const expanded = ref(new Set())

const groupedByDestination = computed(() => {
  const byDest = new Map()
  for (const mv of moves.value) {
    if (!byDest.has(mv.toCMoonId)) {
      byDest.set(mv.toCMoonId, { toCMoonId: mv.toCMoonId, toName: mv.toName, toColor: mv.toColor, moves: [] })
    }
    byDest.get(mv.toCMoonId).moves.push(mv)
  }
  return [...byDest.values()]
})

function toggleExpanded(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function loadPreview() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch('/api/admin/cmoons/balance-teams/preview')
    teams.value = data.teams || []
    moves.value = data.moves || []
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to load balance preview'
  } finally {
    loading.value = false
  }
}

async function confirmBalance() {
  busy.value = true
  try {
    const result = await $fetch('/api/admin/cmoons/balance-teams', { method: 'POST' })
    emit('done', result)
    emit('close')
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to balance teams'
  } finally {
    busy.value = false
  }
}

onMounted(loadPreview)
</script>

<style scoped>
/* Same "opt out of the newsite dark body" fix AdminCMoon.vue/CMoonDisperseModal.vue use. */
.cbm {
  color: #111;
  color-scheme: light;
}

@media (min-width: 640px) {
  .cbm {
    height: auto !important;
    max-height: 92vh;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  }
}

/* 44px minimum touch target, matching AdminCMoon.vue's .cm-tap convention. */
.cbm-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
</style>
