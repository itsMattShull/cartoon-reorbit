<!-- components/newsite/admin/legacy/OgPackRewardSettings.vue
     Manage Games > gToons (Original): the PvP WINNER PACK reward. One pack, and how many a single player can earn per 24h
     window (8pm–7:59pm Central, the same window cMart pack limits use). v-model: { packId, limit } — both set, or both
     empty (= off). The server validates again (pack exists and has contents, limit 1–100, all-or-nothing).
     Below the form: an activity panel, so farming shows up in numbers rather than only in complaints. -->
<template>
  <div class="space-y-3">
    <h3 class="text-xs font-semibold text-gray-800">Winner pack reward</h3>
    <p class="text-[11px] text-gray-500">
      The winner of a played-out <strong>random-queue or direct-challenge</strong> match gets one sealed pack. Not paid for:
      ties, forfeits or timeouts, tournament games, practice, or when the loser let the timer play for them (fewer than 2 rounds
      committed by hand). A player earns at most one pack per opponent per window. The window resets at 8pm CST. Leave both
      fields empty to turn the reward off.
    </p>

    <datalist id="og-win-pack-options">
      <option v-for="p in options" :key="p.id" :value="label(p)" />
    </datalist>

    <div class="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
      <label class="flex flex-col gap-0.5">
        <span class="text-xs font-semibold text-gray-800">Reward pack</span>
        <span class="flex items-center gap-2">
          <input
            v-model="packText" list="og-win-pack-options" type="text" autocomplete="off"
            class="flex-1 border rounded px-2 py-1.5 text-sm text-gray-900 bg-white" placeholder="Type to search packs"
            @change="commit"
          />
          <img v-if="selected?.imagePath" :src="selected.imagePath" alt="" width="32" height="32" class="w-8 h-8 object-contain rounded border" />
        </span>
      </label>
      <label class="flex flex-col gap-0.5">
        <span class="text-xs font-semibold text-gray-800">Max per player / window</span>
        <input
          v-model.number="limitText" type="number" min="1" max="100" step="1"
          class="border rounded px-2 py-1.5 text-sm text-gray-900 bg-white" placeholder="e.g. 3"
          @input="commit"
        />
      </label>
      <button type="button" class="px-2 py-1.5 text-[11px] rounded border bg-white hover:bg-gray-50" @click="clear">Turn off</button>
    </div>

    <p v-if="problem" class="text-[11px] text-red-600" role="alert">{{ problem }}</p>
    <p v-else-if="modelValue.packId && modelValue.limit" class="text-[11px] text-green-700">
      On: winners get <strong>{{ selected?.name || 'the selected pack' }}</strong>, up to <strong>{{ modelValue.limit }}</strong> per player per window.
    </p>
    <p v-else class="text-[11px] text-gray-500">Off: no pack is awarded.</p>
    <p v-if="loadError" class="text-[11px] text-red-600">{{ loadError }}</p>

    <details class="border rounded bg-white" @toggle="e => e.target.open && loadStats()">
      <summary class="px-2 py-1.5 text-xs font-semibold cursor-pointer">Reward activity</summary>
      <div class="p-2 text-[11px] space-y-2">
        <button type="button" class="px-2 py-1 rounded border bg-white hover:bg-gray-50" @click="loadStats">Refresh</button>
        <p v-if="statsError" class="text-red-600">{{ statsError }}</p>
        <template v-if="stats">
          <p><strong>{{ stats.awardedThisWindow }}</strong> pack(s) awarded in the current window.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div v-for="[title, data] in [['Last 24 hours', stats.statusLast24h], ['Last 7 days', stats.statusLast7d]]" :key="title">
              <div class="font-semibold">{{ title }} — matches by outcome</div>
              <div v-if="!Object.keys(data).length" class="text-gray-500">None yet.</div>
              <table v-else class="w-full"><tbody>
                <tr v-for="(n, k) in data" :key="k" class="border-t"><td class="py-0.5">{{ k }}</td><td class="py-0.5 text-right tabular-nums">{{ n }}</td></tr>
              </tbody></table>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <div class="font-semibold">Most-rewarded players (7 days)</div>
              <div v-if="!stats.topWinners7d.length" class="text-gray-500">None yet.</div>
              <ul v-else><li v-for="w in stats.topWinners7d" :key="w.username" class="border-t py-0.5 flex justify-between"><span>{{ w.username }}</span><span class="tabular-nums">{{ w.awards }}</span></li></ul>
            </div>
            <div>
              <div class="font-semibold">Repeat pairs (7 days) <span class="font-normal text-gray-500">— same winner beat same loser on different days</span></div>
              <div v-if="!stats.repeatPairs7d.length" class="text-gray-500">None.</div>
              <ul v-else><li v-for="p in stats.repeatPairs7d" :key="p.winner + p.loser" class="border-t py-0.5 flex justify-between"><span>{{ p.winner }} ← {{ p.loser }}</span><span class="tabular-nums">{{ p.awards }}</span></li></ul>
            </div>
          </div>
          <div>
            <div class="font-semibold">Recent awards</div>
            <div v-if="!stats.recent.length" class="text-gray-500">None yet.</div>
            <ul v-else><li v-for="(r, i) in stats.recent" :key="i" class="border-t py-0.5">{{ new Date(r.at).toLocaleString() }} — {{ r.winner }} beat {{ r.loser }} ({{ r.pack }})</li></ul>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ packId: null, limit: null }) }
})
const emit = defineEmits(['update:modelValue'])

const options = ref([])
const loadError = ref('')
const packText = ref('')
const limitText = ref(null)
const stats = ref(null)
const statsError = ref('')

const label = (p) => `${p.name} (${p.id})`
const selected = computed(() => options.value.find(p => p.id === props.modelValue.packId) || null)

function find (input) {
  const v = (input || '').trim()
  if (!v) return null
  const direct = options.value.find(p => p.id === v || label(p) === v)
  if (direct) return direct
  const id = v.match(/\(([^)]+)\)\s*$/)?.[1]?.trim()
  if (id) { const byId = options.value.find(p => p.id === id); if (byId) return byId }
  const byName = options.value.filter(p => p.name === v)
  return byName.length === 1 ? byName[0] : null
}

// Reflect an incoming value (the page's initial load) into the inputs.
watch(() => props.modelValue, (m) => {
  limitText.value = m.limit ?? null
  const p = options.value.find(o => o.id === m.packId)
  if (p) packText.value = label(p)
  else if (!m.packId) packText.value = ''
}, { immediate: true, deep: true })

const problem = computed(() => {
  const typed = packText.value.trim()
  if (typed && !find(typed)) return `Unrecognized pack “${typed}”. Pick one from the list.`
  const hasPack = !!props.modelValue.packId
  const hasLimit = props.modelValue.limit != null
  if (hasPack !== hasLimit) return 'Set both a pack and a per-player limit, or clear both.'
  if (hasLimit && (!Number.isInteger(props.modelValue.limit) || props.modelValue.limit < 1 || props.modelValue.limit > 100)) return 'The limit must be a whole number from 1 to 100.'
  return ''
})

function commit () {
  const typed = packText.value.trim()
  const p = typed ? find(typed) : null
  const limit = limitText.value === '' || limitText.value == null || Number.isNaN(Number(limitText.value)) ? null : Number(limitText.value)
  emit('update:modelValue', { packId: p ? p.id : null, limit })
}
function clear () {
  packText.value = ''; limitText.value = null
  emit('update:modelValue', { packId: null, limit: null })
}

async function loadStats () {
  statsError.value = ''
  try { stats.value = await $fetch('/api/admin/game-config/og-pack-reward-stats') }
  catch (e) { statsError.value = e?.data?.statusMessage || 'Could not load activity.' }
}

onMounted(async () => {
  try {
    let page = 1; let total = Infinity
    while (options.value.length < total && page <= 20) {
      const res = await $fetch(`/api/admin/packs?page=${page}&limit=200`)
      total = res.total ?? 0
      options.value.push(...(res.items || []).map(p => ({ id: p.id, name: p.name, imagePath: p.imagePath })))
      if (!res.items?.length) break
      page += 1
    }
    const p = options.value.find(o => o.id === props.modelValue.packId)
    if (p) packText.value = label(p)
  } catch (e) {
    loadError.value = 'Could not load the pack list.'
  }
})

defineExpose({ problem })
</script>
