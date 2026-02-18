<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-xl mx-auto bg-white rounded-lg shadow p-6 mt-16 md:mt-20">
      <h1 class="text-2xl font-semibold mb-4">Manage Production Instance</h1>

      <div class="flex items-center justify-between mb-4">
        <div class="text-sm">
          <div class="text-gray-600">Status</div>
          <div class="font-medium flex items-center gap-2">
            <span v-if="status==='active'">On</span>
            <span v-else-if="status==='off'">Off</span>
            <span v-else>{{ status }}</span>
            <span v-if="vcpus && memoryMb" class="text-xs text-gray-500">
              ({{ vcpus }} vCPU / {{ formatMemory(memoryMb) }})
            </span>
          </div>
        </div>
        <button
          :disabled="working || scaleWorking || status==='unknown' || status==='missing'"
          @click="togglePower"
          class="px-4 py-2 rounded text-white disabled:opacity-50"
          :class="status==='active' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
        >
          <span v-if="working && status!=='active'">Turning On Production...</span>
          <span v-else-if="working && status==='active'">Turning Off Production...</span>
          <span v-else>{{ status==='active' ? 'Turn Off Production' : 'Turn On Production' }}</span>
        </button>
      </div>

      <div class="flex items-center justify-between mb-4">
        <div class="text-sm">
          <div class="text-gray-600">Scale</div>
          <div class="font-medium">
            <span v-if="scaleUpUntil">Upsized</span>
            <span v-else>Normal</span>
          </div>
          <div v-if="scaleUpUntil" class="text-xs text-gray-500">
            Downsizes at {{ formatTimestamp(scaleUpUntil) }}
          </div>
        </div>
        <button
          :disabled="working || scaleWorking || status==='unknown' || status==='missing'"
          @click="handleScaleAction"
          class="px-4 py-2 rounded text-white disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
        >
          <span v-if="scaleWorking && scaleUpUntil">Downsizing...</span>
          <span v-else-if="scaleWorking">Scaling Up...</span>
          <span v-else>{{ scaleUpUntil ? 'Down Size Server' : 'Scale Up for 5 hours' }}</span>
        </button>
      </div>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <div class="mt-4">
        <button
          @click="refresh"
          :disabled="working || scaleWorking"
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
const scaleWorking = ref(false)
const scaleUpUntil = ref(null)
const vcpus = ref(null)
const memoryMb = ref(null)
const error   = ref('')
let scaleTimerId = null

function setScaleUpUntil(value) {
  if (scaleTimerId) {
    clearTimeout(scaleTimerId)
    scaleTimerId = null
  }

  if (value && value > Date.now()) {
    scaleUpUntil.value = value
    scaleTimerId = setTimeout(() => {
      scaleUpUntil.value = null
      scaleTimerId = null
    }, value - Date.now())
    return
  }

  scaleUpUntil.value = null
}

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
  setScaleUpUntil(data.scaleUpUntil)
  vcpus.value = data.vcpus || null
  memoryMb.value = data.memoryMb || null
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

async function handleScaleAction() {
  error.value = ''
  scaleWorking.value = true
  try {
    const endpoint = scaleUpUntil.value ? '/api/admin/dev/scale-down' : '/api/admin/dev/scale'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include'
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || 'Scale up failed')
    }
    const data = await res.json()
    setScaleUpUntil(data.scaleUpUntil)
    await fetchStatus()
  } catch (e) {
    error.value = e.message || 'Error'
  } finally {
    scaleWorking.value = false
  }
}

function refresh() { if (!working.value && !scaleWorking.value) fetchStatus() }

function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

function formatMemory(mb) {
  const gb = mb / 1024
  if (!Number.isFinite(gb)) return ''
  return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`
}

onMounted(fetchStatus)
</script>
