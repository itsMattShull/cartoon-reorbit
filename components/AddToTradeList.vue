<template>
  <button
    @click="toggle"
    :disabled="isDisabled"
    :class="[
      'px-4 py-2 rounded-lg text-white',
      isDisabled
        ? 'opacity-50 cursor-not-allowed'
        : inTradeList
          ? 'bg-green-700'
          : 'bg-green-600'
    ]"
  >
    {{ buttonText }}
  </button>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTradeList } from '@/composables/useTradeList'

const props = defineProps({
  userCtoonId: { type: String, required: true },
  isOwner: { type: Boolean, required: true }
})

const { tradeList, loading, add, remove } = useTradeList()

const processing = ref(false)
const processingAction = ref('') // 'adding' | 'removing' | ''

const inTradeList = computed(() =>
  !loading.value && tradeList.value.includes(props.userCtoonId)
)
const isDisabled = computed(() =>
  loading.value || processing.value || !props.isOwner
)
const buttonText = computed(() => {
  if (processing.value && processingAction.value === 'adding') return 'Adding To Trade List'
  if (processing.value && processingAction.value === 'removing') return 'Removing From Trade List'
  return inTradeList.value ? 'Remove from Trade List' : 'Add to Trade List'
})

async function toggle() {
  if (isDisabled.value) return
  if (inTradeList.value) {
    processing.value = true
    processingAction.value = 'removing'
    try {
      await remove(props.userCtoonId)
    } finally {
      processing.value = false
      processingAction.value = ''
    }
  } else {
    processing.value = true
    processingAction.value = 'adding'
    try {
      await add(props.userCtoonId)
    } finally {
      processing.value = false
      processingAction.value = ''
    }
  }
}
</script>
