<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Admin Changes</h1>

    <div class="bg-white rounded-lg shadow-md p-4 md:p-6 max-w-6xl mx-auto">
      <!-- Filters -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-4 md:mb-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Admin</label>
          <select v-model="filters.userId" class="input">
            <option value="">All admins</option>
            <option v-for="u in adminUsers" :key="u.id" :value="u.id">{{ u.username || u.discordTag || u.id }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Target user</label>
          <input
            v-model.trim="filters.targetUsername"
            type="text"
            placeholder="Username affected"
            class="input"
            @keydown.enter="applyFilters"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Start date</label>
          <input type="date" v-model="filters.startDate" class="input" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">End date</label>
          <input type="date" v-model="filters.endDate" class="input" />
        </div>
        <div class="flex items-end gap-2">
          <button class="btn-primary w-full" @click="applyFilters">Apply</button>
          <button class="btn-secondary" @click="clearFilters">Clear</button>
        </div>
      </div>

      <div v-if="loading" class="text-center text-gray-500 py-6">Loading…</div>

      <template v-else>
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-gray-600 border-b">
                <th class="px-3 py-2">When (CDT)</th>
                <th class="px-3 py-2">Admin</th>
                <th class="px-3 py-2">Target</th>
                <th class="px-3 py-2">Area</th>
                <th class="px-3 py-2">Key</th>
                <th class="px-3 py-2">Previous</th>
                <th class="px-3 py-2">New</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in rows" :key="row.id">
                <tr class="border-b align-top">
                  <td class="px-3 py-2 whitespace-nowrap">{{ row.createdAtCdt }}</td>
                  <td class="px-3 py-2 break-words">{{ labelUser(row.user) }}</td>
                  <td class="px-3 py-2 break-words">{{ row.targetUsername || '—' }}</td>
                  <td class="px-3 py-2 break-words">{{ row.area }}</td>
                  <td class="px-3 py-2 break-words">{{ row.key }}</td>
                  <td class="px-3 py-2 text-gray-700 break-words">
                    <pre v-if="!row.seizure" class="whitespace-pre-wrap">{{ row.prevValue ?? '—' }}</pre>
                    <span v-else class="text-xs text-gray-400">—</span>
                  </td>
                  <td class="px-3 py-2 text-gray-900 break-words min-w-0">
                    <template v-if="row.seizure">
                      <div>{{ seizureSummary(row.seizure) }}</div>
                      <button class="mt-1 text-indigo-600 text-xs underline" @click="toggleExpand(row.id)">
                        {{ expandedIds.has(row.id) ? 'Hide details' : 'Show details' }}
                      </button>
                    </template>
                    <pre v-else class="whitespace-pre-wrap">{{ row.newValue ?? '—' }}</pre>
                  </td>
                </tr>
                <tr v-if="row.seizure && expandedIds.has(row.id)" class="border-b bg-indigo-50/40">
                  <td colspan="7" class="px-3 py-3">
                    <SeizureDetail :seizure="row.seizure" />
                  </td>
                </tr>
              </template>
              <tr v-if="!rows.length">
                <td colspan="7" class="px-3 py-6 text-center text-gray-500">No changes found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden space-y-3">
          <div v-for="row in rows" :key="row.id" class="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div class="text-xs text-gray-500">{{ row.createdAtCdt }}</div>
            <div class="font-medium break-words">{{ labelUser(row.user) }}</div>
            <div class="text-sm text-gray-700 break-words">{{ row.area }} · {{ row.key }}</div>
            <div v-if="row.targetUsername" class="text-xs text-gray-500 break-words">Target: {{ row.targetUsername }}</div>

            <template v-if="row.seizure">
              <div class="mt-2 text-sm break-words">{{ seizureSummary(row.seizure) }}</div>
              <button class="mt-1 text-indigo-600 text-xs underline" @click="toggleExpand(row.id)">
                {{ expandedIds.has(row.id) ? 'Hide details' : 'Show details' }}
              </button>
              <div v-if="expandedIds.has(row.id)" class="mt-2 pt-2 border-t border-gray-200">
                <SeizureDetail :seizure="row.seizure" />
              </div>
            </template>

            <div v-else class="mt-2 grid grid-cols-1 gap-2">
              <div>
                <div class="text-xs text-gray-500">Previous</div>
                <div class="text-sm break-words"><pre class="whitespace-pre-wrap">{{ row.prevValue ?? '—' }}</pre></div>
              </div>
              <div>
                <div class="text-xs text-gray-500">New</div>
                <div class="text-sm break-words"><pre class="whitespace-pre-wrap">{{ row.newValue ?? '—' }}</pre></div>
              </div>
            </div>
          </div>
          <div v-if="!rows.length" class="text-center text-gray-500 py-4">No changes found.</div>
        </div>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - Admin Changes', middleware: ['auth','admin'], layout: 'admin' })

// Shared, mobile-friendly renderer for the "seized points/cToons" detail
// panel used by both the dissolve worker and the cheating-tool flows.
// Kept as a tiny local component (not a full SFC) since it's only used here.
const SeizureDetail = {
  props: { seizure: { type: Object, required: true } },
  setup(props) {
    return () => {
      const s = props.seizure
      return h('div', { class: 'space-y-3' }, [
        h('div', { class: 'text-sm text-gray-700 break-words' }, [
          h('span', { class: 'font-medium' }, `${(s.pointsRemoved || 0).toLocaleString()} pts`),
          ' removed from ',
          h('span', { class: 'font-medium break-words' }, s.target || '—'),
          s.pointsRecipient ? ` → ${s.pointsRecipient}` : ''
        ]),
        s.involvedAccounts?.length
          ? h('div', { class: 'text-xs text-gray-500 break-words' }, [
              'Involved accounts: ',
              s.involvedAccounts.join(', ')
            ])
          : null,
        s.accountsDeactivated?.length
          ? h('div', { class: 'flex flex-wrap gap-1' }, s.accountsDeactivated.map(u =>
              h('span', { key: u, class: 'inline-block bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded break-words' }, `${u} deactivated`)
            ))
          : null,
        h('div', {}, [
          h('div', { class: 'text-xs font-medium text-gray-500 mb-1' }, [
            `cToons (${s.totalCtoons ?? (s.ctoons || []).length}`,
            s.ctoonsTruncated ? `, showing first ${(s.ctoons || []).length}` : '',
            ')'
          ]),
          (s.ctoons || []).length
            ? h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1' },
                (s.ctoons || []).map((c, i) =>
                  h('div', { key: i, class: 'border rounded px-2 py-1.5 bg-white text-xs min-w-0' }, [
                    h('div', { class: 'font-medium truncate' }, c.name || 'cToon'),
                    h('div', { class: 'text-gray-500 flex flex-wrap gap-x-2' }, [
                      c.rarity ? h('span', {}, c.rarity) : null,
                      c.mintNumber != null ? h('span', {}, `Mint #${c.mintNumber}`) : null
                    ]),
                    h('div', { class: 'text-gray-400 break-words' }, `from ${c.takenFromUsername || '—'}`)
                  ])
                )
              )
            : h('div', { class: 'text-xs text-gray-400' }, 'No cToons recorded.')
        ])
      ])
    }
  }
}

const rows = ref([])
const adminUsers = ref([])
const loading = ref(false)
const filters = ref({ userId: '', targetUsername: '', startDate: '', endDate: '' })
const expandedIds = ref(new Set())

function buildQuery() {
  const q = {}
  if (filters.value.userId) q.userId = filters.value.userId
  if (filters.value.targetUsername) q.targetUsername = filters.value.targetUsername
  // pass ISO strings if dates present, covering the whole day
  if (filters.value.startDate) q.start = `${filters.value.startDate}T00:00:00`
  if (filters.value.endDate)   q.end   = `${filters.value.endDate}T23:59:59.999`
  return q
}

function labelUser(u) {
  return u?.username || u?.discordTag || u?.id || 'Unknown'
}

// Rows whose newValue is a structured "seizure" payload (dissolve /
// cheating-tool actions) get a `seizure` field attached for rendering;
// everything else keeps the original raw prevValue/newValue display.
function parseSeizure(newValue) {
  if (!newValue) return null
  try {
    const parsed = JSON.parse(newValue)
    if (parsed && Array.isArray(parsed.ctoons)) return parsed
  } catch {}
  return null
}

function seizureSummary(s) {
  const parts = [`${s.totalCtoons ?? (s.ctoons || []).length} cToon${(s.totalCtoons ?? 0) === 1 ? '' : 's'}`]
  if (s.pointsRemoved) parts.push(`${s.pointsRemoved.toLocaleString()} pts`)
  parts.push(`→ ${s.pointsRecipient || 'official account'}`)
  if (s.accountsDeactivated?.length) parts.push(`${s.accountsDeactivated.length} account(s) deactivated`)
  return parts.join(' · ')
}

function toggleExpand(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

async function loadAdmins() {
  try {
    const list = await $fetch('/api/admin/users')
    adminUsers.value = (list || []).filter(u => u.isAdmin)
  } catch {}
}

async function loadRows() {
  loading.value = true
  try {
    const data = await $fetch('/api/admin/admin-changes', { params: buildQuery() })
    rows.value = (data || []).map(r => ({ ...r, seizure: parseSeizure(r.newValue) }))
  } catch (e) {
    console.error('Failed to load admin changes', e)
    rows.value = []
  } finally {
    loading.value = false
  }
}

function applyFilters() { loadRows() }
function clearFilters() {
  filters.value = { userId: '', targetUsername: '', startDate: '', endDate: '' }
  loadRows()
}

onMounted(async () => {
  await loadAdmins()
  await loadRows()
})
</script>

<style scoped>
.input { width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.btn-secondary{ background-color:#E5E7EB; color:#374151; padding:.5rem 1rem; border-radius:.375rem }
</style>
