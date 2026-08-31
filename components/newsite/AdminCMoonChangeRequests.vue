<template>
  <div class="bg-gray-50 text-xs">

    <div class="px-2 py-2">
    <div class="bg-white rounded-lg shadow p-3">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
        <div>
          <h1 class="text-base font-semibold">cMoon Change Requests</h1>
          <p class="text-xs text-gray-500">{{ headerDescription }}</p>
          <div class="mt-2 inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            <button
              class="acr-tap px-2 text-xs rounded-md transition"
              :class="activeTab === 'IN_REVIEW' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'"
              @click="setTab('IN_REVIEW')"
            >
              In Review
            </button>
            <button
              class="acr-tap px-2 text-xs rounded-md transition"
              :class="activeTab === 'HISTORY' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'"
              @click="setTab('HISTORY')"
            >
              History
            </button>
          </div>
        </div>
        <button
          class="acr-tap px-3 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="loading"
          @click="fetchRequests"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading" class="text-gray-500 py-6 text-center">Loading requests...</div>
      <div v-else-if="error" class="text-red-600 py-6 text-center">{{ error }}</div>
      <div v-else-if="!requests.length" class="text-gray-500 py-6 text-center">
        {{ activeTab === 'HISTORY' ? 'No accepted or rejected requests yet.' : 'No team-change requests currently in review.' }}
      </div>

      <div v-else>
        <!-- Mobile cards -->
        <div class="space-y-2 md:hidden">
          <div v-for="r in requests" :key="r.id" class="bg-white border rounded-lg shadow p-2">
            <div class="flex items-start gap-2">
              <input
                v-if="activeTab === 'IN_REVIEW'"
                type="checkbox"
                class="mt-1 h-5 w-5 flex-shrink-0 rounded border-gray-300 text-blue-600 cursor-pointer"
                :checked="selectedIds.has(r.id)"
                @change="toggleSelection(r.id)"
              />
              <div class="flex-1">
                <div class="font-semibold text-xs text-gray-900">{{ r.user?.username || 'Unknown' }}</div>
                <div class="text-[10px] text-gray-500">{{ r.user?.discordTag || 'No tag' }}</div>
                <div class="mt-1 text-xs text-gray-700 flex items-center gap-1 flex-wrap">
                  <span class="inline-flex items-center gap-1">
                    <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: r.currentCMoon?.color || '#999' }"></span>
                    {{ r.currentCMoon?.name || 'No team' }}
                  </span>
                  <span class="text-gray-400">→</span>
                  <span class="inline-flex items-center gap-1">
                    <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: r.requestedCMoon?.color || '#999' }"></span>
                    {{ r.requestedCMoon?.name || 'Unknown' }}
                  </span>
                </div>
                <div class="mt-1 text-[10px] text-gray-500">Submitted {{ formatDateTime(r.createdAt) }}</div>
                <div v-if="activeTab === 'HISTORY'" class="mt-0.5 text-[10px] text-gray-600">
                  Status: <span class="font-semibold">{{ formatStatus(r.status) }}</span>
                </div>
              </div>
            </div>
            <div class="mt-2 flex justify-end">
              <button
                class="acr-tap text-xs text-blue-600 hover:text-blue-800 font-medium"
                @click="openReview(r)"
              >
                {{ activeTab === 'HISTORY' ? 'View' : 'Review' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full table-auto border-collapse text-xs">
            <thead>
              <tr>
                <th v-if="activeTab === 'IN_REVIEW'" class="px-2 py-1.5 w-10 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">
                  <input
                    ref="selectAllCheckboxRef"
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    :checked="allSelected"
                    @change="toggleAll"
                  />
                </th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Player</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Current → Requested</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Submitted</th>
                <th v-if="activeTab === 'HISTORY'" class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Status</th>
                <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in requests" :key="r.id" class="border-b">
                <td v-if="activeTab === 'IN_REVIEW'" class="px-2 py-1.5 w-10">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    :checked="selectedIds.has(r.id)"
                    @change="toggleSelection(r.id)"
                  />
                </td>
                <td class="px-2 py-1.5">
                  <div class="font-medium">{{ r.user?.username || 'Unknown' }}</div>
                  <div class="text-[10px] text-gray-500">{{ r.user?.discordTag || 'No tag' }}</div>
                </td>
                <td class="px-2 py-1.5">
                  <div class="flex items-center gap-1 flex-wrap">
                    <span class="inline-flex items-center gap-1">
                      <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: r.currentCMoon?.color || '#999' }"></span>
                      {{ r.currentCMoon?.name || 'No team' }}
                    </span>
                    <span class="text-gray-400">→</span>
                    <span class="inline-flex items-center gap-1">
                      <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: r.requestedCMoon?.color || '#999' }"></span>
                      {{ r.requestedCMoon?.name || 'Unknown' }}
                    </span>
                  </div>
                </td>
                <td class="px-2 py-1.5 text-gray-600">{{ formatDateTime(r.createdAt) }}</td>
                <td v-if="activeTab === 'HISTORY'" class="px-2 py-1.5 text-gray-600">
                  {{ formatStatus(r.status) }}
                </td>
                <td class="px-2 py-1.5 text-right">
                  <button
                    class="acr-tap text-blue-600 hover:text-blue-800 font-medium"
                    @click="openReview(r)"
                  >
                    {{ activeTab === 'HISTORY' ? 'View' : 'Review' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="total > 0" class="mt-3 flex flex-col gap-2 text-xs text-gray-600 md:flex-row md:items-center md:justify-between">
          <div>{{ showingRange }}</div>
          <div class="space-x-2">
            <button
              class="acr-tap px-3 text-xs border rounded-md disabled:opacity-50"
              :disabled="page <= 1 || loading"
              @click="prevPage"
            >
              Prev
            </button>
            <button
              class="acr-tap px-3 text-xs border rounded-md disabled:opacity-50"
              :disabled="page >= totalPages || loading"
              @click="nextPage"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>

    <!-- Individual review modal -->
    <Modal
      v-if="selectedRequest"
      :hide-close-button="true"
      :close-on-backdrop="true"
      @close="closeReview"
    >
      <div class="text-white text-xs flex flex-col max-h-[80vh]">
        <div class="pb-3 border-b border-white/10 shrink-0">
          <h3 class="text-sm font-semibold">Review Team-Change Request</h3>
          <p class="text-xs text-gray-300">{{ selectedRequest.user?.username || 'Unknown' }}</p>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto py-3 space-y-3">
          <div class="rounded bg-gray-700/60 p-2 text-xs text-gray-100 flex items-center gap-2 flex-wrap">
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block w-3 h-3 rounded-full" :style="{ background: selectedRequest.currentCMoon?.color || '#999' }"></span>
              {{ selectedRequest.currentCMoon?.name || 'No team' }}
            </span>
            <span class="text-gray-400">→</span>
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block w-3 h-3 rounded-full" :style="{ background: selectedRequest.requestedCMoon?.color || '#999' }"></span>
              {{ selectedRequest.requestedCMoon?.name || 'Unknown' }}
            </span>
          </div>

          <div class="text-[10px] text-gray-400">
            Submitted {{ formatDateTime(selectedRequest.createdAt) }}
          </div>

          <div class="text-[10px] text-gray-300">
            Status: <span class="font-semibold">{{ formatStatus(selectedRequest.status) }}</span>
          </div>

          <div v-if="canReview" class="rounded bg-gray-700/60 p-2">
            <label class="block text-[10px] uppercase text-gray-300 mb-1.5" for="reject-reason">
              Rejection reason (sent via Discord)
            </label>
            <textarea
              id="reject-reason"
              v-model="rejectReason"
              class="w-full rounded-md bg-gray-900/70 text-gray-100 px-2 py-1.5 text-xs border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/60"
              style="font-size:16px"
              rows="3"
              placeholder="Share the key reason for rejection..."
              :disabled="actionLoading"
            />
            <div class="text-[10px] text-gray-400 mt-1.5">Required if you reject this request.</div>
          </div>

          <div
            v-if="selectedRequest.status === 'REJECTED' && selectedRequest.rejectionReason"
            class="rounded bg-gray-700/60 p-2"
          >
            <div class="text-[10px] uppercase text-gray-300 mb-1.5">Saved rejection reason</div>
            <div class="text-xs text-gray-100 whitespace-pre-line">{{ selectedRequest.rejectionReason }}</div>
          </div>

          <div v-if="actionError" class="text-xs text-red-300">
            {{ actionError }}
          </div>
        </div>

        <div class="pt-3 border-t border-white/10 flex items-center justify-end gap-2 shrink-0">
          <button
            class="acr-tap px-3 text-xs border border-gray-600 rounded-md hover:bg-gray-700"
            :disabled="actionLoading"
            @click="closeReview"
          >
            Close
          </button>
          <template v-if="canReview">
            <button
              class="acr-tap px-3 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="actionLoading"
              @click="rejectRequest"
            >
              {{ actionLoading ? 'Working...' : 'Reject' }}
            </button>
            <button
              class="acr-tap px-3 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              :disabled="actionLoading"
              @click="acceptRequest"
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
      <div class="text-white text-xs flex flex-col">
        <div class="pb-3 border-b border-white/10">
          <h3 class="text-sm font-semibold">
            Bulk Reject {{ selectedIds.size }} Request{{ selectedIds.size !== 1 ? 's' : '' }}
          </h3>
          <p class="text-xs text-gray-300 mt-1">This rejection reason will be sent to each player via Discord.</p>
        </div>
        <div class="py-3">
          <label class="block text-[10px] uppercase text-gray-300 mb-1.5" for="bulk-reject-reason">
            Rejection reason (required)
          </label>
          <textarea
            id="bulk-reject-reason"
            v-model="bulkRejectReason"
            class="w-full rounded-md bg-gray-900/70 text-gray-100 px-2 py-1.5 text-xs border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/60"
            style="font-size:16px"
            rows="4"
            placeholder="Share the key reason for rejection..."
            :disabled="bulkActionLoading"
          />
          <div v-if="bulkActionError" class="text-xs text-red-300 mt-2">{{ bulkActionError }}</div>
        </div>
        <div class="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            class="acr-tap px-3 text-xs border border-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50"
            :disabled="bulkActionLoading"
            @click="closeBulkRejectModal"
          >
            Cancel
          </button>
          <button
            class="acr-tap px-3 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="bulkActionLoading"
            @click="confirmBulkReject"
          >
            {{ bulkActionLoading ? 'Rejecting...' : `Reject ${selectedIds.size}` }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- Floating bulk action bar. z-[60] (not z-50): the globally-mounted "Daily" onboarding
         widget (components/Onboarding.vue) sits fixed/z-50 bottom-right on every page, including
         this admin page on mobile — this bar must always render above it. Safe-area padding
         keeps it clear of the iOS home indicator. -->
    <Transition name="slide-up">
      <div
        v-if="activeTab === 'IN_REVIEW' && selectedIds.size > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 shadow-2xl border border-gray-700"
        style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
      >
        <span class="text-xs text-white font-medium whitespace-nowrap">
          {{ selectedIds.size }} selected
        </span>
        <button
          class="acr-tap text-xs text-gray-400 hover:text-gray-200 underline whitespace-nowrap"
          @click="clearSelection"
        >
          Clear
        </button>
        <div class="w-px h-5 bg-gray-600" />
        <button
          class="acr-tap px-3 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
          :disabled="bulkActionLoading"
          @click="bulkAccept"
        >
          {{ bulkActionLoading ? 'Working...' : 'Approve' }}
        </button>
        <button
          class="acr-tap px-3 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
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

import { ref, computed, onMounted, watchEffect } from 'vue'
import Modal from '~/components/Modal.vue'

const requests = ref([])
const loading = ref(false)
const error = ref('')
const total = ref(0)
const page = ref(1)
const pageSize = 50
const activeTab = ref('IN_REVIEW')
const selectedRequest = ref(null)
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

const canReview = computed(() => selectedRequest.value?.status === 'IN_REVIEW')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const allSelected = computed(() =>
  requests.value.length > 0 && requests.value.every(r => selectedIds.value.has(r.id))
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
    ? 'Browse accepted and rejected team-change request history.'
    : 'Review player-submitted requests to move to a different cMoon.'
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
    selectedIds.value = new Set(requests.value.map(r => r.id))
  }
}

async function fetchRequests() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (activeTab.value === 'HISTORY') params.set('status', 'HISTORY')
    params.set('page', String(page.value))
    params.set('limit', String(pageSize))
    const data = await $fetch(`/api/admin/cmoon-change-requests?${params.toString()}`)
    const items = Array.isArray(data?.items) ? data.items : []
    const totalValue = typeof data?.total === 'number' ? data.total : 0
    const resolvedPage = typeof data?.page === 'number' ? data.page : page.value
    const totalPagesValue = Math.max(1, Math.ceil(totalValue / pageSize))
    if (totalValue > 0 && resolvedPage > totalPagesValue) {
      page.value = totalPagesValue
      await fetchRequests()
      return
    }
    requests.value = items
    total.value = totalValue
    page.value = totalValue === 0 ? 1 : resolvedPage
  } catch (err) {
    error.value = err?.data?.statusMessage || 'Failed to load requests'
    requests.value = []
    total.value = 0
    page.value = 1
  } finally {
    loading.value = false
  }
}

function openReview(request) {
  selectedRequest.value = request
  actionError.value = ''
  rejectReason.value = ''
}

function closeReview() {
  selectedRequest.value = null
  actionError.value = ''
  rejectReason.value = ''
}

function setTab(tab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  page.value = 1
  clearSelection()
  closeReview()
  fetchRequests()
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  clearSelection()
  fetchRequests()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  clearSelection()
  fetchRequests()
}

async function acceptRequest() {
  if (!selectedRequest.value || actionLoading.value) return
  if (!canReview.value) return
  actionLoading.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/admin/cmoon-change-requests/${selectedRequest.value.id}/accept`, { method: 'POST' })
    closeReview()
    await fetchRequests()
  } catch (err) {
    actionError.value = err?.data?.statusMessage || 'Failed to accept request'
  } finally {
    actionLoading.value = false
  }
}

async function rejectRequest() {
  if (!selectedRequest.value || actionLoading.value) return
  if (!canReview.value) return
  const reason = rejectReason.value.trim()
  if (!reason) {
    actionError.value = 'Please enter a rejection reason to send to the player.'
    return
  }
  actionLoading.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/admin/cmoon-change-requests/${selectedRequest.value.id}/reject`, {
      method: 'POST',
      body: { reason },
    })
    closeReview()
    await fetchRequests()
  } catch (err) {
    actionError.value = err?.data?.statusMessage || 'Failed to reject request'
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
    await $fetch('/api/admin/cmoon-change-requests/bulk-accept', {
      method: 'POST',
      body: { ids: [...selectedIds.value] },
    })
    clearSelection()
    await fetchRequests()
  } catch (err) {
    bulkActionError.value = err?.data?.statusMessage || 'Failed to accept requests'
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
    await $fetch('/api/admin/cmoon-change-requests/bulk-reject', {
      method: 'POST',
      body: { ids: [...selectedIds.value], reason },
    })
    bulkRejectModalOpen.value = false
    bulkRejectReason.value = ''
    clearSelection()
    await fetchRequests()
  } catch (err) {
    bulkActionError.value = err?.data?.statusMessage || 'Failed to reject requests'
  } finally {
    bulkActionLoading.value = false
  }
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

onMounted(fetchRequests)
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

/* 44px minimum touch target on every interactive control, matching AdminCMoon.vue's .cm-tap
   convention (the ctoon-suggestions admin page this was cloned from falls short of it). */
.acr-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
</style>
