<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16 md:mt-20">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 class="text-2xl font-semibold">cToon Suggestions</h1>
          <p class="text-sm text-gray-500">{{ headerDescription }}</p>
          <div class="mt-3 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              class="px-3 py-1.5 text-sm rounded-md transition"
              :class="activeTab === 'IN_REVIEW' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'"
              @click="setTab('IN_REVIEW')"
            >
              In Review
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md transition"
              :class="activeTab === 'HISTORY' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'"
              @click="setTab('HISTORY')"
            >
              History
            </button>
          </div>
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
      <div v-else-if="!suggestions.length" class="text-gray-500">
        {{ activeTab === 'HISTORY' ? 'No accepted or rejected suggestions yet.' : 'No suggestions currently in review.' }}
      </div>

      <div v-else>
        <!-- Mobile cards -->
        <div class="space-y-3 md:hidden">
          <div v-for="s in suggestions" :key="s.id" class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <input
                v-if="activeTab === 'IN_REVIEW'"
                type="checkbox"
                class="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-600 cursor-pointer"
                :checked="selectedIds.has(s.id)"
                @change="toggleSelection(s.id)"
              />
              <img
                v-if="s.ctoon?.assetPath"
                :src="s.ctoon.assetPath"
                :alt="s.ctoon?.name || 'cToon'"
                class="w-14 h-14 object-contain rounded bg-gray-100 p-1"
              />
              <div class="flex-1">
                <div class="font-semibold text-gray-900">{{ s.ctoon?.name || 'Unknown cToon' }}</div>
                <div class="text-xs text-gray-500">{{ s.ctoon?.series || 'No series' }} · {{ s.ctoon?.set || 'No set' }}</div>
                <div class="mt-2 text-sm text-gray-700">
                  Suggested by <span class="font-medium">{{ s.user?.username || 'Unknown' }}</span>
                </div>
                <div class="text-xs text-gray-500">{{ s.user?.discordTag || 'No tag' }}</div>
                <div class="mt-2 text-xs text-gray-500">Submitted {{ formatDateTime(s.createdAt) }}</div>
                <div v-if="activeTab === 'HISTORY'" class="mt-1 text-xs text-gray-600">
                  Status: <span class="font-semibold">{{ formatStatus(s.status) }}</span>
                </div>
              </div>
            </div>
            <div class="mt-4 flex justify-end">
              <button
                class="text-blue-600 hover:text-blue-800 font-medium"
                @click="openReview(s)"
              >
                {{ activeTab === 'HISTORY' ? 'View' : 'Review' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full table-auto border-collapse">
            <thead>
              <tr class="bg-gray-100">
                <th v-if="activeTab === 'IN_REVIEW'" class="px-4 py-2 w-10">
                  <input
                    ref="selectAllCheckboxRef"
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    :checked="allSelected"
                    @change="toggleAll"
                  />
                </th>
                <th class="px-4 py-2 text-left">cToon</th>
                <th class="px-4 py-2 text-left">Suggested By</th>
                <th class="px-4 py-2 text-left">Submitted</th>
                <th v-if="activeTab === 'HISTORY'" class="px-4 py-2 text-left">Status</th>
                <th class="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in suggestions" :key="s.id" class="border-b">
                <td v-if="activeTab === 'IN_REVIEW'" class="px-4 py-2 w-10">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    :checked="selectedIds.has(s.id)"
                    @change="toggleSelection(s.id)"
                  />
                </td>
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
                <td v-if="activeTab === 'HISTORY'" class="px-4 py-2 text-sm text-gray-600">
                  {{ formatStatus(s.status) }}
                </td>
                <td class="px-4 py-2 text-right">
                  <button
                    class="text-blue-600 hover:text-blue-800 font-medium"
                    @click="openReview(s)"
                  >
                    {{ activeTab === 'HISTORY' ? 'View' : 'Review' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="total > 0" class="mt-4 flex flex-col gap-2 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
          <div>{{ showingRange }}</div>
          <div class="space-x-2">
            <button
              class="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
              :disabled="page <= 1 || loading"
              @click="prevPage"
            >
              Prev
            </button>
            <button
              class="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
              :disabled="page >= totalPages || loading"
              @click="nextPage"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Individual review modal -->
    <Modal
      v-if="selectedSuggestion"
      :hide-close-button="true"
      :close-on-backdrop="true"
      @close="closeReview"
    >
      <div class="text-white flex flex-col max-h-[80vh]">
        <div class="flex items-start gap-4 pb-4 border-b border-white/10 shrink-0">
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

        <div class="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
          <div class="grid grid-cols-1 gap-4">
            <div class="rounded bg-gray-700/60 p-3">
              <div class="text-xs uppercase text-gray-300 mb-2">Current Values</div>
              <div class="text-sm text-gray-100 space-y-1">
                <div><strong>Name:</strong> {{ formatValue(selectedSuggestion.ctoon?.name) }}</div>
                <div><strong>Series:</strong> {{ formatValue(selectedSuggestion.ctoon?.series) }}</div>
                <div><strong>Set:</strong> {{ formatValue(selectedSuggestion.ctoon?.set) }}</div>
                <div><strong>Characters:</strong> {{ formatCharacters(selectedSuggestion.ctoon?.characters) }}</div>
                <div class="whitespace-pre-line"><strong>Description:</strong> {{ formatValue(selectedSuggestion.ctoon?.description) }}</div>
              </div>
            </div>

            <div class="rounded bg-gray-700/60 p-3">
              <div class="text-xs uppercase text-gray-300 mb-2">Suggested Values</div>
              <div class="text-sm text-gray-100 space-y-1">
                <div><strong>Name:</strong> {{ formatValue(selectedSuggestion.newValues?.name) }}</div>
                <div><strong>Series:</strong> {{ formatValue(selectedSuggestion.newValues?.series) }}</div>
                <div><strong>Set:</strong> {{ formatValue(selectedSuggestion.newValues?.set) }}</div>
                <div><strong>Characters:</strong> {{ formatCharacters(selectedSuggestion.newValues?.characters) }}</div>
                <div class="whitespace-pre-line"><strong>Description:</strong> {{ formatValue(selectedSuggestion.newValues?.description) }}</div>
              </div>
            </div>
          </div>

          <div class="text-xs text-gray-400">
            Submitted {{ formatDateTime(selectedSuggestion.createdAt) }}
          </div>

          <div class="text-xs text-gray-300">
            Status: <span class="font-semibold">{{ formatStatus(selectedSuggestion.status) }}</span>
          </div>

          <div v-if="canReview" class="rounded bg-gray-700/60 p-3">
            <label class="block text-xs uppercase text-gray-300 mb-2" for="reject-reason">
              Rejection reason (sent via Discord)
            </label>
            <textarea
              id="reject-reason"
              v-model="rejectReason"
              class="w-full rounded bg-gray-900/70 text-gray-100 p-2 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/60"
              rows="3"
              placeholder="Share the key reason for rejection..."
              :disabled="actionLoading"
            />
            <div class="text-xs text-gray-400 mt-2">Required if you reject this suggestion.</div>
          </div>

          <div
            v-if="selectedSuggestion.status === 'REJECTED' && selectedSuggestion.rejectionReason"
            class="rounded bg-gray-700/60 p-3"
          >
            <div class="text-xs uppercase text-gray-300 mb-2">Saved rejection reason</div>
            <div class="text-sm text-gray-100 whitespace-pre-line">{{ selectedSuggestion.rejectionReason }}</div>
          </div>

          <div v-if="actionError" class="text-sm text-red-300">
            {{ actionError }}
          </div>
        </div>

        <div class="pt-4 border-t border-white/10 flex items-center justify-end gap-3 shrink-0">
          <button
            class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm"
            :disabled="actionLoading"
            @click="closeReview"
          >
            Close
          </button>
          <template v-if="canReview">
            <button
              class="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
              :disabled="actionLoading"
              @click="rejectSuggestion"
            >
              {{ actionLoading ? 'Working...' : 'Reject' }}
            </button>
            <button
              class="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
              :disabled="actionLoading"
              @click="acceptSuggestion"
            >
              {{ actionLoading ? 'Working...' : 'Accept' }}
            </button>
          </template>
        </div>
      </div>
    </Modal>

    <!-- Bulk reject modal -->
    <Modal
      v-if="bulkRejectModalOpen"
      :hide-close-button="true"
      :close-on-backdrop="!bulkActionLoading"
      @close="closeBulkRejectModal"
    >
      <div class="text-white flex flex-col">
        <div class="pb-4 border-b border-white/10">
          <h3 class="text-xl font-semibold">
            Bulk Reject {{ selectedIds.size }} Suggestion{{ selectedIds.size !== 1 ? 's' : '' }}
          </h3>
          <p class="text-sm text-gray-300 mt-1">This rejection reason will be sent to each user via Discord.</p>
        </div>
        <div class="py-4">
          <label class="block text-xs uppercase text-gray-300 mb-2" for="bulk-reject-reason">
            Rejection reason (required)
          </label>
          <textarea
            id="bulk-reject-reason"
            v-model="bulkRejectReason"
            class="w-full rounded bg-gray-900/70 text-gray-100 p-2 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/60"
            rows="4"
            placeholder="Share the key reason for rejection..."
            :disabled="bulkActionLoading"
          />
          <div v-if="bulkActionError" class="text-sm text-red-300 mt-2">{{ bulkActionError }}</div>
        </div>
        <div class="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
            :disabled="bulkActionLoading"
            @click="closeBulkRejectModal"
          >
            Cancel
          </button>
          <button
            class="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
            :disabled="bulkActionLoading"
            @click="confirmBulkReject"
          >
            {{ bulkActionLoading ? 'Rejecting...' : `Reject ${selectedIds.size}` }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- Floating bulk action bar -->
    <Transition name="slide-up">
      <div
        v-if="activeTab === 'IN_REVIEW' && selectedIds.size > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-gray-900 px-5 py-3 shadow-2xl border border-gray-700"
      >
        <span class="text-sm text-white font-medium whitespace-nowrap">
          {{ selectedIds.size }} selected
        </span>
        <button
          class="text-xs text-gray-400 hover:text-gray-200 underline whitespace-nowrap"
          @click="clearSelection"
        >
          Clear
        </button>
        <div class="w-px h-5 bg-gray-600" />
        <button
          class="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          :disabled="bulkActionLoading"
          @click="bulkAccept"
        >
          {{ bulkActionLoading ? 'Working...' : 'Approve' }}
        </button>
        <button
          class="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          :disabled="bulkActionLoading"
          @click="openBulkRejectModal"
        >
          Reject
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Admin - cToon Suggestions', middleware: ['auth', 'admin'], layout: 'default' })

import { ref, computed, onMounted, watchEffect } from 'vue'
import Nav from '~/components/Nav.vue'
import Modal from '~/components/Modal.vue'

const suggestions = ref([])
const loading = ref(false)
const error = ref('')
const total = ref(0)
const page = ref(1)
const pageSize = 50
const activeTab = ref('IN_REVIEW')
const selectedSuggestion = ref(null)
const actionLoading = ref(false)
const actionError = ref('')
const rejectReason = ref('')

// Bulk selection state
const selectedIds = ref(new Set())
const selectAllCheckboxRef = ref(null)
const bulkRejectModalOpen = ref(false)
const bulkRejectReason = ref('')
const bulkActionLoading = ref(false)
const bulkActionError = ref('')

const canReview = computed(() => selectedSuggestion.value?.status === 'IN_REVIEW')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const allSelected = computed(() =>
  suggestions.value.length > 0 && suggestions.value.every(s => selectedIds.value.has(s.id))
)
const someSelected = computed(() => selectedIds.value.size > 0 && !allSelected.value)

const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})
const headerDescription = computed(() => (
  activeTab.value === 'HISTORY'
    ? 'Browse accepted and rejected cToon suggestion history.'
    : 'Review community-submitted updates that are in review.'
))

// Keep the select-all checkbox indeterminate when only some rows are checked
watchEffect(() => {
  if (selectAllCheckboxRef.value) {
    selectAllCheckboxRef.value.indeterminate = someSelected.value
  }
})

function clearSelection() {
  selectedIds.value = new Set()
}

function toggleSelection(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleAll() {
  if (allSelected.value) {
    clearSelection()
  } else {
    selectedIds.value = new Set(suggestions.value.map(s => s.id))
  }
}

async function fetchSuggestions() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (activeTab.value === 'HISTORY') params.set('status', 'HISTORY')
    params.set('page', String(page.value))
    params.set('limit', String(pageSize))
    const res = await fetch(`/api/admin/ctoon-suggestions?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to load suggestions')
    }
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []
    const totalValue = typeof data?.total === 'number' ? data.total : 0
    const resolvedPage = typeof data?.page === 'number' ? data.page : page.value
    const totalPagesValue = Math.max(1, Math.ceil(totalValue / pageSize))
    if (totalValue > 0 && resolvedPage > totalPagesValue) {
      page.value = totalPagesValue
      await fetchSuggestions()
      return
    }
    suggestions.value = items
    total.value = totalValue
    page.value = totalValue === 0 ? 1 : resolvedPage
  } catch (err) {
    error.value = err?.message || 'Failed to load suggestions'
    suggestions.value = []
    total.value = 0
    page.value = 1
  } finally {
    loading.value = false
  }
}

function openReview(suggestion) {
  selectedSuggestion.value = suggestion
  actionError.value = ''
  rejectReason.value = ''
}

function closeReview() {
  selectedSuggestion.value = null
  actionError.value = ''
  rejectReason.value = ''
}

function setTab(tab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  page.value = 1
  clearSelection()
  closeReview()
  fetchSuggestions()
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  clearSelection()
  fetchSuggestions()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  clearSelection()
  fetchSuggestions()
}

async function acceptSuggestion() {
  if (!selectedSuggestion.value || actionLoading.value) return
  if (!canReview.value) return
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
    closeReview()
    await fetchSuggestions()
  } catch (err) {
    actionError.value = err?.message || 'Failed to accept suggestion'
  } finally {
    actionLoading.value = false
  }
}

async function rejectSuggestion() {
  if (!selectedSuggestion.value || actionLoading.value) return
  if (!canReview.value) return
  const reason = rejectReason.value.trim()
  if (!reason) {
    actionError.value = 'Please enter a rejection reason to send to the user.'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  try {
    const res = await fetch(`/api/admin/ctoon-suggestions/${selectedSuggestion.value.id}/reject`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to reject suggestion')
    }
    closeReview()
    await fetchSuggestions()
  } catch (err) {
    actionError.value = err?.message || 'Failed to reject suggestion'
  } finally {
    actionLoading.value = false
  }
}

function openBulkRejectModal() {
  bulkActionError.value = ''
  bulkRejectReason.value = ''
  bulkRejectModalOpen.value = true
}

function closeBulkRejectModal() {
  if (bulkActionLoading.value) return
  bulkRejectModalOpen.value = false
  bulkRejectReason.value = ''
  bulkActionError.value = ''
}

async function bulkAccept() {
  if (!selectedIds.value.size || bulkActionLoading.value) return
  bulkActionLoading.value = true
  bulkActionError.value = ''
  try {
    const res = await fetch('/api/admin/ctoon-suggestions/bulk-accept', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds.value] })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to accept suggestions')
    }
    clearSelection()
    await fetchSuggestions()
  } catch (err) {
    bulkActionError.value = err?.message || 'Failed to accept suggestions'
  } finally {
    bulkActionLoading.value = false
  }
}

async function confirmBulkReject() {
  if (!selectedIds.value.size || bulkActionLoading.value) return
  const reason = bulkRejectReason.value.trim()
  if (!reason) {
    bulkActionError.value = 'Please enter a rejection reason.'
    return
  }
  bulkActionLoading.value = true
  bulkActionError.value = ''
  try {
    const res = await fetch('/api/admin/ctoon-suggestions/bulk-reject', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds.value], reason })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.statusMessage || 'Failed to reject suggestions')
    }
    bulkRejectModalOpen.value = false
    bulkRejectReason.value = ''
    clearSelection()
    await fetchSuggestions()
  } catch (err) {
    bulkActionError.value = err?.message || 'Failed to reject suggestions'
  } finally {
    bulkActionLoading.value = false
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

function formatStatus(value) {
  if (!value) return 'N/A'
  if (value === 'IN_REVIEW') return 'In Review'
  if (value === 'ACCEPTED') return 'Accepted'
  if (value === 'REJECTED') return 'Rejected'
  return value
}

onMounted(fetchSuggestions)
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(0.75rem);
}
</style>
