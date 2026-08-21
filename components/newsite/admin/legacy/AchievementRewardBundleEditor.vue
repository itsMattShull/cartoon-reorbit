<template>
  <div class="arb">
    <div class="flex flex-col gap-1">
      <label class="arb-label">Points</label>
      <input v-model.number="bundle.points" type="number" min="0" class="arb-field" />
    </div>

    <div class="flex flex-col gap-1 mt-2">
      <label class="arb-label">Add cToon</label>
      <div class="flex flex-col sm:flex-row gap-2">
        <datalist :id="`arb-ctoon-list-${uid}`">
          <option v-for="c in filteredCtoons(ctoonSearch)" :key="c.id" :value="c.name" />
        </datalist>
        <input
          v-model="ctoonSearch"
          :list="`arb-ctoon-list-${uid}`"
          class="arb-field flex-1 min-w-0"
          placeholder="Type 3+ characters to search"
          autocomplete="off"
        />
        <div class="flex gap-2">
          <input v-model.number="ctoonQty" type="number" min="1" inputmode="numeric" class="arb-field w-20 flex-shrink-0" aria-label="Quantity" />
          <button type="button" class="arb-tap px-4 border rounded-md bg-white" @click="addCtoon">Add</button>
        </div>
      </div>
      <div v-if="bundle.ctoons.length" class="flex flex-wrap gap-2 mt-1">
        <span v-for="(c, i) in bundle.ctoons" :key="c.ctoonId" class="arb-chip">
          {{ nameForCtoon(c.ctoonId) }} × {{ c.quantity }}
          <button type="button" class="arb-chip-remove" @click="bundle.ctoons.splice(i, 1)">×</button>
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-1 mt-2">
      <label class="arb-label">Backgrounds</label>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-auto border rounded-md p-2">
        <button
          v-for="b in backgrounds" :key="b.id"
          type="button"
          class="arb-tap relative focus:outline-none"
          @click="toggleBg(b.id)"
          :title="b.label || 'Background'"
        >
          <img
            :src="b.imagePath" :alt="b.label || 'Background'"
            class="w-full h-14 object-cover rounded border"
            :class="bundle.backgrounds.some(x => x.backgroundId === b.id) ? 'ring-2 ring-blue-600' : ''"
          />
          <div v-if="bundle.backgrounds.some(x => x.backgroundId === b.id)" class="absolute inset-0 bg-blue-500/20 rounded pointer-events-none"></div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// Shared reward-bundle editor: points + multiple cToons (each with a quantity) +
// backgrounds. Used both for an achievement's own auto-grant reward and for each of its up
// to 4 claim options — same editable shape either way (see server/utils/achievementRewardBundle.js).
const props = defineProps({
  modelValue: { type: Object, required: true }, // { points, ctoons: [{ctoonId, quantity}], backgrounds: [{backgroundId}] }
  ctoons: { type: Array, default: () => [] },
  backgrounds: { type: Array, default: () => [] },
})

const bundle = props.modelValue
const uid = Math.random().toString(36).slice(2, 8)
const ctoonSearch = ref('')
const ctoonQty = ref(1)

function filteredCtoons(input) {
  const v = String(input || '').trim().toLowerCase()
  if (v.length < 3) return []
  return props.ctoons.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
}

function nameForCtoon(id) {
  return props.ctoons.find(c => c.id === id)?.name || id
}

function addCtoon() {
  const typed = String(ctoonSearch.value || '').trim()
  const match = props.ctoons.find(c => c.name === typed)
  if (!match) {
    alert('Please select a valid cToon from suggestions (type at least 3 characters).')
    return
  }
  const existing = bundle.ctoons.find(c => c.ctoonId === match.id)
  const qty = Math.max(1, Number(ctoonQty.value || 1))
  if (existing) existing.quantity = qty
  else bundle.ctoons.push({ ctoonId: match.id, quantity: qty })
  ctoonSearch.value = ''
  ctoonQty.value = 1
}

function toggleBg(id) {
  const i = bundle.backgrounds.findIndex(b => b.backgroundId === id)
  if (i >= 0) bundle.backgrounds.splice(i, 1)
  else bundle.backgrounds.push({ backgroundId: id })
}
</script>

<style scoped>
/* Matches the 44px-touch-target / 16px-input mobile convention used across the other admin
   panels (see AdminCMoon.vue) — this file's parent form predates that convention, so this
   component opts in on its own rather than inheriting cramped 10px-label styling. */
.arb-label {
  font-size: 11px;
  font-weight: 500;
}
.arb-field {
  min-height: 44px;
  font-size: 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 8px;
}
.arb-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.arb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 4px 8px;
}
.arb-chip-remove {
  color: #dc2626;
  font-weight: bold;
  min-width: 20px;
}
</style>
