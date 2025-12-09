<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Manage Lotto</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <p class="text-sm text-gray-600 mb-4">View and update Lotto configuration values.</p>

      <div class="grid grid-cols-1 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">Base Odds</label>
          <input type="number" step="0.01" class="input" v-model.number="baseOdds" />
          <p class="text-xs text-gray-500 mt-1">Default: 1.00</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">Increment Rate</label>
          <input type="number" step="0.001" class="input" v-model.number="incrementRate" />
          <p class="text-xs text-gray-500 mt-1">Default: 0.02</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">Count Per Day</label>
          <input type="number" class="input" v-model.number="countPerDay" />
          <p class="text-xs text-gray-500 mt-1">Default: 5</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">Cost</label>
          <input type="number" class="input" v-model.number="cost" />
          <p class="text-xs text-gray-500 mt-1">Default: 50</p>
        </div>

        <div class="pt-2">
          <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Apply' }}</button>
        </div>

        <div v-if="toast" :class="['rounded px-3 py-2', toast.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700']">
          {{ toast.msg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const baseOdds = ref(1.0)
const incrementRate = ref(0.02)
const countPerDay = ref(5)
const cost = ref(50)
const saving = ref(false)
const toast = ref(null)

async function load() {
  try {
    const res = await $fetch('/api/admin/lotto-settings')
    baseOdds.value = Number(res?.baseOdds ?? 1.0)
    incrementRate.value = Number(res?.incrementRate ?? 0.02)
    countPerDay.value = Number(res?.countPerDay ?? 5)
    cost.value = Number(res?.cost ?? 50)
  } catch (e) {
    console.error('Failed to load lotto settings', e)
  }
}

async function save() {
  saving.value = true; toast.value = null
  try {
    await $fetch('/api/admin/lotto-settings', {
      method: 'POST',
      body: {
        baseOdds: Number(baseOdds.value),
        incrementRate: Number(incrementRate.value),
        countPerDay: Number(countPerDay.value),
        cost: Number(cost.value)
      }
    })
    toast.value = { type: 'ok', msg: 'Lotto settings saved.' }
  } catch (e) {
    console.error(e)
    toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false
    setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(load)
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
</style>
