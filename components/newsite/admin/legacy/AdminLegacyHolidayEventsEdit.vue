<!-- /pages/admin/edit-holidayevent/[id].vue -->
<template>

  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">
    <!-- Back & Title -->
    <div class="flex items-center gap-2 mb-3">
      <NuxtLink to="/newsite/admin/holidayEvents" class="text-xs text-blue-700 hover:underline focus-visible:outline-blue-700">
        ← Back to Holiday Events
      </NuxtLink>
      <h1 class="text-base font-semibold">Edit Holiday Event</h1>
    </div>

    <!-- Status -->
    <div v-if="pending" class="text-gray-500 py-6 text-center">Loading…</div>
    <div v-else-if="error" class="text-red-600 py-6 text-center">{{ error.message || 'Failed to load event' }}</div>

    <form v-else @submit.prevent="submit" class="space-y-4 bg-white rounded border p-3">
      <!-- 1) BASIC INFO -->
      <section class="grid sm:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="ev-name" class="text-xs font-medium">Event name <span class="text-red-500">*</span></label>
          <input id="ev-name" v-model.trim="name" type="text" class="border rounded-md px-2 py-1.5 text-sm" required />
        </div>

        <div class="flex flex-col gap-1">
          <label for="ev-start" class="text-xs font-medium">Starts (CST date/time)<span class="text-red-500">*</span></label>
          <input id="ev-start" v-model="startsAt" type="datetime-local" class="border rounded-md px-2 py-1.5 text-sm" required />
        </div>

        <div class="flex flex-col gap-1">
          <label for="ev-end" class="text-xs font-medium">Ends (CST date/time)<span class="text-red-500">*</span></label>
          <input id="ev-end" v-model="endsAt" type="datetime-local" class="border rounded-md px-2 py-1.5 text-sm" required />
        </div>

        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="ev-minreveal" class="text-xs font-medium">Minimum Reveal Date (optional)</label>
          <input id="ev-minreveal" v-model="minRevealAt" type="datetime-local" class="border rounded-md px-2 py-1.5 text-sm" />
          <p class="text-[10px] text-gray-500">Holiday Items cannot reveal into pool results before this time. CST date/time.</p>
        </div>
      </section>

      <!-- 2) HOLIDAY ITEMS -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold">Holiday Items</h2>
          <span class="text-[11px] text-gray-600">Selected: {{ itemIds.length }}</span>
        </div>

        <div class="relative max-w-xl cto-autocomplete">
          <input
            ref="itemSearchInput"
            v-model="itemSearch"
            type="text"
            placeholder="Search cToons to use as Holiday Items…"
            class="w-full border rounded-md px-2 py-1.5 text-sm"
            @focus="itemsOpen = true"
            @keydown.down.prevent="itemsHighlightNext"
            @keydown.up.prevent="itemsHighlightPrev"
            @keydown.enter.prevent="itemsChooseHighlighted"
          />
          <ul
            v-if="itemsOpen && itemSuggestions.length"
            class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y"
          >
            <li
              v-for="(s, idx) in itemSuggestions"
              :key="s.id"
              @mousedown.prevent="toggleItem(s)"
              :class="['flex items-center gap-2 px-2 py-1.5 cursor-pointer', idx === itemsHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50']"
            >
              <img v-if="s.assetPath" :src="s.assetPath" class="w-7 h-7 object-cover rounded border flex-shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium flex items-center gap-1">
                  <span class="truncate">{{ s.name }}</span>
                  <span :class="s.isSecondEdition ? 'edition-badge edition-badge-2nd' : 'edition-badge edition-badge-1st'">
                    {{ s.isSecondEdition ? '2nd Edition' : '1st Edition' }}
                  </span>
                </p>
                <p class="text-[10px] text-gray-500">{{ s.rarity }}</p>
              </div>
            </li>
          </ul>
        </div>

        <div v-if="itemIds.length" class="rounded-md border divide-y">
          <div v-for="id in itemIds" :key="id" class="flex items-center gap-2 px-2 py-1.5">
            <img v-if="lookup[id]?.assetPath" :src="lookup[id].assetPath" class="w-8 h-8 object-cover rounded border flex-shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium flex items-center gap-1">
                <span class="truncate">{{ lookup[id]?.name }}</span>
                <span v-if="lookup[id]?.isSecondEdition" class="edition-badge edition-badge-2nd">2nd Edition</span>
              </p>
              <p class="text-[10px] text-gray-500">{{ lookup[id]?.rarity }}</p>
            </div>
            <button type="button" @click="toggleItem(lookup[id])" class="text-red-700 hover:underline text-[11px] focus-visible:outline-red-700">
              Remove
            </button>
          </div>
        </div>
        <p v-else class="text-[11px] text-gray-500">No Holiday Items.</p>
      </section>

      <!-- 3) HOLIDAY POOL -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold">Holiday Pool</h2>
          <div class="flex items-center gap-2">
            <span class="text-[11px]">Total: <strong :class="poolTotal === 100 ? 'text-green-700' : 'text-red-700'">{{ poolTotal }}</strong>%</span>
            <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="splitEvenly" :disabled="!poolIds.length">
              Split evenly
            </button>
          </div>
        </div>

        <div class="relative max-w-xl cto-autocomplete">
          <input
            ref="poolSearchInput"
            v-model="poolSearch"
            type="text"
            placeholder="Search cToons to add to the Holiday Pool…"
            class="w-full border rounded-md px-2 py-1.5 text-sm"
            @focus="poolOpen = true"
            @keydown.down.prevent="poolHighlightNext"
            @keydown.up.prevent="poolHighlightPrev"
            @keydown.enter.prevent="poolChooseHighlighted"
          />
          <ul
            v-if="poolOpen && poolSuggestions.length"
            class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y"
          >
            <li
              v-for="(s, idx) in poolSuggestions"
              :key="s.id"
              @mousedown.prevent="togglePool(s)"
              :class="['flex items-center gap-2 px-2 py-1.5 cursor-pointer', idx === poolHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50']"
            >
              <img v-if="s.assetPath" :src="s.assetPath" class="w-7 h-7 object-cover rounded border flex-shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium flex items-center gap-1">
                  <span class="truncate">{{ s.name }}</span>
                  <span :class="s.isSecondEdition ? 'edition-badge edition-badge-2nd' : 'edition-badge edition-badge-1st'">
                    {{ s.isSecondEdition ? '2nd Edition' : '1st Edition' }}
                  </span>
                </p>
                <p class="text-[10px] text-gray-500">{{ s.rarity }}</p>
              </div>
            </li>
          </ul>
        </div>

        <div v-if="poolIds.length" class="rounded-md border divide-y">
          <div v-for="id in poolIds" :key="id" class="flex items-center gap-2 px-2 py-1.5">
            <img v-if="lookup[id]?.assetPath" :src="lookup[id].assetPath" class="w-8 h-8 object-cover rounded border flex-shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium flex items-center gap-1">
                <span class="truncate">{{ lookup[id]?.name }}</span>
                <span v-if="lookup[id]?.isSecondEdition" class="edition-badge edition-badge-2nd">2nd Edition</span>
              </p>
            </div>
            <div class="flex items-center gap-1">
              <input v-model.number="poolWeights[id]" type="number" min="0" max="100" class="w-16 border rounded px-1 py-0.5 text-xs" />
              <span class="text-[10px] text-gray-500">%</span>
            </div>
            <button type="button" @click="togglePool(lookup[id])" class="text-red-700 hover:underline text-[11px] focus-visible:outline-red-700">
              Remove
            </button>
          </div>
        </div>
        <p v-else class="text-[11px] text-gray-500">No pool entries.</p>
      </section>

      <!-- 4) SAVE -->
      <div class="flex items-center gap-2">
        <button
          type="submit"
          :disabled="saving || !formValid"
          :title="!formValid ? invalidTooltip : ''"
          class="px-3 py-1.5 text-xs font-semibold rounded-md text-white disabled:cursor-not-allowed disabled:bg-gray-400 bg-blue-600 hover:bg-blue-700"
        >
          Save Changes
        </button>
        <span v-if="saving" class="text-gray-500 text-xs">Saving…</span>
      </div>
    </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from '#app'

const route = useRoute()
const router = useRouter()
// Rendered by the admin shell's catch-all route, which passes the
// trailing URL segments as `subPath`. The route.params fallback keeps
// this component usable if it is ever mounted from a real dynamic route.
const props = defineProps({ subPath: { type: Array, default: () => [] } })
const id = props.subPath[0] ?? route.params.id

// ---- Chicago TZ helpers (DST-aware, no libs) ----
function chicagoDstStartDay(year){ const m=2, first=new Date(Date.UTC(year,m,1)).getUTCDay(); return 1+((7-first)%7)+7 }
function chicagoDstEndDay(year){ const m=10, first=new Date(Date.UTC(year,m,1)).getUTCDay(); return 1+((7-first)%7) }
function isChicagoDST(y, M, d, hh=0, mm=0){
  const k=(mo,da,h,mi)=> (mo*1e6)+(da*1e4)+(h*100)+mi
  const start=(()=>{const sd=chicagoDstStartDay(y);return k(3,sd,2,0)})()
  const end  =(()=>{const ed=chicagoDstEndDay(y); return k(11,ed,2,0)})()
  const cur=k(M,d,hh,mm)
  return cur >= start && cur < end
}
function chicagoLocalToIso(localStr){
  if (!localStr) return null
  const [YMD,HM]=localStr.split('T'); const [y,M,d]=YMD.split('-').map(Number); const [hh,mm]=HM.split(':').map(Number)
  const offset = isChicagoDST(y,M,d,hh,mm) ? 5 : 6
  return new Date(Date.UTC(y,M-1,d,hh+offset,mm)).toISOString()
}
function chicagoLocalToUtcMs(localStr){ const iso=chicagoLocalToIso(localStr); return iso ? Date.parse(iso) : NaN }
function utcIsoToChicagoLocalInput(iso){
  if (!iso) return ''
  const t = Date.parse(iso)
  let dt = new Date(t - 6*3600_000)
  let y=dt.getUTCFullYear(), M=dt.getUTCMonth()+1, d=dt.getUTCDate(), hh=dt.getUTCHours(), mm=dt.getUTCMinutes()
  if (isChicagoDST(y,M,d,hh,mm)) dt = new Date(t - 5*3600_000)
  y=dt.getUTCFullYear(); M=dt.getUTCMonth()+1; d=dt.getUTCDate(); hh=dt.getUTCHours(); mm=dt.getUTCMinutes()
  const pad=n=>String(n).padStart(2,'0')
  return `${y}-${pad(M)}-${pad(d)}T${pad(hh)}:${pad(mm)}`
}

// Fetch event
const { data: eventData, pending, error } = await useFetch('/api/admin/holiday-events', {
  key: `holiday-event-${id}`,
  query: { id },
  credentials: 'include'
})

// Fetch cToons
const { data: ctoonData } = await useFetch('/api/admin/ctoon-pool', {
  key: 'ctoon-pool',
  credentials: 'include'
})

// State
const name        = ref('')
const startsAt    = ref('')
const endsAt      = ref('')
const minRevealAt = ref('')

const ctoons = ref([])
const lookup = ref({})

const itemIds     = ref([])
const poolIds     = ref([])
const poolWeights = ref({})

const saving = ref(false)

// Init
onMounted(() => {
  const ev = eventData.value
  const all = ctoonData.value || []
  ctoons.value = all
  lookup.value = Object.fromEntries(all.map(c => [c.id, c]))

  if (ev) {
    name.value        = ev.name || ''
    startsAt.value    = utcIsoToChicagoLocalInput(ev.startsAt)
    endsAt.value      = utcIsoToChicagoLocalInput(ev.endsAt)
    minRevealAt.value = ev.minRevealAt ? utcIsoToChicagoLocalInput(ev.minRevealAt) : ''

    itemIds.value = (ev.items || []).map(x => x.ctoonId)
    poolIds.value = (ev.poolEntries || []).map(x => x.ctoonId)
    poolWeights.value = Object.fromEntries((ev.poolEntries || []).map(x => [x.ctoonId, x.probabilityPercent]))
  }
})

// Items autocomplete (require 3+ chars)
const itemSearch      = ref('')
const itemSearchInput = ref(null)
const itemsOpen       = ref(false)
const itemsHighlighted= ref(-1)
const itemSuggestions = computed(() => {
  const term = itemSearch.value.toLowerCase().trim()
  if (term.length < 3) return []
  let list = ctoons.value.filter(c => !itemIds.value.includes(c.id))
  list = list.filter(c => c.name.toLowerCase().includes(term))
  return list.slice(0, 50)
})
function toggleItem(c) {
  const id = c.id
  const i = itemIds.value.indexOf(id)
  if (i === -1) itemIds.value.push(id)
  else itemIds.value.splice(i, 1)
  // keep menu open and keep focus
  itemsHighlighted.value = -1
  itemsOpen.value = itemSearch.value.trim().length >= 3
  nextTick(() => itemSearchInput.value?.focus())
}
function itemsHighlightNext(){ if (!itemSuggestions.value.length) return; itemsHighlighted.value=(itemsHighlighted.value+1)%itemSuggestions.value.length }
function itemsHighlightPrev(){ if (!itemSuggestions.value.length) return; itemsHighlighted.value=(itemsHighlighted.value-1+itemSuggestions.value.length)%itemSuggestions.value.length }
function itemsChooseHighlighted(){ if (itemsHighlighted.value>=0) toggleItem(itemSuggestions.value[itemsHighlighted.value]) }

// Pool autocomplete (require 3+ chars)
const poolSearch      = ref('')
const poolSearchInput = ref(null)
const poolOpen        = ref(false)
const poolHighlighted = ref(-1)
const poolSuggestions = computed(() => {
  const term = poolSearch.value.toLowerCase().trim()
  if (term.length < 3) return []
  let list = ctoons.value.filter(c => !poolIds.value.includes(c.id))
  list = list.filter(c => c.name.toLowerCase().includes(term))
  return list.slice(0, 50)
})
function togglePool(c) {
  const id = c.id
  const i = poolIds.value.indexOf(id)
  if (i === -1) {
    poolIds.value.push(id)
    poolWeights.value[id] = poolWeights.value[id] ?? 0
  } else {
    poolIds.value.splice(i, 1)
    delete poolWeights.value[id]
  }
  // keep menu open and keep focus
  poolHighlighted.value = -1
  poolOpen.value = poolSearch.value.trim().length >= 3
  nextTick(() => poolSearchInput.value?.focus())
}
function poolHighlightNext(){ if (!poolSuggestions.value.length) return; poolHighlighted.value=(poolHighlighted.value+1)%poolSuggestions.value.length }
function poolHighlightPrev(){ if (!poolSuggestions.value.length) return; poolHighlighted.value=(poolHighlighted.value-1+poolSuggestions.value.length)%poolSuggestions.value.length }
function poolChooseHighlighted(){ if (poolHighlighted.value>=0) togglePool(poolSuggestions.value[poolHighlighted.value]) }
function splitEvenly(){
  const n = poolIds.value.length
  if (!n) return
  const base = Math.floor(100/n)
  let rem = 100 - base*n
  for (const id of poolIds.value) {
    poolWeights.value[id] = base + (rem>0 ? 1:0)
    if (rem>0) rem--
  }
}
const poolTotal = computed(() => poolIds.value.reduce((s,id)=>s+Number(poolWeights.value[id]||0),0))

// Validation (Chicago interpretation)
const datesValid = computed(() => {
  if (!startsAt.value || !endsAt.value) return false
  const s = chicagoLocalToUtcMs(startsAt.value)
  const e = chicagoLocalToUtcMs(endsAt.value)
  if (!(s < e)) return false
  if (minRevealAt.value) {
    const m = chicagoLocalToUtcMs(minRevealAt.value)
    if (!(m >= s)) return false
  }
  return true
})
const nameValid = computed(() => name.value.length > 0)
const poolValid = computed(() => poolIds.value.length > 0 && poolTotal.value === 100)
const formValid = computed(() => nameValid.value && datesValid.value && poolValid.value)
const invalidTooltip = computed(() => {
  if (!nameValid.value) return 'Name required'
  if (!datesValid.value) return 'Fix start/end or minimum reveal date'
  if (!poolValid.value) return 'Pool must have entries totaling 100%'
  return ''
})

// Outside click
function handleOutsideClick(e) {
  if (!e.target.closest('.cto-autocomplete')) {
    itemsOpen.value = false
    poolOpen.value = false
  }
}
if (process.client) window.addEventListener('click', handleOutsideClick)
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', handleOutsideClick)
})

// Submit (send UTC ISO derived from Chicago time)
async function submit() {
  if (!formValid.value) return
  const payload = {
    name: name.value,
    startsAt: chicagoLocalToIso(startsAt.value),
    endsAt: chicagoLocalToIso(endsAt.value),
    minRevealAt: minRevealAt.value ? chicagoLocalToIso(minRevealAt.value) : null,
    items: itemIds.value.map(id => ({ ctoonId: id })),
    poolEntries: poolIds.value.map(id => ({ ctoonId: id, probabilityPercent: Number(poolWeights.value[id] || 0) }))
  }
  try {
    saving.value = true
    await $fetch(`/api/admin/holiday-events/${id}`, {
      method: 'PUT',
      body: payload,
      credentials: 'include'
    })
    router.push('/newsite/admin/holidayEvents')
  } catch (err) {
    console.error(err)
    alert('Failed to save changes')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.cto-autocomplete ul { z-index: 60; }
.edition-badge {
  display: inline-block;
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 1px 6px;
  border-radius: 10px;
}
.edition-badge-2nd { background: #7c3aed; color: #fff; }
.edition-badge-1st { background: #e5e7eb; color: #374151; }
</style>
