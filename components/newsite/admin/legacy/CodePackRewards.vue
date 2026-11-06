<!-- components/newsite/admin/legacy/CodePackRewards.vue
     The "Pack Rewards" section of the Create / Edit Code forms: which sealed packs a code awards, and how many of each.
     Redeemers get them as sealed packs in My Collection > Packs (and can open them straight from the Redeem page).
     Also used for the pack prizes of an OG gToons tournament (AdminOgGtoonTournaments.vue), which sets `noun`, `title`
     and `hint` (and listens for `summary` to put the packs in its "winners receive …" preview).

       <CodePackRewards ref="el" :initial="[{ packId, quantity }]" />
       const r = el.value.toPayload()   // { ok, packs: [{ packId, quantity }], error }

     Pack names aren't unique, so the datalist value carries the id: "Starter Pack (b3f1…)". -->
<template>
  <div class="flex flex-col gap-1">
    <label class="text-xs font-medium">{{ title }}</label>
    <p class="text-[10px] text-gray-500">
      <template v-if="hint">{{ hint }}</template>
      <template v-else>Sealed packs go into the player's My Collection &rsaquo; Packs, and they can open them right on the Redeem page.</template>
      Up to {{ MAX_PACK_QUANTITY_PER_CODE }} of one pack and {{ MAX_PACKS_PER_CODE }} packs in total per {{ noun }}.
    </p>

    <!-- One id per instance: the tournament form shows several of these at once. -->
    <datalist :id="listId">
      <option v-for="p in options" :key="p.id" :value="label(p)" />
    </datalist>

    <div v-for="(row, idx) in rows" :key="idx" class="flex items-center gap-2">
      <input
        v-model="row.name"
        :list="listId"
        type="text"
        class="flex-1 border rounded-md px-2 py-1.5 text-sm"
        placeholder="Type to search packs"
        :aria-label="`Pack ${idx + 1}`"
      />
      <img v-if="find(row.name)?.imagePath" :src="find(row.name).imagePath" class="w-8 h-8 object-contain rounded border" alt="Pack preview" />
      <input
        v-model.number="row.quantity"
        type="number"
        min="1"
        :max="MAX_PACK_QUANTITY_PER_CODE"
        class="w-16 border rounded px-1 py-1 text-sm"
        :aria-label="`Quantity for pack ${idx + 1}`"
      />
      <button type="button" class="text-red-700 hover:underline text-[11px]" @click="rows.splice(idx, 1)">Remove</button>
    </div>

    <button type="button" class="text-blue-600 hover:underline text-xs text-left" @click="rows.push({ name: '', quantity: 1 })">+ Add pack</button>
    <p v-if="loadError" class="text-[11px] text-red-600">{{ loadError }}</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, getCurrentInstance } from 'vue'

// Kept in step with server/utils/codeRewardPacks.js (the server enforces them; these only shape the form).
const MAX_PACK_QUANTITY_PER_CODE = 25
const MAX_PACKS_PER_CODE = 50

const props = defineProps({
  initial: { type: Array, default: () => [] }, // [{ packId, quantity }] — the Edit form
  noun: { type: String, default: 'code' }, // "…per code" / "…per prize"
  title: { type: String, default: 'Pack Rewards' },
  hint: { type: String, default: '' } // replaces the default sentence about where packs land
})
// Plain-text list of the recognised rows ("2× Starter Pack"), for a parent's preview line.
const emit = defineEmits(['summary'])

const listId = `pack-options-${getCurrentInstance()?.uid ?? 0}`
const options = ref([])
const rows = ref([])
const loadError = ref('')
const label = (p) => `${p.name} (${p.id})`

function find (input) {
  const v = (input || '').trim()
  if (!v) return null
  const direct = options.value.find(p => p.id === v || label(p) === v)
  if (direct) return direct
  const idMatch = v.match(/\(([^)]+)\)\s*$/)
  if (idMatch) {
    const byId = options.value.find(p => p.id === idMatch[1].trim())
    if (byId) return byId
  }
  const byName = options.value.filter(p => p.name === v)
  return byName.length === 1 ? byName[0] : null
}

function populate () {
  if (!props.initial?.length) return
  rows.value = props.initial.map(i => {
    const p = options.value.find(o => o.id === i.packId)
    return { name: p ? label(p) : i.packId, quantity: i.quantity }
  })
}
watch(() => props.initial, populate, { deep: true })
watch([rows, options], () => {
  const parts = []
  for (const r of rows.value) {
    const p = find(r.name)
    const q = Number(r.quantity)
    if (p && Number.isInteger(q) && q >= 1) parts.push(`${q}× ${p.name}`)
  }
  emit('summary', parts.join(', '))
}, { deep: true })

onMounted(async () => {
  try {
    // /api/admin/packs pages at 200; walk the pages so every pack is selectable.
    let page = 1; let total = Infinity
    while (options.value.length < total && page <= 20) {
      const res = await fetch(`/api/admin/packs?page=${page}&limit=200`, { credentials: 'include' })
      if (!res.ok) throw new Error('Could not load the pack list.')
      const body = await res.json()
      total = body.total ?? 0
      options.value.push(...(body.items || []).map(p => ({ id: p.id, name: p.name, imagePath: p.imagePath })))
      if (!body.items?.length) break
      page += 1
    }
    populate()
  } catch (e) {
    loadError.value = e.message || 'Could not load the pack list.'
  }
  if (!rows.value.length) rows.value = []
})

function toPayload () {
  const merged = new Map()
  for (const r of rows.value) {
    const name = (r.name || '').trim()
    if (!name) continue
    const p = find(name)
    if (!p) return { ok: false, packs: [], error: `Unrecognized pack: “${name}”. Pick one from the list.` }
    const q = Number(r.quantity)
    if (!Number.isInteger(q) || q < 1) return { ok: false, packs: [], error: `Quantity for “${p.name}” must be a whole number of at least 1.` }
    merged.set(p.id, (merged.get(p.id) || 0) + q)
  }
  const packs = [...merged].map(([packId, quantity]) => ({ packId, quantity }))
  for (const { packId, quantity } of packs) {
    if (quantity > MAX_PACK_QUANTITY_PER_CODE) {
      return { ok: false, packs: [], error: `A ${props.noun} can award at most ${MAX_PACK_QUANTITY_PER_CODE} of “${find(packId)?.name}”.` }
    }
  }
  if (packs.reduce((n, p) => n + p.quantity, 0) > MAX_PACKS_PER_CODE) {
    return { ok: false, packs: [], error: `A ${props.noun} can award at most ${MAX_PACKS_PER_CODE} packs in total.` }
  }
  return { ok: true, packs, error: '' }
}

defineExpose({ toPayload })
</script>
