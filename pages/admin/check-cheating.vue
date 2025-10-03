<template>
  <div class="p-6 space-y-6">
    <Nav />

    <div class="max-w-3xl mx-auto mt-16">
      <h1 class="text-2xl font-bold mb-4">Check Cheating</h1>

      <form @submit.prevent="runCheck" class="space-y-4 bg-white border rounded p-4">
        <div>
          <label class="block text-sm font-medium mb-1">Target username</label>
          <input v-model.trim="target" class="w-full border rounded px-3 py-2" placeholder="e.g. LegendaryWarriorGuru" required />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Source usernames</label>
          <div class="flex gap-2">
            <input v-model.trim="sourceInput" class="flex-1 border rounded px-3 py-2" placeholder="Type a username and press Add" @keydown.enter.prevent="addSource" />
            <button type="button" class="px-3 py-2 border rounded" @click="addSource">Add</button>
            <button type="button" class="px-3 py-2 border rounded" @click="addMany">Add CSV</button>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <span v-for="(s,i) in sources" :key="s" class="inline-flex items-center gap-2 bg-gray-100 px-2 py-1 rounded">
              <span>{{ s }}</span>
              <button type="button" class="text-gray-600" @click="removeSource(i)">×</button>
            </span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button :disabled="loading || !target || sources.length===0" class="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">
            {{ loading ? 'Checking…' : 'Run check' }}
          </button>
          <span v-if="error" class="text-red-600 text-sm">{{ error }}</span>
        </div>
      </form>

      <div v-if="result" class="grid md:grid-cols-2 gap-4">
        <div class="p-4 border rounded bg-white">
          <h2 class="font-semibold mb-2">Summary</h2>
          <ul class="space-y-1 text-sm">
            <li><strong>Target:</strong> {{ result.target }}</li>
            <li><strong>Sources:</strong> {{ result.sources.join(', ') }}</li>
            <li><strong>Seed items:</strong> {{ result.seedCount }}</li>
            <li><strong>Currently owned by target:</strong> {{ result.currentOwnedCount }}</li>
            <li><strong>Auction points received:</strong> {{ result.auctionPoints }}</li>
            <li><strong>Trade value received:</strong> {{ result.tradeValue }}</li>
          </ul>

          <button
            class="mt-4 px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            :disabled="enforcing"
            @click="openEnforce()"
          >
            Auction cToons and Remove Points
          </button>
        </div>

        <div class="p-4 border rounded bg-white">
          <h2 class="font-semibold mb-2">By source</h2>
          <div v-if="result.bySource && Object.keys(result.bySource).length" class="space-y-2 text-sm">
            <div v-for="(row, name) in result.bySource" :key="name" class="flex justify-between bg-gray-50 p-2 rounded">
              <span class="font-medium">{{ name }}</span>
              <span>{{ row.seedCount }} seeds • {{ row.currentOwnedCount }} owned • {{ row.auctionPoints }} pts • {{ row.tradeValue }} value</span>
            </div>
          </div>
          <div v-else class="text-sm text-gray-500">No breakdown.</div>
        </div>

        <div class="md:col-span-2 p-4 border rounded bg-white">
          <h2 class="font-semibold mb-2">Debug</h2>
          <pre class="text-xs overflow-auto">{{ result }}</pre>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-xl p-5">
        <h3 class="text-lg font-semibold mb-2">Confirm Enforcement</h3>
        <p class="text-sm text-gray-700">
          Target <strong>{{ result?.target }}</strong>. Sources: <strong>{{ result?.sources?.join(', ') }}</strong>.
        </p>
        <p class="text-sm text-gray-700 mt-2">
          This will transfer the target’s relevant cToons to <strong>CartoonReOrbitOfficial</strong>,
          create 3-day auctions at rarity floor, and remove previously gained auction points.
        </p>
        <ul class="text-sm mt-3 space-y-1">
          <li>Seed items: <strong>{{ result?.seedCount }}</strong></li>
          <li>Currently owned by target: <strong>{{ result?.currentOwnedCount }}</strong></li>
          <li>Points to remove (max): <strong>{{ result?.auctionPoints }}</strong></li>
        </ul>

        <div v-if="enforceError" class="text-red-600 text-sm mt-3">{{ enforceError }}</div>
        <div v-if="enforceResult" class="text-sm mt-3">
          <div class="p-2 rounded bg-green-50 border">
            Done. Transferred: {{ enforceResult.transferredCount }}. Auctions created: {{ enforceResult.auctionsCreated }}. Points removed: {{ enforceResult.pointsRemoved }}.
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button class="px-4 py-2 border rounded" @click="closeEnforce" :disabled="enforcing">Cancel</button>
          <button
            class="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            :disabled="enforcing"
            @click="enforce()"
          >
            {{ enforcing ? 'Processing…' : 'Auction cToons and Remove Points' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const target = ref('')
const sourceInput = ref('')
const sources = ref([])
const loading = ref(false)
const error = ref('')
const result = ref(null)

const showModal = ref(false)
const enforcing = ref(false)
const enforceResult = ref(null)
const enforceError = ref('')

function addSource() {
  const v = sourceInput.value.trim()
  if (!v) return
  if (!sources.value.includes(v)) sources.value.push(v)
  sourceInput.value = ''
}
function addMany() {
  const parts = sourceInput.value.split(',').map(s => s.trim()).filter(Boolean)
  for (const p of parts) if (!sources.value.includes(p)) sources.value.push(p)
  sourceInput.value = ''
}
function removeSource(i) { sources.value.splice(i,1) }

async function runCheck() {
  error.value = ''
  result.value = null
  loading.value = true
  try {
    const res = await fetch('/api/admin/check-cheating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ target: target.value, sources: sources.value })
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.statusMessage || `HTTP ${res.status}`)
    }
    result.value = await res.json()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function openEnforce() {
  enforceResult.value = null
  enforceError.value = ''
  showModal.value = true
}
function closeEnforce() {
  if (enforcing.value) return
  showModal.value = false
}

async function enforce() {
  if (!result.value) return
  enforcing.value = true
  enforceError.value = ''
  enforceResult.value = null
  try {
    const res = await fetch('/api/admin/remove-cheating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ target: result.value.target, sources: result.value.sources })
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.statusMessage || `HTTP ${res.status}`)
    }
    const j = await res.json()
    enforceResult.value = j
    // refresh summary
    await runCheck()
  } catch (e) {
    enforceError.value = e.message
  } finally {
    enforcing.value = false
  }
}
</script>
