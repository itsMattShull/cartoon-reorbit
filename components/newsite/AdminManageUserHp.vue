<template>
  <div class="admin-manage-user-hp bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-6 max-w-2xl">

      <!-- ══ HP ══════════════════════════════════════════════════════════════════════════════ -->
      <div class="space-y-4">
      <h2 class="text-base font-bold text-gray-900">HP</h2>
      <p class="text-[11px] text-gray-500">
        cMoon battle HP is never stored as a flat number — it's always a player's rank bonus plus
        this adjustment. Setting HP here still lets a player gain more HP later by ranking up.
      </p>

      <!-- Individual player -->
      <section class="bg-white border rounded-md p-3 space-y-3">
        <h3 class="text-sm font-semibold text-gray-800">Individual Player</h3>

        <div class="relative">
          <input
            v-model="query"
            type="text"
            autocomplete="off"
            placeholder="Type 3+ characters of a username…"
            class="w-full border rounded-md px-2 py-1 text-xs"
            @focus="dropdownOpen = true"
          />
          <div
            v-if="dropdownOpen && (results.length || searching)"
            class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border rounded-md shadow-lg"
          >
            <div v-if="searching" class="px-2 py-1.5 text-[11px] text-gray-400">Searching…</div>
            <button
              v-for="u in results"
              :key="u.id"
              type="button"
              class="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 border-b last:border-b-0"
              @click="pickUser(u)"
            >
              <span class="font-medium">{{ u.username }}</span>
              <span v-if="u.banned" class="ml-1 text-red-500">(banned)</span>
            </button>
          </div>
        </div>

        <div v-if="detailLoading" class="text-[11px] text-gray-400">Loading…</div>

        <div v-else-if="detail" class="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
          <div class="font-medium text-gray-800">{{ detail.username }}</div>
          <div class="text-[11px] text-gray-600">Rank: {{ detail.rankName || '(none)' }}</div>
          <div class="text-[11px] text-gray-600">Natural HP (no adjustment): {{ detail.naturalHp }}</div>
          <div class="text-[11px] text-gray-600">Current adjustment: {{ detail.adjustment >= 0 ? '+' : '' }}{{ detail.adjustment }}</div>
          <div class="text-xs font-semibold text-blue-800">Effective HP: {{ detail.effectiveHp }}</div>

          <div class="flex items-center gap-2 pt-1">
            <label class="text-[11px] text-gray-600">Set HP to</label>
            <input
              v-model.number="targetHp"
              type="number"
              min="1"
              max="10000"
              step="1"
              class="w-24 border rounded-md px-2 py-1 text-xs"
            />
            <button
              type="button"
              :disabled="!canSetHp || setting"
              :class="canSetHp && !setting ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'"
              class="px-3 py-1 rounded-md text-xs font-medium"
              @click="submitSetHp"
            >{{ setting ? 'Setting…' : 'Set HP' }}</button>
          </div>
          <p v-if="setError" class="text-[11px] text-red-600">{{ setError }}</p>
          <p v-if="setSuccess" class="text-[11px] text-emerald-600">{{ setSuccess }}</p>
        </div>
      </section>

      <!-- Mass adjust -->
      <section class="bg-white border rounded-md p-3 space-y-3">
        <h3 class="text-sm font-semibold text-gray-800">Mass Adjust (Every Player)</h3>
        <p class="text-[11px] text-amber-700">⚠ This changes HP for every player in the game.</p>

        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1 text-[11px] text-gray-700">
            <input type="radio" value="delta" v-model="massMode" /> Raise/lower BY
          </label>
          <label class="flex items-center gap-1 text-[11px] text-gray-700">
            <input type="radio" value="absolute" v-model="massMode" /> Set everyone TO
          </label>
        </div>

        <div class="flex items-center gap-2">
          <input
            v-model.number="massValue"
            type="number"
            :min="massMode === 'delta' ? -10000 : 1"
            max="10000"
            step="1"
            :placeholder="massMode === 'delta' ? 'e.g. -5 or 10' : 'e.g. 20'"
            class="w-32 border rounded-md px-2 py-1 text-xs"
          />
          <button
            type="button"
            :disabled="!canMassAdjust || massPhase === 'working'"
            :class="canMassAdjust && massPhase !== 'working' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'"
            class="px-3 py-1 rounded-md text-xs font-medium"
            @click="startMassAdjust"
          >Apply to Everyone</button>
        </div>

        <div v-if="massPhase === 'confirm'" class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
          <p class="text-[11px] text-amber-800">
            {{ massMode === 'delta'
              ? `This will ${massValue > 0 ? 'raise' : 'lower'} every player's HP adjustment by ${Math.abs(massValue)}.`
              : `This will set every player's effective HP to exactly ${massValue}.` }}
            Are you sure?
          </p>
          <div class="flex gap-2">
            <button type="button" class="px-3 py-1 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white" @click="confirmMassAdjust">Yes, apply</button>
            <button type="button" class="px-3 py-1 rounded-md text-xs font-medium bg-gray-200 hover:bg-gray-300" @click="massPhase = 'idle'">Cancel</button>
          </div>
        </div>
        <p v-else-if="massPhase === 'working'" class="text-[11px] text-gray-400">Applying…</p>
        <p v-if="massError" class="text-[11px] text-red-600">{{ massError }}</p>
        <p v-if="massSuccess" class="text-[11px] text-emerald-600">{{ massSuccess }}</p>
      </section>
      </div>

      <!-- ══ Stamina ═════════════════════════════════════════════════════════════════════════ -->
      <div class="space-y-4 pt-2 border-t">
      <h2 class="text-base font-bold text-gray-900">Stamina</h2>
      <p class="text-[11px] text-gray-500">
        cMoon battle stamina has no rank bonus — a player's natural stamina is just the site-wide
        starting value (Global Settings), plus this adjustment.
      </p>

      <!-- Individual player -->
      <section class="bg-white border rounded-md p-3 space-y-3">
        <h3 class="text-sm font-semibold text-gray-800">Individual Player</h3>

        <div class="relative">
          <input
            v-model="stamQuery"
            type="text"
            autocomplete="off"
            placeholder="Type 3+ characters of a username…"
            class="w-full border rounded-md px-2 py-1 text-xs"
            @focus="stamDropdownOpen = true"
          />
          <div
            v-if="stamDropdownOpen && (stamResults.length || stamSearching)"
            class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border rounded-md shadow-lg"
          >
            <div v-if="stamSearching" class="px-2 py-1.5 text-[11px] text-gray-400">Searching…</div>
            <button
              v-for="u in stamResults"
              :key="u.id"
              type="button"
              class="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 border-b last:border-b-0"
              @click="pickStaminaUser(u)"
            >
              <span class="font-medium">{{ u.username }}</span>
              <span v-if="u.banned" class="ml-1 text-red-500">(banned)</span>
            </button>
          </div>
        </div>

        <div v-if="stamDetailLoading" class="text-[11px] text-gray-400">Loading…</div>

        <div v-else-if="stamDetail" class="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
          <div class="font-medium text-gray-800">{{ stamDetail.username }}</div>
          <div class="text-[11px] text-gray-600">Natural stamina (no adjustment): {{ stamDetail.naturalStamina }}</div>
          <div class="text-[11px] text-gray-600">Current adjustment: {{ stamDetail.adjustment >= 0 ? '+' : '' }}{{ stamDetail.adjustment }}</div>
          <div class="text-xs font-semibold text-blue-800">Effective stamina: {{ stamDetail.effectiveStamina }}</div>

          <div class="flex items-center gap-2 pt-1">
            <label class="text-[11px] text-gray-600">Set stamina to</label>
            <input
              v-model.number="targetStamina"
              type="number"
              min="0"
              max="50"
              step="1"
              class="w-24 border rounded-md px-2 py-1 text-xs"
            />
            <button
              type="button"
              :disabled="!canSetStamina || stamSetting"
              :class="canSetStamina && !stamSetting ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'"
              class="px-3 py-1 rounded-md text-xs font-medium"
              @click="submitSetStamina"
            >{{ stamSetting ? 'Setting…' : 'Set Stamina' }}</button>
          </div>
          <p v-if="stamSetError" class="text-[11px] text-red-600">{{ stamSetError }}</p>
          <p v-if="stamSetSuccess" class="text-[11px] text-emerald-600">{{ stamSetSuccess }}</p>
        </div>
      </section>

      <!-- Mass adjust -->
      <section class="bg-white border rounded-md p-3 space-y-3">
        <h3 class="text-sm font-semibold text-gray-800">Mass Adjust (Every Player)</h3>
        <p class="text-[11px] text-amber-700">⚠ This changes stamina for every player in the game.</p>

        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1 text-[11px] text-gray-700">
            <input type="radio" value="delta" v-model="stamMassMode" /> Raise/lower BY
          </label>
          <label class="flex items-center gap-1 text-[11px] text-gray-700">
            <input type="radio" value="absolute" v-model="stamMassMode" /> Set everyone TO
          </label>
        </div>

        <div class="flex items-center gap-2">
          <input
            v-model.number="stamMassValue"
            type="number"
            :min="stamMassMode === 'delta' ? -50 : 0"
            max="50"
            step="1"
            :placeholder="stamMassMode === 'delta' ? 'e.g. -2 or 5' : 'e.g. 3'"
            class="w-32 border rounded-md px-2 py-1 text-xs"
          />
          <button
            type="button"
            :disabled="!canMassAdjustStamina || stamMassPhase === 'working'"
            :class="canMassAdjustStamina && stamMassPhase !== 'working' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'"
            class="px-3 py-1 rounded-md text-xs font-medium"
            @click="startMassAdjustStamina"
          >Apply to Everyone</button>
        </div>

        <div v-if="stamMassPhase === 'confirm'" class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
          <p class="text-[11px] text-amber-800">
            {{ stamMassMode === 'delta'
              ? `This will ${stamMassValue > 0 ? 'raise' : 'lower'} every player's stamina adjustment by ${Math.abs(stamMassValue)}.`
              : `This will set every player's effective stamina to exactly ${stamMassValue}.` }}
            Are you sure?
          </p>
          <div class="flex gap-2">
            <button type="button" class="px-3 py-1 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white" @click="confirmMassAdjustStamina">Yes, apply</button>
            <button type="button" class="px-3 py-1 rounded-md text-xs font-medium bg-gray-200 hover:bg-gray-300" @click="stamMassPhase = 'idle'">Cancel</button>
          </div>
        </div>
        <p v-else-if="stamMassPhase === 'working'" class="text-[11px] text-gray-400">Applying…</p>
        <p v-if="stamMassError" class="text-[11px] text-red-600">{{ stamMassError }}</p>
        <p v-if="stamMassSuccess" class="text-[11px] text-emerald-600">{{ stamMassSuccess }}</p>
      </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// ── Individual player search (mirrors AdminTransferModal.vue's debounced/abortable pattern) ──
const query = ref('')
const results = ref([])
const searching = ref(false)
const dropdownOpen = ref(false)

let searchTimer = null
let searchAbort = null
let searchToken = 0
// Set true by pickUser() right before it programmatically sets query.value to the picked
// username — skips the ONE resulting watch(query) tick so picking a result doesn't immediately
// re-search for (and silently repopulate a closed dropdown with) the user just picked.
let suppressNextQuerySearch = false

watch(query, (q) => {
  if (suppressNextQuerySearch) {
    suppressNextQuerySearch = false
    return
  }
  const trimmed = q.trim()
  if (searchTimer) clearTimeout(searchTimer)
  if (trimmed.length < 3) {
    results.value = []
    searching.value = false
    if (searchAbort) searchAbort.abort()
    return
  }
  searching.value = true
  searchTimer = setTimeout(() => runSearch(trimmed), 250)
})

async function runSearch(q) {
  if (searchAbort) searchAbort.abort()
  const abort = new AbortController()
  searchAbort = abort
  const token = ++searchToken
  try {
    const res = await $fetch('/api/admin/users/search', { params: { q }, signal: abort.signal })
    if (token !== searchToken) return
    results.value = res?.users || []
  } catch (e) {
    if (token !== searchToken) return
    results.value = []
  } finally {
    if (token === searchToken) searching.value = false
  }
}

// ── Individual player HP detail + set ──────────────────────────────────────────────────────
const detail = ref(null)
const detailLoading = ref(false)
const targetHp = ref(null)
const setting = ref(false)
const setError = ref('')
const setSuccess = ref('')
// Guards both pickUser's own GET and submitSetHp's POST against a stale response landing after a
// newer one — mirrors runSearch's own searchToken pattern above. Without this, picking user A
// then quickly picking user B (A's slower GET still in flight) could let A's response overwrite
// B's already-displayed detail; the same gap let a slow "Set HP" call for A splice its result
// into whatever user is on screen by the time it resolves, even after switching to B.
let detailToken = 0

async function pickUser(u) {
  dropdownOpen.value = false
  results.value = []
  suppressNextQuerySearch = true
  query.value = u.username
  setError.value = ''
  setSuccess.value = ''
  detail.value = null
  detailLoading.value = true
  const token = ++detailToken
  try {
    const res = await $fetch(`/api/admin/users/${u.id}/hp`)
    if (token === detailToken) {
      detail.value = res
      targetHp.value = res?.effectiveHp ?? null
    }
  } catch (e) {
    if (token === detailToken) setError.value = e?.data?.statusMessage || 'Failed to load HP detail'
  } finally {
    // Conditional, unlike submitSetHp's own `setting` reset below: picking a user isn't blocked
    // while a previous pick's fetch is still loading (no disabled state on the search box), so an
    // older call's finally CAN fire after a newer one has already started — only the newer call's
    // own completion should clear the spinner.
    if (token === detailToken) detailLoading.value = false
  }
}

const canSetHp = computed(() => !!detail.value && Number.isInteger(targetHp.value) && targetHp.value >= 1 && targetHp.value <= 10000)

async function submitSetHp() {
  if (!canSetHp.value) return
  setting.value = true
  setError.value = ''
  setSuccess.value = ''
  const token = detailToken
  const userId = detail.value.id
  try {
    const res = await $fetch(`/api/admin/users/${userId}/hp`, {
      method: 'POST',
      body: { targetHp: targetHp.value },
    })
    if (token !== detailToken) return
    detail.value = { ...detail.value, adjustment: res.adjustment, effectiveHp: res.effectiveHp }
    setSuccess.value = `Effective HP set to ${res.effectiveHp}.`
  } catch (e) {
    if (token !== detailToken) return
    setError.value = e?.data?.statusMessage || 'Failed to set HP'
  } finally {
    // Unconditional, unlike pickUser's own detailLoading reset above: the "Set HP" button is
    // disabled while `setting` is true, so only one submitSetHp call is ever in flight at once —
    // no newer call exists whose own busy state this could incorrectly clear.
    setting.value = false
  }
}

// ── Mass adjust ─────────────────────────────────────────────────────────────────────────────
const massMode = ref('delta')
const massValue = ref(null)
const massPhase = ref('idle') // idle | confirm | working
const massError = ref('')
const massSuccess = ref('')

const canMassAdjust = computed(() => {
  if (!Number.isInteger(massValue.value)) return false
  if (massMode.value === 'delta') return massValue.value !== 0 && massValue.value >= -10000 && massValue.value <= 10000
  return massValue.value >= 1 && massValue.value <= 10000
})

function startMassAdjust() {
  if (!canMassAdjust.value) return
  massError.value = ''
  massSuccess.value = ''
  massPhase.value = 'confirm'
}

async function confirmMassAdjust() {
  massPhase.value = 'working'
  massError.value = ''
  try {
    const res = await $fetch('/api/admin/users/hp-mass-adjust', {
      method: 'POST',
      body: { mode: massMode.value, value: massValue.value },
    })
    massSuccess.value = `Updated ${res.changed} player${res.changed === 1 ? '' : 's'}.`
  } catch (e) {
    massError.value = e?.data?.statusMessage || 'Failed to apply mass adjustment'
  } finally {
    massPhase.value = 'idle'
  }
}

// ── Stamina: same controls, same design as HP above — independent search/detail/mass-adjust
// state (its own query/results/dropdown/token variables) so picking a user for one stat never
// interferes with the other. ───────────────────────────────────────────────────────────────────
const stamQuery = ref('')
const stamResults = ref([])
const stamSearching = ref(false)
const stamDropdownOpen = ref(false)

let stamSearchTimer = null
let stamSearchAbort = null
let stamSearchToken = 0
let stamSuppressNextQuerySearch = false

watch(stamQuery, (q) => {
  if (stamSuppressNextQuerySearch) {
    stamSuppressNextQuerySearch = false
    return
  }
  const trimmed = q.trim()
  if (stamSearchTimer) clearTimeout(stamSearchTimer)
  if (trimmed.length < 3) {
    stamResults.value = []
    stamSearching.value = false
    if (stamSearchAbort) stamSearchAbort.abort()
    return
  }
  stamSearching.value = true
  stamSearchTimer = setTimeout(() => runStaminaSearch(trimmed), 250)
})

async function runStaminaSearch(q) {
  if (stamSearchAbort) stamSearchAbort.abort()
  const abort = new AbortController()
  stamSearchAbort = abort
  const token = ++stamSearchToken
  try {
    const res = await $fetch('/api/admin/users/search', { params: { q }, signal: abort.signal })
    if (token !== stamSearchToken) return
    stamResults.value = res?.users || []
  } catch (e) {
    if (token !== stamSearchToken) return
    stamResults.value = []
  } finally {
    if (token === stamSearchToken) stamSearching.value = false
  }
}

const stamDetail = ref(null)
const stamDetailLoading = ref(false)
const targetStamina = ref(null)
const stamSetting = ref(false)
const stamSetError = ref('')
const stamSetSuccess = ref('')
let stamDetailToken = 0

async function pickStaminaUser(u) {
  stamDropdownOpen.value = false
  stamResults.value = []
  stamSuppressNextQuerySearch = true
  stamQuery.value = u.username
  stamSetError.value = ''
  stamSetSuccess.value = ''
  stamDetail.value = null
  stamDetailLoading.value = true
  const token = ++stamDetailToken
  try {
    const res = await $fetch(`/api/admin/users/${u.id}/stamina`)
    if (token === stamDetailToken) {
      stamDetail.value = res
      targetStamina.value = res?.effectiveStamina ?? null
    }
  } catch (e) {
    if (token === stamDetailToken) stamSetError.value = e?.data?.statusMessage || 'Failed to load stamina detail'
  } finally {
    if (token === stamDetailToken) stamDetailLoading.value = false
  }
}

const canSetStamina = computed(() => !!stamDetail.value && Number.isInteger(targetStamina.value) && targetStamina.value >= 0 && targetStamina.value <= 50)

async function submitSetStamina() {
  if (!canSetStamina.value) return
  stamSetting.value = true
  stamSetError.value = ''
  stamSetSuccess.value = ''
  const token = stamDetailToken
  const userId = stamDetail.value.id
  try {
    const res = await $fetch(`/api/admin/users/${userId}/stamina`, {
      method: 'POST',
      body: { targetStamina: targetStamina.value },
    })
    if (token !== stamDetailToken) return
    stamDetail.value = { ...stamDetail.value, adjustment: res.adjustment, effectiveStamina: res.effectiveStamina }
    stamSetSuccess.value = `Effective stamina set to ${res.effectiveStamina}.`
  } catch (e) {
    if (token !== stamDetailToken) return
    stamSetError.value = e?.data?.statusMessage || 'Failed to set stamina'
  } finally {
    stamSetting.value = false
  }
}

// ── Stamina: mass adjust ────────────────────────────────────────────────────────────────────
const stamMassMode = ref('delta')
const stamMassValue = ref(null)
const stamMassPhase = ref('idle') // idle | confirm | working
const stamMassError = ref('')
const stamMassSuccess = ref('')

const canMassAdjustStamina = computed(() => {
  if (!Number.isInteger(stamMassValue.value)) return false
  if (stamMassMode.value === 'delta') return stamMassValue.value !== 0 && stamMassValue.value >= -50 && stamMassValue.value <= 50
  return stamMassValue.value >= 0 && stamMassValue.value <= 50
})

function startMassAdjustStamina() {
  if (!canMassAdjustStamina.value) return
  stamMassError.value = ''
  stamMassSuccess.value = ''
  stamMassPhase.value = 'confirm'
}

async function confirmMassAdjustStamina() {
  stamMassPhase.value = 'working'
  stamMassError.value = ''
  try {
    const res = await $fetch('/api/admin/users/stamina-mass-adjust', {
      method: 'POST',
      body: { mode: stamMassMode.value, value: stamMassValue.value },
    })
    stamMassSuccess.value = `Updated ${res.changed} player${res.changed === 1 ? '' : 's'}.`
  } catch (e) {
    stamMassError.value = e?.data?.statusMessage || 'Failed to apply mass adjustment'
  } finally {
    stamMassPhase.value = 'idle'
  }
}
</script>
