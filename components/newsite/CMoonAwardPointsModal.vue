<!-- components/newsite/CMoonAwardPointsModal.vue
     Admin tool: awards (or, with a negative number, deducts) cMoon points to exactly one
     target — a single player, or a single cMoon's team total with no player attached — unlike
     every other cMoon point source, which is either fully automated gameplay or a blanket grant
     to every member at once ("Backfill cMoon Points"). See award-points.post.js's own header
     comment for why a team-only grant never touches any individual member's rank. A single
     instantaneous write, not a queue job — no progress bar needed, unlike the backfill/recalc
     modals this mirrors structurally.
-->
<template>
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!submitting && $emit('close')"></div>
    <div class="cam relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Award cMoon Points</h3>
        <button
          class="cam-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          @click="$emit('close')"
        >✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <p class="text-[11px] text-gray-600">
          Gives (or, with a negative number, takes back) a one-off amount of cMoon points to a
          single player or a single team, logged the same way any other award is. A player-targeted
          grant counts toward both their own rank progress and their team's score; a team-targeted
          grant only ever moves the team's total — it never changes any individual member's rank.
        </p>

        <div class="flex gap-2">
          <button
            type="button"
            class="cam-tap flex-1 px-3 border rounded-md text-xs font-semibold"
            :class="targetType === 'user' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
            @click="targetType = 'user'"
          >Player</button>
          <button
            type="button"
            class="cam-tap flex-1 px-3 border rounded-md text-xs font-semibold"
            :class="targetType === 'team' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
            @click="targetType = 'team'"
          >Team</button>
        </div>

        <div v-if="targetType === 'user'" class="relative">
          <label class="block text-xs font-medium mb-1">Player</label>
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Type a username…"
            class="cam-field w-full border rounded px-2 py-1.5"
            style="font-size:16px"
            @focus="showDropdown = true"
            @input="onSearchInput"
          />
          <ul
            v-if="showDropdown && searchResults.length"
            class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
          >
            <li
              v-for="u in searchResults"
              :key="u.id"
              class="px-3 py-2 cursor-pointer hover:bg-indigo-50 text-xs"
              :class="{ 'opacity-50': !u.cMoonId }"
              @mousedown.prevent="selectUser(u)"
            >
              <span class="font-medium">{{ u.username }}</span>
              <span class="text-gray-500"> — {{ u.cMoonId ? u.cMoonName : 'no cMoon' }}</span>
            </li>
          </ul>
          <p v-if="searching" class="text-[11px] text-gray-500 mt-1">Searching…</p>
          <div v-if="selectedUser" class="mt-2 text-[11px] bg-gray-50 border rounded p-2">
            <span class="font-medium">{{ selectedUser.username }}</span>
            <span v-if="selectedUser.cMoonId" class="text-gray-600"> — {{ selectedUser.cMoonName }}</span>
            <span v-else class="text-red-600"> — not currently in a cMoon, can't be awarded points</span>
          </div>
        </div>

        <div v-else>
          <label class="block text-xs font-medium mb-1">Team</label>
          <select v-model="selectedCMoonId" class="cam-field w-full border rounded px-2 py-1.5" style="font-size:16px">
            <option value="" disabled>Choose a cMoon…</option>
            <option v-for="c in allCMoons" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Points</label>
          <input
            v-model.number="points" type="number" step="1" inputmode="numeric"
            placeholder="e.g. 250, or -250 to deduct"
            class="cam-field w-full sm:w-48 border rounded px-2 py-1.5" style="font-size:16px"
          />
          <p class="text-[11px] text-gray-500 mt-1">A negative number deducts instead of awards.</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Reason <span class="text-gray-400 font-normal">(optional, shown in the points log)</span></label>
          <input
            v-model="reason" type="text" maxlength="300"
            class="cam-field w-full border rounded px-2 py-1.5" style="font-size:16px"
          />
        </div>

        <div v-if="error" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{{ error }}</div>
        <div v-if="result" class="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
          {{ result.points > 0 ? 'Awarded' : 'Deducted' }} {{ Math.abs(result.points) }} point{{ Math.abs(result.points) === 1 ? '' : 's' }}
          {{ result.points > 0 ? 'to' : 'from' }} {{ result.targetLabel }}.
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <button type="button" class="cam-tap px-3 border rounded" @click="$emit('close')">Close</button>
        <button
          type="button"
          class="cam-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
          :disabled="!canSubmit || submitting"
          @click="submit"
        >{{ submitting ? 'Submitting…' : 'Submit' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  allCMoons: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'done'])

const targetType = ref('user')

const searchTerm = ref('')
const searchResults = ref([])
const searching = ref(false)
const showDropdown = ref(false)
const selectedUser = ref(null)
let searchTimer = null

const selectedCMoonId = ref('')

const points = ref(null)
const reason = ref('')

const submitting = ref(false)
const error = ref('')
const result = ref(null)

function onSearchInput() {
  selectedUser.value = null
  showDropdown.value = true
  if (searchTimer) clearTimeout(searchTimer)
  const q = searchTerm.value.trim()
  if (q.length < 3) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const res = await $fetch('/api/admin/users/search', { params: { q } })
      searchResults.value = res?.users || []
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 250)
}

function selectUser(u) {
  selectedUser.value = u
  searchTerm.value = u.username
  searchResults.value = []
  showDropdown.value = false
}

const canSubmit = computed(() => {
  if (!Number.isInteger(points.value) || points.value === 0) return false
  if (targetType.value === 'user') return !!selectedUser.value?.cMoonId
  return !!selectedCMoonId.value
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  result.value = null
  try {
    const body = {
      targetType: targetType.value,
      points: points.value,
      reason: reason.value.trim() || undefined,
      ...(targetType.value === 'user' ? { userId: selectedUser.value.id } : { cMoonId: selectedCMoonId.value }),
    }
    const res = await $fetch('/api/admin/cmoons/award-points', { method: 'POST', body })
    result.value = res
    points.value = null
    reason.value = ''
    emit('done')
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to award points'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
/* Same "opt out of the newsite dark body" fix the other cMoon admin modals use. */
.cam {
  color: #111;
  color-scheme: light;
}

@media (min-width: 640px) {
  .cam {
    height: auto !important;
    max-height: 92vh;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  }
}

.cam-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
