<!-- components/GiveToOfficialModal.vue -->
<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
    <div class="bg-white rounded-lg w-full max-w-md my-8 shadow-xl">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">Give to Official</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      <div class="p-6 space-y-4">
        <div class="flex items-center gap-3">
          <img :src="ctoon.assetPath" :alt="ctoon.name" class="h-14 w-auto rounded flex-shrink-0" />
          <div>
            <p class="font-medium">{{ ctoon.name }}</p>
            <p class="text-xs text-gray-500">Highest Mint: {{ ctoon.highestMint }} / Quantity: {{ formatQuantity(ctoon.quantity) }}</p>
          </div>
        </div>

        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 space-y-2">
          <p>This will:</p>
          <ul class="list-disc list-inside space-y-1">
            <li>Mint <strong>5 new copies</strong> of this exact cToon</li>
            <li>Give all 5 copies to the <strong>{{ officialUsername }}</strong> account</li>
            <li>Permanently raise this cToon's mint total and quantity cap by 5</li>
          </ul>
          <p class="font-semibold">This action is one-time-only per cToon and cannot be undone.</p>
        </div>

        <label class="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" v-model="acknowledged" class="mt-0.5" />
          <span>I understand this is permanent and cannot be undone.</span>
        </label>

        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>

        <div class="flex justify-end gap-3 pt-2">
          <button
            @click="$emit('close')"
            :disabled="submitting"
            class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            @click="submit"
            :disabled="!acknowledged || submitting"
            class="px-4 py-2 rounded text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ submitting ? 'Giving…' : 'Give 5 to Official' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { formatQuantity } from '~/utils/formatQuantity'

const props = defineProps({
  ctoon: { type: Object, required: true },
})
const emit = defineEmits(['close', 'given'])

const acknowledged = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const officialUsername = ref('the Official')

onMounted(async () => {
  try {
    const res = await fetch('/api/admin/official', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      if (data?.username) officialUsername.value = data.username
    }
  } catch {}
})

async function submit() {
  if (!acknowledged.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`/api/admin/ctoons/${props.ctoon.id}/give-to-official`, {
      method: 'POST',
      credentials: 'include',
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.statusMessage || data?.message || 'Failed to give to Official.')
    }
    emit('given', data.ctoon)
  } catch (err) {
    errorMsg.value = err.message || 'Failed to give to Official.'
  } finally {
    submitting.value = false
  }
}
</script>
