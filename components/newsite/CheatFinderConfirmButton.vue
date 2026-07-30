<template>
  <div class="inline-flex items-center gap-1">
    <template v-if="!armed">
      <button
        type="button"
        :disabled="pending"
        :aria-label="`Confirm ${label} as not cheating`"
        class="min-h-[36px] min-w-[36px] px-2 py-1 text-[11px] font-medium rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="armed = true"
      >
        <span v-if="pending">Confirming…</span>
        <span v-else>Confirm</span>
      </button>
    </template>
    <template v-else>
      <span class="text-[11px] text-gray-600 mr-0.5">Not cheating?</span>
      <button
        type="button"
        :disabled="pending"
        :aria-label="`Yes, confirm ${label} as not cheating`"
        class="min-h-[36px] min-w-[36px] px-2 py-1 text-[11px] font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        @click="onConfirm"
      >
        Yes
      </button>
      <button
        type="button"
        :disabled="pending"
        aria-label="Cancel"
        class="min-h-[36px] min-w-[36px] px-2 py-1 text-[11px] font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        @click="armed = false"
      >
        Cancel
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  label: { type: String, default: 'this match' },
  pending: { type: Boolean, default: false }
})
const emit = defineEmits(['confirm'])

const armed = ref(false)

function onConfirm() {
  armed.value = false
  emit('confirm')
}
</script>
