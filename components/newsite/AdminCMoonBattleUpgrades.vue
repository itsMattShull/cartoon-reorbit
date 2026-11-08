<template>
  <div class="admin-cmoon-battle-upgrades bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Manage Upgrades</h1>
      </div>
      <p class="text-gray-500">
        Permanent cMoon battle HP/Stamina boosts players buy with points from the cMart's
        <strong>Upgrades</strong> tab, alongside "Additional cZone". Each upgrade may be bought up to its own
        purchase limit per player — once a player hits that limit the "Buy" button there shows "Maxed out"
        until they prestige, which resets (and removes) every upgrade they've bought so they can purchase
        them again. This is separate from the "Manage User HP &amp; Stamina" tool's own manual adjustment,
        which prestige never touches.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="u in upgrades" :key="u.id" class="bg-white rounded border p-3 flex items-start gap-3 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                :class="u.stat === 'STAMINA' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'"
              >{{ u.stat === 'STAMINA' ? 'Stamina' : 'HP' }}</span>
              <span v-if="!u.active" class="text-[10px] text-gray-500">(inactive — hidden from cMart)</span>
            </div>
            <div class="font-semibold break-words mt-1">{{ u.name }}</div>
            <div v-if="u.description" class="text-[11px] text-gray-600 break-words">{{ u.description }}</div>
            <div class="text-[11px] text-gray-600 mt-1">
              +{{ u.amount }} {{ u.stat === 'STAMINA' ? 'stamina' : 'HP' }} per purchase ·
              {{ u.price.toLocaleString() }} pts · limit {{ u.purchaseLimit }} per player
            </div>
            <div class="text-[11px] text-gray-500">
              Purchased by {{ u.purchaseCount }} player{{ u.purchaseCount === 1 ? '' : 's' }}
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(u)">Edit</button>
            <button
              type="button" class="text-red-600 hover:underline disabled:opacity-40"
              :disabled="deletingId === u.id || u.purchaseCount > 0"
              :title="u.purchaseCount > 0 ? 'Already purchased — set inactive instead' : ''"
              @click="removeUpgrade(u)"
            >{{ deletingId === u.id ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
        <p v-if="!loading && !upgrades.length" class="text-gray-500">No upgrades yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ form.id ? 'Edit upgrade' : 'New upgrade' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>
        <p v-if="form.id && hasPurchases" class="text-amber-700">
          Already purchased by at least one player — the stat (HP/Stamina) can no longer be changed.
        </p>

        <div>
          <label class="block text-xs font-medium mb-1">Name</label>
          <input v-model="form.name" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="Iron Will" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Description (optional, shown in the cMart)</label>
          <textarea v-model="form.description" rows="2" maxlength="500" class="w-full border rounded px-2 py-1" placeholder="A permanent boost to your fighting spirit."></textarea>
        </div>

        <div class="flex items-end gap-3 flex-wrap">
          <div>
            <label class="block text-xs font-medium mb-1">Stat</label>
            <select v-model="form.stat" class="border rounded px-2 py-1" :disabled="!!form.id && hasPurchases">
              <option value="HP">HP</option>
              <option value="STAMINA">Stamina</option>
            </select>
          </div>
          <div class="w-28">
            <label class="block text-xs font-medium mb-1">Amount per purchase</label>
            <input v-model.number="form.amount" type="number" :min="1" :max="form.stat === 'STAMINA' ? 50 : 1000" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-32">
            <label class="block text-xs font-medium mb-1">Price (points)</label>
            <input v-model.number="form.price" type="number" min="0" max="100000000" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-28">
            <label class="block text-xs font-medium mb-1">Purchase limit</label>
            <input v-model.number="form.purchaseLimit" type="number" min="1" max="100" class="w-full border rounded px-2 py-1" />
          </div>
        </div>
        <p class="text-[11px] text-gray-500">
          Purchase limit is per player — a limit of 1 makes this a true one-time purchase. Resets (and
          becomes buyable again) whenever a player prestiges.
        </p>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="form.active" />
          <span class="text-xs font-medium">Active (visible in the cMart)</span>
        </label>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (form.id ? 'Save changes' : 'Create upgrade') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'

const upgrades = ref([])
const loading = ref(false)
const loadError = ref('')

const saving = ref(false)
const formError = ref('')
const deletingId = ref('')

const emptyForm = () => ({ id: '', name: '', description: '', stat: 'HP', amount: 10, price: 1000, purchaseLimit: 1, active: true })
const form = reactive(emptyForm())

// Whether the upgrade currently being edited has already been bought by anyone — drives the
// "stat can't change" lock, mirrored server-side in cmoon-battle-upgrades/[id].put.js (which is
// the real enforcement; this is just so the admin isn't surprised by a 409 after filling the form).
const hasPurchases = computed(() => {
  if (!form.id) return false
  const existing = upgrades.value.find(u => u.id === form.id)
  return !!existing && existing.purchaseCount > 0
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-battle-upgrades')
    upgrades.value = res?.upgrades || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load upgrades'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  formError.value = ''
  Object.assign(form, emptyForm())
}

function startEdit(u) {
  resetForm()
  Object.assign(form, {
    id: u.id, name: u.name, description: u.description || '', stat: u.stat,
    amount: u.amount, price: u.price, purchaseLimit: u.purchaseLimit, active: !!u.active,
  })
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Name is required.'; return }
  if (!Number.isInteger(form.amount) || form.amount < 1) { formError.value = 'Amount must be a positive whole number.'; return }
  if (!Number.isInteger(form.price) || form.price < 0) { formError.value = 'Price must be a non-negative whole number.'; return }
  if (!Number.isInteger(form.purchaseLimit) || form.purchaseLimit < 1) { formError.value = 'Purchase limit must be at least 1.'; return }

  const body = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    stat: form.stat,
    amount: form.amount,
    price: form.price,
    purchaseLimit: form.purchaseLimit,
    active: form.active,
  }

  saving.value = true
  try {
    if (form.id) {
      await $fetch(`/api/admin/cmoon-battle-upgrades/${form.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/cmoon-battle-upgrades', { method: 'POST', body })
    }
    resetForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save upgrade'
  } finally {
    saving.value = false
  }
}

async function removeUpgrade(u) {
  if (u.purchaseCount > 0) return
  if (!confirm(`Delete "${u.name}"? This can't be undone.`)) return
  deletingId.value = u.id
  try {
    await $fetch(`/api/admin/cmoon-battle-upgrades/${u.id}`, { method: 'DELETE' })
    if (form.id === u.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete upgrade'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>
