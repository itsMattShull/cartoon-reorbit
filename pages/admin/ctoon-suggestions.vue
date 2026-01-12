<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16 md:mt-20">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 class="text-2xl font-semibold">cToon Suggestions</h1>
          <p class="text-sm text-gray-500">Review community-submitted updates that are in review.</p>
        </div>
        <button
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          :disabled="loading"
          @click="fetchSuggestions"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading" class="text-gray-500">Loading suggestions...</div>
      <div v-else-if="error" class="text-red-600">{{ error }}</div>
      <div v-else-if="!suggestions.length" class="text-gray-500">No suggestions currently in review.</div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">cToon</th>
              <th class="px-4 py-2 text-left">Suggested By</th>
              <th class="px-4 py-2 text-left">Submitted</th>
              <th class="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in suggestions" :key="s.id" class="border-b">
              <td class="px-4 py-2">
                <div class="flex items-center gap-3">
                  <img
                    v-if="s.ctoon?.assetPath"
                    :src="s.ctoon.assetPath"
                    :alt="s.ctoon?.name || 'cToon'"
                    class="w-12 h-12 object-contain rounded bg-gray-100 p-1"
                  />
                  <div>
                    <div class="font-medium">{{ s.ctoon?.name || 'Unknown cToon' }}</div>
                    <div class="text-xs text-gray-500">{{ s.ctoon?.series || 'No series' }} · {{ s.ctoon?.set || 'No set' }}</div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-2">
                <div class="font-medium">{{ s.user?.username || 'Unknown' }}</div>
                <div class="text-xs text-gray-500">{{ s.user?.discordTag || 'No tag' }}</div>
              </td>
              <td class="px-4 py-2 text-sm text-gray-600">{{ formatDateTime(s.createdAt) }}</td>
              <td class="px-4 py-2 text-right">
                <button
                  class="text-blue-600 hover:text-blue-800 font-medium"
                  @click="openReview(s)"
                >
                  Review
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Modal
      v-if="selectedSuggestion"
      :hide-close-button="true"
      :close-on-backdrop="true"
      @close="closeReview"
    >
      <div class="text-white space-y-4">
        <div class="flex items-start gap-4">
          <img
            v-if="selectedSuggestion.ctoon?.assetPath"
            :src="selectedSuggestion.ctoon.assetPath"
            :alt="selectedSuggestion.ctoon?.name || 'cToon'"
            class="w-20 h-20 object-contain rounded bg-gray-900/40 p-2"
          />
          <div>
            <h3 class="text-xl font-semibold">Review Suggestion</h3>
            <p class="text-sm text-gray-300">{{ selectedSuggestion.ctoon?.name || 'cToon' }}</p>
            <p class="text-xs text-gray-400">Submitted by {{ selectedSuggestion.user?.username || 'Unknown' }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300 mb-2">Current Values</div>
            <div class="text-sm text-gray-100 space-y-1">
              <div><strong>Name:</strong> {{ formatValue(selectedSuggestion.ctoon?.name) }}</div>
              <div><strong>Series:</strong> {{ formatValue(selectedSuggestion.ctoon?.series) }}</div>
              <div><strong>Set:</strong> {{ formatValue(selectedSuggestion.ctoon?.set) }}</div>
              <div><strong>Characters:</strong> {{ formatCharacters(selectedSuggestion.ctoon?.characters) }}</div>
            </div>
          </div>

          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300 mb-2">Suggested Values</div>
            <div class="text-sm text-gray-100 space-y-1">
              <div><strong>Name:</strong> {{ formatValue(selectedSuggestion.newValues?.name) }}</div>
              <div><strong>Series:</strong> {{ formatValue(selectedSuggestion.newValues?.series) }}</div>
              <div><strong>Set:</strong> {{ formatValue(selectedSuggestion.newValues?.set) }}</div>
              <div><strong>Characters:</strong> {{ formatCharacters(selectedSuggestion.newValues?.characters) }}</div>
            </div>
          </div>
        </div>

        <div class="text-xs text-gray-400">
          Submitted {{ formatDateTime(selectedSuggestion.createdAt) }}
        </div>

        <div v-if="actionError" class="text-sm text-red-300">
          {{ actionError }}
        </div>

        <div class="flex items-center justify-end gap-3">
          <button
            class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm"
            @click="closeReview"
            :disabled="actionLoading"
          >
            Close
          </button>
          <button
            class="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
            @click="rejectSuggestion"
            :disabled="actionLoading"
          >
            {{ actionLoading ? 'Working...' : 'Reject' }}
          </button>
          <button
            class="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
            @click="acceptSuggestion"
            :disabled="actionLoading"
          >
            {{ actionLoading ? 'Working...' : 'Accept' }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Admin - cToon Suggestions', middleware: ['auth', 'admin'], layout: 'default' })

import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'
import Modal from '~/components/Modal.vue'

const suggestions = ref([])
const loading = ref(false)
const error = ref('')
const selectedSuggestion = ref(null)
const actionLoading = ref(false)
const actionError = ref('')

async function fetchSuggestions() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/admin/ctoon-suggestions', { credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to load suggestions')
    }
    const data = await res.json()
    suggestions.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err?.message || 'Failed to load suggestions'
  } finally {
    loading.value = false
  }
}

function openReview(suggestion) {
  selectedSuggestion.value = suggestion
  actionError.value = ''
}

function closeReview() {
  selectedSuggestion.value = null
  actionError.value = ''
}

async function acceptSuggestion() {
  if (!selectedSuggestion.value || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  try {
    const res = await fetch(`/api/admin/ctoon-suggestions/${selectedSuggestion.value.id}/accept`, {
      method: 'POST',
      credentials: 'include'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to accept suggestion')
    }
    suggestions.value = suggestions.value.filter(s => s.id !== selectedSuggestion.value.id)
    closeReview()
  } catch (err) {
    actionError.value = err?.message || 'Failed to accept suggestion'
  } finally {
    actionLoading.value = false
  }
}

async function rejectSuggestion() {
  if (!selectedSuggestion.value || actionLoading.value) return
  actionLoading.value = true
  actionError.value = ''
  try {
    const res = await fetch(`/api/admin/ctoon-suggestions/${selectedSuggestion.value.id}/reject`, {
      method: 'POST',
      credentials: 'include'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to reject suggestion')
    }
    suggestions.value = suggestions.value.filter(s => s.id !== selectedSuggestion.value.id)
    closeReview()
  } catch (err) {
    actionError.value = err?.message || 'Failed to reject suggestion'
  } finally {
    actionLoading.value = false
  }
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'N/A'
  return value
}

function formatCharacters(value) {
  if (!Array.isArray(value) || value.length === 0) return 'N/A'
  return value.join(', ')
}

function formatDateTime(value) {
  if (!value) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(fetchSuggestions)
</script>
