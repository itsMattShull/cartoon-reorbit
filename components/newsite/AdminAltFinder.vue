<template>
  <div>
    <!-- Search -->
    <div class="bg-white border rounded shadow p-2 mb-2">
      <div class="flex flex-col sm:flex-row gap-2">
        <div class="flex-1">
          <label class="block text-[11px] font-medium text-gray-600 mb-0.5">Banned account to investigate</label>
          <input
            v-model.trim="suspect"
            type="text"
            placeholder="e.g. ZenVikingGuru"
            class="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            @keydown.enter.prevent="run()"
          />
        </div>
        <div class="flex-1">
          <label class="block text-[11px] font-medium text-gray-600 mb-0.5">
            Known alts <span class="font-normal text-gray-400">(comma separated — widens the net a lot)</span>
          </label>
          <input
            v-model.trim="knownAlts"
            type="text"
            placeholder="LoopyWarriorWarrior, GalaxyJumperDruid"
            class="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            @keydown.enter.prevent="run()"
          />
        </div>
        <div class="flex items-end gap-1">
          <button
            type="button"
            class="min-h-[32px] px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white disabled:opacity-50"
            :disabled="loading || !suspect"
            @click="run()"
          >
            {{ loading ? 'Investigating…' : 'Investigate' }}
          </button>
          <button
            type="button"
            class="min-h-[32px] px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            :disabled="loading || !report"
            title="Ignore the cached result and recompute"
            @click="run(true)"
          >
            Recompute
          </button>
        </div>
      </div>
      <p v-if="error" class="mt-1 text-[11px] text-red-600">{{ error }}</p>
    </div>

    <div v-if="loading" class="text-gray-500 py-6 text-center">Gathering evidence…</div>

    <template v-else-if="report">
      <!-- Suspect summary -->
      <div class="bg-white border rounded shadow p-2 mb-2">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 class="font-semibold text-xs">{{ report.suspect.username }}</h2>
          <span class="text-[10px]" :class="report.suspect.banned ? 'text-red-600' : 'text-gray-500'">
            {{ report.suspect.banned ? 'banned' : 'not banned' }}
          </span>
          <span class="text-[10px] text-gray-500">
            ban recorded: {{ report.suspect.banAt ? formatDate(report.suspect.banAt) : 'unknown' }}
          </span>
          <span class="text-[10px] text-gray-500">
            {{ formatNumber(report.candidatesConsidered) }} candidates scored of {{ formatNumber(report.userCount) }} users
          </span>
        </div>
        <p v-if="report.suspect.knownAlts?.length" class="mt-0.5 text-[10px] text-gray-500">
          Seed cluster: {{ [report.suspect.username, ...report.suspect.knownAlts].join(', ') }}
        </p>
        <p v-if="!report.suspect.banAt" class="mt-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          No ban note found for this account, so every date-relative signal is disabled. Record the ban in
          Manage Users to sharpen the results.
        </p>
      </div>

      <!-- Coverage: absence of evidence is not evidence of absence -->
      <div class="bg-white border rounded shadow p-2 mb-2">
        <h3 class="font-semibold text-[11px] mb-1">Evidence available for the seed cluster</h3>
        <div class="flex flex-wrap gap-1">
          <span
            v-for="c in report.coverage"
            :key="c.key"
            class="text-[10px] px-1.5 py-0.5 rounded border"
            :class="c.available
              ? 'bg-gray-50 border-gray-200 text-gray-600'
              : 'bg-amber-50 border-amber-300 text-amber-800'"
          >
            {{ c.label }}: {{ c.available ? formatNumber(c.rows) + ' rows' : 'no data' }}
          </span>
        </div>
        <p v-if="missingCoverage.length" class="mt-1 text-[10px] text-amber-800">
          No data for {{ missingCoverage.join(', ') }} — a zero score on
          {{ missingCoverage.length > 1 ? 'those channels' : 'that channel' }} means nothing was recorded,
          not that the accounts differ.
        </p>
      </div>

      <!-- No results is a real answer -->
      <div
        v-if="!items.length"
        class="bg-white border rounded shadow p-4 text-center"
      >
        <p class="text-xs font-medium text-gray-700">No account met the evidence threshold.</p>
        <p class="mt-1 text-[11px] text-gray-500">
          This is a result, not a failure — the evidence does not support naming anyone.
          Adding known alts above, or waiting for more activity, may change it.
        </p>
      </div>

      <!-- Ranked candidates -->
      <div v-else class="space-y-2">
        <div
          v-for="(item, idx) in items"
          :key="item.userId"
          class="bg-white border rounded shadow p-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-[10px] text-gray-400">#{{ (page - 1) * limit + idx + 1 }}</span>
                <h3 class="font-semibold text-xs truncate">{{ item.username }}</h3>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  :class="tierClass(item.tier)"
                >{{ tierLabel(item.tier) }}</span>
              </div>
              <div class="mt-0.5 text-[10px] text-gray-500">
                {{ item.bits }} bits &middot; {{ item.corroboratingChannels }} independent
                {{ item.corroboratingChannels === 1 ? 'channel' : 'channels' }}
                <span v-if="item.surfacedBy?.length"> &middot; surfaced by {{ item.surfacedBy.join(', ') }}</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button"
                class="min-h-[32px] px-2 py-0.5 text-[11px] rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                @click="toggle(item.userId)"
              >
                {{ expanded[item.userId] ? 'Hide' : 'Why?' }}
              </button>
            </div>
          </div>

          <!-- Evidence breakdown -->
          <div v-if="expanded[item.userId]" class="mt-2 border-t pt-2 space-y-1.5">
            <div v-for="(data, channel) in item.channels" :key="channel">
              <div class="flex items-baseline gap-1.5">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ channel }}</span>
                <span class="text-[10px]" :class="data.bits >= 0 ? 'text-gray-600' : 'text-green-700'">
                  {{ data.bits >= 0 ? '+' : '' }}{{ data.bits }} bits
                </span>
              </div>
              <ul class="mt-0.5 space-y-0.5">
                <li v-for="sig in data.signals" :key="sig.key" class="text-[11px]">
                  <span
                    class="font-mono"
                    :class="sig.bits >= 0 ? 'text-gray-800' : 'text-green-700'"
                  >{{ sig.bits >= 0 ? '+' : '' }}{{ sig.bits }}</span>
                  <span class="ml-1 text-gray-700">{{ sig.label }}</span>
                  <p v-if="sig.caveat" class="ml-5 text-[10px] text-amber-700">⚠ {{ sig.caveat }}</p>
                  <p v-if="sig.detail" class="ml-5 text-[10px] text-gray-500 break-words">
                    {{ summarize(sig) }}
                  </p>
                </li>
              </ul>
            </div>

            <!-- Hand off to the existing enforcement tools; this tool never acts -->
            <div class="pt-1 border-t flex flex-wrap gap-2">
              <NuxtLink
                :to="`/admin/check-cheating?target=${encodeURIComponent(item.username)}&sources=${encodeURIComponent(report.suspect.username)}`"
                class="text-[11px] text-indigo-600 hover:underline"
              >Quantify in Check Cheating →</NuxtLink>
              <NuxtLink
                to="/newsite/admin/manageUsers"
                class="text-[11px] text-indigo-600 hover:underline"
              >Manage Users →</NuxtLink>
              <NuxtLink
                to="/newsite/admin/deviceFingerprints"
                class="text-[11px] text-indigo-600 hover:underline"
              >Browser Fingerprints →</NuxtLink>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="total > limit" class="flex items-center justify-between">
          <div class="text-[11px] text-gray-600">Page {{ page }} of {{ totalPages }}</div>
          <div class="space-x-1">
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="go(page - 1)">Prev</button>
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="go(page + 1)">Next</button>
          </div>
        </div>
      </div>

      <p class="mt-2 text-[10px] text-gray-500 leading-relaxed">
        Scores are log2 likelihood ratios: 20 bits is roughly a million to one against coincidence.
        Negative signals argue <em>against</em> a match. A high score is a reason to review the
        evidence, never a substitute for doing so — browser fingerprints in particular are supplied
        by the client and can be forged.
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'

const suspect = ref('')
const knownAlts = ref('')
const loading = ref(false)
const error = ref('')
const report = ref(null)
const items = ref([])
const total = ref(0)
const page = ref(1)
const limit = 50
const expanded = reactive({})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const missingCoverage = computed(() =>
  (report.value?.coverage || []).filter((c) => !c.available).map((c) => c.label.toLowerCase())
)

const TIER_LABELS = {
  compelling: 'Compelling',
  strong: 'Strong',
  possible: 'Possible',
  weak: 'Weak',
  noise: 'Not significant'
}
function tierLabel(t) {
  return TIER_LABELS[t] || t
}
function tierClass(t) {
  if (t === 'compelling') return 'bg-red-100 text-red-800'
  if (t === 'strong') return 'bg-orange-100 text-orange-800'
  if (t === 'possible') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatNumber(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}

// Render the per-signal detail without ever printing a raw identifier.
function summarize(sig) {
  const d = sig.detail || {}
  if (d.ips) return d.ips.map((i) => `${i.ip} (shared by ${i.sharedBy}${i.vpn ? ', VPN exit' : ''})`).join(', ')
  if (d.subnets) return d.subnets.map((s) => `${s.subnet} (${s.sharedBy} users)`).join(', ')
  if (d.fingerprints) return d.fingerprints.map((f) => `${f.prefix}… (${f.sharedBy} accounts)`).join(', ')
  if (d.contacts) return d.contacts.map((c) => `${c.username} ×${c.interactions}`).join(', ')
  if (d.items && d.totalItems) return `${d.totalItems} item(s): ` + d.items.map((i) => `${i.name} #${i.mintNumber}`).join(', ')
  if (d.barcodes) return d.barcodes.map((b) => `${b.label} (${b.scannedBy} scanners)`).join(', ')
  if (d.partners) return d.partners.map((p) => p.username).join(', ')
  if (d.sharedCards) return `${d.sharedCount} cards in common`
  if (d.daysAfterBan != null) return `Discord account created ${d.daysAfterBan} days after the ban`
  if (d.yearsBeforeBan != null) return `Discord account created ${d.yearsBeforeBan} years before the ban`
  if (d.rate != null) return `active together in ${d.concurrentWindows}/${d.comparableWindows} windows`
  if (d.match) return `match: ${d.match}`
  return ''
}

function toggle(id) {
  expanded[id] = !expanded[id]
}

function go(p) {
  page.value = p
  fetchPage()
}

async function run(force = false) {
  page.value = 1
  await fetchPage(force)
}

async function fetchPage(force = false) {
  if (!suspect.value) return
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      username: suspect.value,
      page: String(page.value),
      limit: String(limit)
    })
    if (knownAlts.value) params.set('knownAlts', knownAlts.value)
    if (force) params.set('force', '1')

    const res = await fetch(`/api/admin/alt-finder/investigate?${params.toString()}`, {
      credentials: 'include'
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      error.value = body?.statusMessage || body?.message || `Request failed (${res.status})`
      report.value = null
      items.value = []
      total.value = 0
      return
    }
    const data = await res.json()
    report.value = data
    items.value = data.items || []
    total.value = data.total || 0
    if (data.page) page.value = data.page
  } catch (e) {
    console.error('Alt finder request failed', e)
    error.value = 'Request failed.'
    report.value = null
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}
</script>
