<!-- /pages/admin/addHolidayEvent.vue -->
<template>

  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">
    <!-- Back & Title -->
    <div class="flex items-center gap-2 mb-3">
      <NuxtLink to="/newsite/admin/holidayEvents" class="text-xs text-blue-700 hover:underline focus-visible:outline-blue-700">
        ← Back to Holiday Events
      </NuxtLink>
      <h1 class="text-base font-semibold">Create Holiday Event</h1>
    </div>

    <!-- Intro -->
    <section class="text-xs text-gray-700 mb-3">
      <p>
        Define the event window, pick the cToons that act as <strong>Holiday Items</strong>, then build the
        <strong>Holiday Pool</strong> with per-cToon redemption chances that total <strong>100&nbsp;%</strong>.
        You can split chances evenly.
      </p>
    </section>

    <!-- FORM -->
    <form @submit.prevent="submit" class="space-y-4 bg-white rounded border p-3">
      <!-- 1) BASIC INFO -->
      <section class="grid sm:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="ev-name" class="text-xs font-medium">Event name <span class="text-red-500">*</span></label>
          <input id="ev-name" v-model.trim="name" type="text" placeholder="e.g. Winter Fest 2025"
                 class="border rounded-md px-2 py-1.5 text-sm" required />
        </div>

        <div class="flex flex-col gap-1">
          <label for="ev-start" class="text-xs font-medium">Starts (CST date/time) <span class="text-red-500">*</span></label>
          <input id="ev-start" v-model="startsAt" type="datetime-local"
                 class="border rounded-md px-2 py-1.5 text-sm" required />
        </div>

        <div class="flex flex-col gap-1">
          <label for="ev-end" class="text-xs font-medium">Ends (CST date/time) <span class="text-red-500">*</span></label>
          <input id="ev-end" v-model="endsAt" type="datetime-local"
                 class="border rounded-md px-2 py-1.5 text-sm" required />
        </div>

        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="ev-minreveal" class="text-xs font-medium">Minimum Reveal Date (optional)</label>
          <input id="ev-minreveal" v-model="minRevealAt" type="datetime-local"
                 class="border rounded-md px-2 py-1.5 text-sm" />
          <p class="text-[10px] text-gray-500">Holiday Items cannot reveal into pool results before this time. CST date/time.</p>
        </div>
      </section>

      <!-- 2) HOLIDAY ITEMS -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold">Holiday Items</h2>
          <span class="text-[11px] text-gray-600">Selected: {{ itemIds.length }}</span>
        </div>

        <!-- Search + dropdown -->
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

        <!-- Selected list -->
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
        <p v-else class="text-[11px] text-gray-500">No Holiday Items yet.</p>
      </section>

      <!-- 3) HOLIDAY POOL -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold">Holiday Pool</h2>
          <div class="flex items-center gap-2">
            <span class="text-[11px]">Total: <strong :class="poolTotal === 100 ? 'text-green-700' : 'text-red-700'">{{ poolTotal }}</strong>%</span>
            <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50"
                    @click="splitEvenly" :disabled="!poolIds.length">
              Split evenly
            </button>
          </div>
        </div>

        <!-- Set-to-pool controls -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
          <div class="relative w-full sm:max-w-xs cto-autocomplete">
            <input
              ref="setSearchInput"
              v-model="setSearch"
              type="text"
              placeholder="Type Set name…"
              class="w-full border rounded-md px-2 py-1.5 text-sm"
              @focus="setsOpen = true"
              @keydown.down.prevent="setsHighlightNext"
              @keydown.up.prevent="setsHighlightPrev"
              @keydown.enter.prevent="setsChooseHighlighted"
            />
            <ul
              v-if="setsOpen && setSuggestions.length"
              class="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y"
            >
              <li
                v-for="(s, idx) in setSuggestions"
                :key="s"
                @mousedown.prevent="chooseSet(s)"
                :class="['px-2 py-1.5 cursor-pointer truncate', idx === setsHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50']"
              >
                {{ s }}
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50"
            @click="addSetToPool"
            :disabled="!canAddSet"
            :title="!canAddSet ? 'Pick a Set (3+ chars)' : 'Add all cToons from Set to Holiday Pool'"
          >
            Add Set to Pool
          </button>
          <p class="text-[10px] text-gray-500">Adds only cToons with remaining supply.</p>
        </div>

        <!-- Search + dropdown -->
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

        <!-- Selected pool with weights -->
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
              <input v-model.number="poolWeights[id]" type="number" min="0" max="100"
                     class="w-16 border rounded px-1 py-0.5 text-xs"
                     :title="'Chance for ' + (lookup[id]?.name || '') + ' (%)'" />
              <span class="text-[10px] text-gray-500">%</span>
            </div>
            <button type="button" @click="togglePool(lookup[id])" class="text-red-700 hover:underline text-[11px] focus-visible:outline-red-700">
              Remove
            </button>
          </div>
        </div>
        <p v-else class="text-[11px] text-gray-500">No pool entries yet.</p>
      </section>

      <!-- 4) SUBMIT -->
      <div>
        <button
          type="submit"
          :disabled="!formValid"
          :title="!formValid ? invalidTooltip : ''"
          class="px-3 py-1.5 text-xs font-semibold rounded-md text-white disabled:cursor-not-allowed disabled:bg-gray-400 bg-blue-600 hover:bg-blue-700"
        >
          Create Holiday Event
        </button>
      </div>
    </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from '#app'

const router = useRouter()

// ---- TZ helpers: interpret inputs as America/Chicago (DST-aware) ----
function chicagoDstStartDay(year){ const m=2, first=new Date(Date.UTC(year,m,1)).getUTCDay(); return 1+((7-first)%7)+7 }
function chicagoDstEndDay(year){ const m=10, first=new Date(Date.UTC(year,m,1)).getUTCDay(); return 1+((7-first)%7) }
function isChicagoDST(y,M,d,hh=0,mm=0){
  const sD=chicagoDstStartDay(y), eD=chicagoDstEndDay(y)
  const k=(mo,da,h,mi)=> (mo*1e6)+(da*1e4)+(h*100)+mi
  return k(M,d,hh,mm) >= k(3,sD,2,0) && k(M,d,hh,mm) < k(11,eD,2,0)
}
function chicagoLocalToIso(localStr){
  if (!localStr) return null
  const [YMD,HM]=localStr.split('T'); const [y,M,d]=YMD.split('-').map(n=>+n); const [hh,mm]=HM.split(':').map(n=>+n)
  const offset = isChicagoDST(y,M,d,hh,mm) ? 5 : 6
  return new Date(Date.UTC(y,M-1,d,hh+offset,mm)).toISOString()
}
function chicagoLocalToUtcMs(localStr){ const iso=chicagoLocalToIso(localStr); return iso ? Date.parse(iso) : NaN }

// Basic fields
const name        = ref('')
const startsAt    = ref('')
const endsAt      = ref('')
const minRevealAt = ref('')

// Data
const ctoons   = ref([])
const lookup   = ref({})
const loading  = ref(false)

// Sets
const sets            = ref([])          // list of set names
const setSearch       = ref('')
const setSearchInput  = ref(null)
const setsOpen        = ref(false)
const setsHighlighted = ref(-1)
const canonicalSet = computed(() => {
  const q = setSearch.value.trim().toLowerCase()
  if (q.length < 3) return ''            // gate until 3+ chars
  return sets.value.find(s => (s || '').toLowerCase() === q) || ''
})
const setSuggestions = computed(() => {
  const q = setSearch.value.trim().toLowerCase()
  if (q.length < 3) return []
  return sets.value
    .filter(s => s && s.toLowerCase().includes(q))
    .slice(0, 50)
})
const canAddSet = computed(() => canonicalSet.value.length > 0)

// Load cToons + Sets
onMounted(async () => {
  try {
    loading.value = true
    const [pool, setList] = await Promise.all([
      $fetch('/api/admin/ctoon-pool', { credentials: 'include' }),
      $fetch('/api/admin/sets', { credentials: 'include' })
    ])
    ctoons.value = pool || []
    lookup.value = Object.fromEntries(ctoons.value.map(c => [c.id, c]))
    sets.value = (setList || []).filter(Boolean).sort((a,b)=>a.localeCompare(b))
  } catch (e) {
    console.error('Failed to load data', e)
    alert('Failed to load cToons/Sets')
  } finally {
    loading.value = false
  }
})

// Choose a set from suggestions
function chooseSet(s){
  setSearch.value = s
  setsHighlighted.value = -1
  setsOpen.value = true
  nextTick(()=> setSearchInput.value?.focus())
}
function setsHighlightNext(){ if (!setSuggestions.value.length) return; setsHighlighted.value = (setsHighlighted.value+1)%setSuggestions.value.length }
function setsHighlightPrev(){ if (!setSuggestions.value.length) return; setsHighlighted.value = (setsHighlighted.value-1+setSuggestions.value.length)%setSuggestions.value.length }
function setsChooseHighlighted(){ if (setsHighlighted.value>=0) chooseSet(setSuggestions.value[setsHighlighted.value]) }

// Add all cToons from chosen set into Holiday Pool
function addSetToPool(){
  const setName = canonicalSet.value
  if (!setName) return
  const ids = ctoons.value
    .filter(c => (c.set || '').toLowerCase() === setName.toLowerCase())
    .map(c => c.id)

  let added = 0
  for (const id of ids) {
    if (!poolIds.value.includes(id)) {
      poolIds.value.push(id)
      if (poolWeights.value[id] == null) poolWeights.value[id] = 0
      added++
    }
  }
  // Keep focus on set search. Keep suggestions visible.
  nextTick(()=> setSearchInput.value?.focus())
  setsOpen.value = setSearch.value.trim().length >= 3
  if (!added) return
}

// ---- Holiday Items selection ----
const itemIds           = ref([])
const itemSearch        = ref('')
const itemSearchInput   = ref(null)
const itemsOpen         = ref(false)
const itemsHighlighted  = ref(-1)
const itemSuggestions = computed(() => {
  const term = itemSearch.value.toLowerCase().trim()
  if (term.length < 3) return []
  let list = ctoons.value.filter(c => !itemIds.value.includes(c.id))
  list = list.filter(c => c.name.toLowerCase().includes(term))
  return list.slice(0, 50)
})
function toggleItem(c) {
  const id = c.id
  const idx = itemIds.value.indexOf(id)
  if (idx === -1) itemIds.value.push(id)
  else itemIds.value.splice(idx, 1)
  itemsHighlighted.value = -1
  itemsOpen.value = itemSearch.value.trim().length >= 3
  nextTick(() => itemSearchInput.value?.focus())
}
function itemsHighlightNext(){ if (!itemSuggestions.value.length) return; itemsHighlighted.value = (itemsHighlighted.value+1)%itemSuggestions.value.length }
function itemsHighlightPrev(){ if (!itemSuggestions.value.length) return; itemsHighlighted.value = (itemsHighlighted.value-1+itemSuggestions.value.length)%itemSuggestions.value.length }
function itemsChooseHighlighted(){ if (itemsHighlighted.value>=0) toggleItem(itemSuggestions.value[itemsHighlighted.value]) }

// ---- Holiday Pool selection + weights ----
const poolIds          = ref([])
const poolWeights      = ref({})   // id -> %
const poolSearch       = ref('')
const poolSearchInput  = ref(null)
const poolOpen         = ref(false)
const poolHighlighted  = ref(-1)
const poolSuggestions = computed(() => {
  const term = poolSearch.value.toLowerCase().trim()
  if (term.length < 3) return []
  let list = ctoons.value.filter(c => !poolIds.value.includes(c.id))
  list = list.filter(c => c.name.toLowerCase().includes(term))
  return list.slice(0, 50)
})
function togglePool(c) {
  const id = c.id
  const idx = poolIds.value.indexOf(id)
  if (idx === -1) {
    poolIds.value.push(id)
    poolWeights.value[id] = poolWeights.value[id] ?? 0
  } else {
    poolIds.value.splice(idx, 1)
    delete poolWeights.value[id]
  }
  poolHighlighted.value = -1
  poolOpen.value = poolSearch.value.trim().length >= 3
  nextTick(() => poolSearchInput.value?.focus())
}
function poolHighlightNext(){ if (!poolSuggestions.value.length) return; poolHighlighted.value = (poolHighlighted.value+1)%poolSuggestions.value.length }
function poolHighlightPrev(){ if (!poolSuggestions.value.length) return; poolHighlighted.value = (poolHighlighted.value-1+poolSuggestions.value.length)%poolSuggestions.value.length }
function poolChooseHighlighted(){ if (poolHighlighted.value>=0) togglePool(poolSuggestions.value[poolHighlighted.value]) }
function splitEvenly() {
  const n = poolIds.value.length
  if (!n) return
  const base = Math.floor(100 / n)
  let rem = 100 - base * n
  for (const id of poolIds.value) {
    poolWeights.value[id] = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
  }
}
const poolTotal = computed(() =>
  poolIds.value.reduce((sum, id) => sum + Number(poolWeights.value[id] || 0), 0)
)

// ---- Validation (Chicago interpretation) ----
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
const poolValid = computed(() => poolIds.value.length > 0 && poolTotal.value === 100)
const nameValid = computed(() => name.value.length > 0)
const formValid = computed(() => nameValid.value && datesValid.value && poolValid.value)

const invalidTooltip = computed(() => {
  if (!nameValid.value) return 'Name required'
  if (!datesValid.value) return 'Fix start/end or minimum reveal date'
  if (!poolValid.value) return 'Pool must have entries totaling 100%'
  return ''
})

// Close dropdowns on outside click
function handleOutsideClick(e) {
  if (!e.target.closest('.cto-autocomplete')) {
    itemsOpen.value = false
    poolOpen.value = false
    setsOpen.value = false
  }
}
if (process.client) window.addEventListener('click', handleOutsideClick)
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', handleOutsideClick)
})

/* ---------- Submit (send UTC ISO derived from Chicago time) ---------- */
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
    await $fetch('/api/admin/holiday-events', {
      method: 'POST',
      body: payload,
      credentials: 'include'
    })
    router.push('/newsite/admin/holidayEvents')
  } catch (err) {
    console.error(err)
    alert('Failed to create holiday event')
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
