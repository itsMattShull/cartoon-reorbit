<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
    <div class="bg-white rounded-lg w-full max-w-lg my-8 flex flex-col shadow-xl">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10 rounded-t-lg">
        <div>
          <h2 class="text-lg font-semibold">Batch Assign cMoon</h2>
          <p class="text-sm text-gray-500 mt-0.5">{{ filterLabel }} — {{ count }} cToon{{ count !== 1 ? 's' : '' }}</p>
        </div>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0">&times;</button>
      </div>

      <div class="p-6 space-y-5">

        <!-- cMoon picker -->
        <div>
          <label class="block text-sm font-medium mb-1">Assign to cMoon</label>
          <select
            :value="touched ? (cMoonId ?? NONE_VALUE) : UNSELECTED_VALUE"
            @change="onSelect($event.target.value)"
            class="w-full border rounded p-2 bg-white"
            style="font-size:16px"
          >
            <option :value="UNSELECTED_VALUE" disabled hidden>— Select —</option>
            <option :value="NONE_VALUE">— None (remove cMoon) —</option>
            <option v-for="c in cmoons" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            This will overwrite the cMoon on every matched cToon, including ones that already have a different cMoon assigned. Choose "None" to remove cMoon assignment from all of them instead.
          </p>
        </div>

        <!-- Large-batch warning -->
        <div v-if="isLarge" class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          This will update {{ count }} cToons at once. Review the list below before applying.
        </div>

        <!-- Preview toggle -->
        <div class="border rounded-lg">
          <button
            type="button"
            @click="showList = !showList"
            class="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>{{ showList ? 'Hide' : 'Show' }} {{ count }} cToon{{ count !== 1 ? 's' : '' }}</span>
            <span class="text-gray-400">{{ showList ? '▲' : '▼' }}</span>
          </button>
          <div v-if="showList" class="border-t max-h-64 overflow-y-auto divide-y">
            <div v-for="c in ctoons" :key="c.id" class="flex items-center gap-3 px-4 py-2">
              <img :src="c.assetPath" :alt="c.name" class="h-8 w-auto rounded object-contain flex-shrink-0" />
              <span class="text-sm truncate flex-1">{{ c.name }}</span>
              <span class="text-xs text-gray-400 flex-shrink-0">{{ c.cMoon?.name || '— none —' }}</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="border-t px-6 py-4 flex items-center justify-end gap-3 bg-gray-50 rounded-b-lg sticky bottom-0">
        <button @click="$emit('close')"
          class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100">
          Cancel
        </button>
        <button @click="submit" :disabled="saving || !touched"
          class="px-5 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {{ saving ? 'Saving…' : `Assign to ${count} cToon${count !== 1 ? 's' : ''}` }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  ctoons: { type: Array, required: true },
  filterLabel: { type: String, default: '' },
})

const emit = defineEmits(['close', 'saved'])

const UNSELECTED_VALUE = '__unselected__'
const NONE_VALUE = '__none__'

const cmoons = ref([])
const cMoonId = ref(null)
const touched = ref(false)
const showList = ref(false)
const saving = ref(false)

const count = computed(() => props.ctoons.length)
const isLarge = computed(() => count.value > 300)

onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/cmoons')
    cmoons.value = res?.cmoons || []
  } catch {
    cmoons.value = []
  }
})

function onSelect(value) {
  cMoonId.value = value === NONE_VALUE ? null : value
  touched.value = true
}

async function submit() {
  if (!touched.value || saving.value) return
  saving.value = true
  try {
    const res = await fetch('/api/admin/ctoons/batch-assign-cmoon', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: props.ctoons.map(c => c.id), cMoonId: cMoonId.value }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.statusMessage || 'Batch assign failed')
    }
    const data = await res.json()
    emit('saved', data)
  } catch (err) {
    console.error('[BatchAssignCMoonModal] submit error', err)
    alert(err.message || 'An error occurred while saving.')
  } finally {
    saving.value = false
  }
}
</script>
