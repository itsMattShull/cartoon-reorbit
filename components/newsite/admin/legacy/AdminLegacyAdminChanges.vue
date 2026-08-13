<template>

  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">
      <h1 class="text-base font-semibold mb-3">Admin: Admin Changes</h1>

      <div class="bg-white rounded border p-3">
        <!-- Filters -->
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end mb-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Admin</label>
            <select v-model="filters.userId" class="text-xs border rounded-md px-1.5 py-1">
              <option value="">All admins</option>
              <option v-for="u in adminUsers" :key="u.id" :value="u.id">{{ u.username || u.discordTag || u.id }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Target user</label>
            <input
              v-model.trim="filters.targetUsername"
              type="text"
              placeholder="Username affected"
              class="text-xs border rounded-md px-1.5 py-1"
              @keydown.enter="applyFilters"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Start date</label>
            <input type="date" v-model="filters.startDate" class="text-xs border rounded-md px-1.5 py-1" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">End date</label>
            <input type="date" v-model="filters.endDate" class="text-xs border rounded-md px-1.5 py-1" />
          </div>
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="applyFilters">Apply</button>
            <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="clearFilters">Clear</button>
          </div>
        </div>

        <div v-if="loading" class="text-center text-gray-500 py-6">Loading…</div>

        <template v-else>
          <!-- Desktop table -->
          <div class="hidden md:block overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead>
                <tr>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">When (CDT)</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Admin</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Target</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Area</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Key</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Previous</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">New</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <template v-for="row in rows" :key="row.id">
                  <tr class="align-top">
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ row.createdAtCdt }}</td>
                    <td class="px-2 py-1.5 break-words">{{ labelUser(row.user) }}</td>
                    <td class="px-2 py-1.5 break-words">{{ row.targetUsername || '—' }}</td>
                    <td class="px-2 py-1.5 break-words">{{ row.area }}</td>
                    <td class="px-2 py-1.5 break-words">{{ row.key }}</td>
                    <td class="px-2 py-1.5 text-gray-700 break-words">
                      <pre v-if="!row.seizure" class="whitespace-pre-wrap">{{ row.prevValue ?? '—' }}</pre>
                      <span v-else class="text-[10px] text-gray-400">—</span>
                    </td>
                    <td class="px-2 py-1.5 text-gray-900 break-words min-w-0">
                      <template v-if="row.seizure">
                        <div>{{ seizureSummary(row.seizure) }}</div>
                        <button class="mt-1 text-blue-600 text-[11px] underline" @click="toggleExpand(row.id)">
                          {{ expandedIds.has(row.id) ? 'Hide details' : 'Show details' }}
                        </button>
                      </template>
                      <pre v-else class="whitespace-pre-wrap">{{ row.newValue ?? '—' }}</pre>
                    </td>
                  </tr>
                  <tr v-if="row.seizure && expandedIds.has(row.id)" class="bg-blue-50/40">
                    <td colspan="7" class="px-2 py-2">
                      <SeizureDetail :seizure="row.seizure" />
                    </td>
                  </tr>
                </template>
                <tr v-if="!rows.length">
                  <td colspan="7" class="px-2 py-6 text-center text-gray-500">No changes found.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="md:hidden grid grid-cols-1 gap-2">
            <div v-for="row in rows" :key="row.id" class="bg-white border rounded-lg shadow p-2">
              <div class="text-[10px] text-gray-500">{{ row.createdAtCdt }}</div>
              <div class="text-xs font-medium break-words">{{ labelUser(row.user) }}</div>
              <div class="text-[11px] text-gray-700 break-words">{{ row.area }} · {{ row.key }}</div>
              <div v-if="row.targetUsername" class="text-[10px] text-gray-500 break-words">Target: {{ row.targetUsername }}</div>

              <template v-if="row.seizure">
                <div class="mt-1 text-[11px] break-words">{{ seizureSummary(row.seizure) }}</div>
                <button class="mt-1 text-blue-600 text-[11px] underline" @click="toggleExpand(row.id)">
                  {{ expandedIds.has(row.id) ? 'Hide details' : 'Show details' }}
                </button>
                <div v-if="expandedIds.has(row.id)" class="mt-1 pt-1 border-t">
                  <SeizureDetail :seizure="row.seizure" />
                </div>
              </template>

              <div v-else class="mt-1 grid grid-cols-1 gap-1">
                <div>
                  <div class="text-[10px] text-gray-500">Previous</div>
                  <div class="text-[11px] break-words"><pre class="whitespace-pre-wrap">{{ row.prevValue ?? '—' }}</pre></div>
                </div>
                <div>
                  <div class="text-[10px] text-gray-500">New</div>
                  <div class="text-[11px] break-words"><pre class="whitespace-pre-wrap">{{ row.newValue ?? '—' }}</pre></div>
                </div>
              </div>
            </div>
            <div v-if="!rows.length" class="text-center text-gray-500 py-4">No changes found.</div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue'

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

