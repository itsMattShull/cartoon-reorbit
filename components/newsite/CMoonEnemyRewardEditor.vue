<template>
  <div class="space-y-2">
    <h4 class="font-semibold text-xs">{{ title }}</h4>
    <div v-if="rows.length" class="space-y-1">
      <div v-for="r in rows" :key="r.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
        <span class="flex-1 min-w-0 break-words">
          {{ rewardLabel(r) }} — {{ r.dropChancePercent }}% chance<span v-if="r.rewardType === 'CTOON' || r.rewardType === 'PACK'"> · x{{ r.quantity }}</span>
        </span>
        <button type="button" class="text-red-600 hover:underline flex-shrink-0" :disabled="deletingId === r.id" @click="removeRow(r)">
          {{ deletingId === r.id ? 'Removing…' : 'Remove' }}
        </button>
      </div>
    </div>
    <p v-else class="text-gray-500">{{ emptyMessage }}</p>

    <p v-if="formError" class="text-red-600">{{ formError }}</p>
    <div class="flex gap-2 flex-wrap items-end">
      <div class="w-32 flex-shrink-0">
        <label class="block text-[11px] font-medium mb-1">Prize type</label>
        <select v-model="form.rewardType" class="w-full border rounded px-2 py-1">
          <option value="CTOON">cToon</option>
          <option value="AVATAR">Avatar</option>
          <option value="BACKGROUND">Background</option>
          <option value="POINTS">Points</option>
          <option value="PACK">Pack</option>
        </select>
      </div>
      <div class="w-24 flex-shrink-0">
        <label class="block text-[11px] font-medium mb-1">Drop % (0-100)</label>
        <input v-model.number="form.dropChancePercent" type="number" min="0" max="100" step="0.1" class="w-full border rounded px-2 py-1" />
      </div>
      <div v-if="form.rewardType === 'CTOON' || form.rewardType === 'PACK'" class="w-20 flex-shrink-0">
        <label class="block text-[11px] font-medium mb-1">Qty (1-20)</label>
        <input v-model.number="form.quantity" type="number" min="1" max="20" class="w-full border rounded px-2 py-1" />
      </div>
      <div v-if="form.rewardType === 'POINTS'" class="w-28 flex-shrink-0">
        <label class="block text-[11px] font-medium mb-1">Points (1-5000)</label>
        <input v-model.number="form.pointsAmount" type="number" min="1" max="5000" class="w-full border rounded px-2 py-1" />
      </div>
    </div>

    <p v-if="form.rewardType === 'POINTS'" class="text-[11px] text-gray-500">
      Plain site points — not tied to any cMoon team.
    </p>

    <div v-if="form.rewardType === 'CTOON'">
      <label class="block text-[11px] font-medium mb-1">cToon</label>
      <input
        v-model="ctoonSearch"
        class="w-full border rounded px-2 py-1"
        :placeholder="form.ctoonId ? ctoonSelectedName : 'Type 3+ characters of a cToon'"
        autocapitalize="none" autocorrect="off" spellcheck="false"
      />
      <div v-if="ctoonSuggestions.length" class="mt-1 border rounded divide-y bg-white max-h-32 overflow-y-auto">
        <button
          v-for="c in ctoonSuggestions" :key="c.id" type="button"
          class="w-full text-left px-2 py-1 text-[11px] hover:bg-gray-100"
          @click="selectCtoon(c)"
        >{{ c.name }}</button>
      </div>
    </div>
    <div v-else-if="form.rewardType === 'AVATAR'">
      <label class="block text-[11px] font-medium mb-1">Avatar</label>
      <select v-model="form.avatarId" class="w-full border rounded px-2 py-1">
        <option value="">Select an avatar…</option>
        <option v-for="av in avatarsCatalog" :key="av.id" :value="av.id">{{ av.label || av.filename }}</option>
      </select>
    </div>
    <div v-else-if="form.rewardType === 'BACKGROUND'">
      <label class="block text-[11px] font-medium mb-1">Background</label>
      <select v-model="form.backgroundId" class="w-full border rounded px-2 py-1">
        <option value="">Select a background…</option>
        <option v-for="bg in backgrounds" :key="bg.id" :value="bg.id">{{ bg.label || bg.filename }}</option>
      </select>
    </div>
    <div v-else-if="form.rewardType === 'PACK'">
      <label class="block text-[11px] font-medium mb-1">Pack</label>
      <select v-model="form.packId" class="w-full border rounded px-2 py-1">
        <option value="">Select a pack…</option>
        <option v-for="p in packsCatalog" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <!-- POINTS needs no catalog picker — its amount is the "Points (1-5000)" input above. -->

    <button
      type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      :disabled="saving" @click="addRow"
    >{{ saving ? 'Adding…' : 'Add prize' }}</button>
  </div>
</template>

<script setup>
// Shared prize-row editor (list + add-one-row form) for a cMoon enemy member's reward table —
// used for BOTH the normal win-reward pool (CMoonEnemyReward) and the "Throw Pokeball"
// capture-only pool (CMoonEnemyCaptureReward), which are otherwise byte-identical column shapes
// (see that model's own schema comment) with completely separate endpoints/rows. Extracted here
// instead of hand-duplicated in AdminCMoonEnemies.vue so the two editors can never visually or
// behaviorally drift apart. Deliberately does its own add/remove HTTP calls (given just the two
// endpoint URLs as props) and emits `changed` so the parent can refresh its own member list the
// same way it always has — this component holds no knowledge of "members" at all.
import { reactive, ref, computed, watch } from 'vue'

const props = defineProps({
  rows: { type: Array, required: true },
  title: { type: String, required: true },
  emptyMessage: { type: String, required: true },
  // POST endpoint that adds one row — body: { rewardType, dropChancePercent, quantity?, ctoonId?/avatarId?/backgroundId?/packId? }.
  addUrl: { type: String, required: true },
  // DELETE endpoint PREFIX for one row — the row's own id is appended, e.g. '/api/admin/cmoon-enemy-rewards'.
  deleteUrlBase: { type: String, required: true },
  ctoonsCatalog: { type: Array, default: () => [] },
  avatarsCatalog: { type: Array, default: () => [] },
  backgrounds: { type: Array, default: () => [] },
  packsCatalog: { type: Array, default: () => [] },
})
const emit = defineEmits(['changed'])

const saving = ref(false)
const formError = ref('')
const deletingId = ref('')
const ctoonSearch = ref('')

const emptyForm = () => ({ rewardType: 'CTOON', ctoonId: '', avatarId: '', backgroundId: '', packId: '', dropChancePercent: 10, quantity: 1, pointsAmount: 100 })
const form = reactive(emptyForm())

function resetForm() {
  formError.value = ''
  ctoonSearch.value = ''
  Object.assign(form, emptyForm())
}

watch(() => form.rewardType, () => {
  form.ctoonId = ''
  form.avatarId = ''
  form.backgroundId = ''
  form.packId = ''
  ctoonSearch.value = ''
})

const ctoonSelectedName = computed(() => props.ctoonsCatalog.find(c => c.id === form.ctoonId)?.name || '')
const ctoonSuggestions = computed(() => {
  const v = ctoonSearch.value.trim().toLowerCase()
  if (v.length < 3) return []
  return props.ctoonsCatalog.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
})
function selectCtoon(c) {
  form.ctoonId = c.id
  ctoonSearch.value = c.name
}

function rewardLabel(r) {
  if (r.rewardType === 'CTOON') return r.ctoon?.name || 'Unknown cToon'
  if (r.rewardType === 'AVATAR') return r.avatar?.label || 'Unknown avatar'
  if (r.rewardType === 'POINTS') return `${r.quantity} points`
  if (r.rewardType === 'PACK') return r.pack?.name || 'Unknown pack'
  return r.background?.label || 'Unknown background'
}

async function addRow() {
  formError.value = ''
  const dropChancePercent = Number(form.dropChancePercent)
  if (!Number.isFinite(dropChancePercent) || dropChancePercent < 0 || dropChancePercent > 100) {
    formError.value = 'Drop chance must be between 0 and 100.'
    return
  }
  const body = { rewardType: form.rewardType, dropChancePercent }
  if (form.rewardType === 'CTOON') {
    if (!form.ctoonId) { formError.value = 'Pick a cToon.'; return }
    body.ctoonId = form.ctoonId
    const quantity = Math.trunc(Number(form.quantity)) || 1
    if (quantity < 1 || quantity > 20) { formError.value = 'Quantity must be between 1 and 20.'; return }
    body.quantity = quantity
  } else if (form.rewardType === 'AVATAR') {
    if (!form.avatarId) { formError.value = 'Pick an avatar.'; return }
    body.avatarId = form.avatarId
  } else if (form.rewardType === 'BACKGROUND') {
    if (!form.backgroundId) { formError.value = 'Pick a background.'; return }
    body.backgroundId = form.backgroundId
  } else if (form.rewardType === 'PACK') {
    if (!form.packId) { formError.value = 'Pick a pack.'; return }
    body.packId = form.packId
    const quantity = Math.trunc(Number(form.quantity)) || 1
    if (quantity < 1 || quantity > 20) { formError.value = 'Quantity must be between 1 and 20.'; return }
    body.quantity = quantity
  } else {
    // POINTS
    const pointsAmount = Math.trunc(Number(form.pointsAmount))
    if (!Number.isInteger(pointsAmount) || pointsAmount < 1 || pointsAmount > 5000) {
      formError.value = 'Points amount must be between 1 and 5000.'
      return
    }
    body.quantity = pointsAmount
  }

  saving.value = true
  try {
    await $fetch(props.addUrl, { method: 'POST', body })
    resetForm()
    emit('changed')
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to add prize'
  } finally {
    saving.value = false
  }
}

async function removeRow(r) {
  if (!confirm('Remove this prize row?')) return
  deletingId.value = r.id
  try {
    await $fetch(`${props.deleteUrlBase}/${r.id}`, { method: 'DELETE' })
    emit('changed')
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to remove prize'
  } finally {
    deletingId.value = ''
  }
}
</script>
