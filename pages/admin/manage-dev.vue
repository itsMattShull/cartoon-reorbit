<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-xl mx-auto bg-white rounded-lg shadow p-6 mt-16 md:mt-20">
      <h1 class="text-2xl font-semibold mb-4">Manage Dev Instance</h1>

      <div class="flex items-center justify-between mb-4">
        <div class="text-sm">
          <div class="text-gray-600">Status</div>
          <div class="font-medium">
            <span v-if="status==='active'">On</span>
            <span v-else-if="status==='off'">Off</span>
            <span v-else>{{ status }}</span>
          </div>
        </div>
        <button
          :disabled="working || status==='unknown' || status==='missing'"
          @click="togglePower"
          class="px-4 py-2 rounded text-white disabled:opacity-50"
          :class="status==='active' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
        >
          <span v-if="working && status!=='active'">Turning On Dev...</span>
          <span v-else-if="working && status==='active'">Turning Off Dev...</span>
          <span v-else>{{ status==='active' ? 'Turn Off Dev' : 'Turn On Dev' }}</span>
        </button>
      </div>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <div class="mt-4">
        <button
          @click="refresh"
          :disabled="working"
          class="px-3 py-1 border rounded text-sm disabled:opacity-50"
        >
          Refresh status
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Admin - Manage Dev', middleware: ['auth','admin'], layout: 'default' })

import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

const status  = ref('unknown') // 'active' | 'off' | 'unknown' | 'missing'
const working = ref(false)
const error   = ref('')

async function fetchStatus() {
  error.value = ''
  const res = await fetch('/api/admin/dev/status', { credentials: 'include' })
  if (!res.ok) {
    error.value = 'Failed to read status'
    status.value = 'unknown'
    return
  }
  const data = await res.json()
  status.value = data.status || 'unknown'
}

async function togglePower() {
  error.value = ''
  working.value = true
  const desired = status.value === 'active' ? 'off' : 'on'
  try {
    const res = await fetch('/api/admin/dev/power', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: desired })
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || 'Power change failed')
    }
    const data = await res.json()
    status.value = data.status || 'unknown'
  } catch (e) {
    error.value = e.message || 'Error'
  } finally {
    working.value = false
  }
}

function refresh() { if (!working.value) fetchStatus() }

onMounted(fetchStatus)
</script>
