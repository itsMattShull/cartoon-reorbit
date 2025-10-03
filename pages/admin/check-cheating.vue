<template>
  <div class="p-6 space-y-6">
    <Nav />

    <div class="max-w-3xl mx-auto mt-16">
      <h1 class="text-2xl font-bold mb-4">Check Cheating</h1>

      <form @submit.prevent="runCheck" class="space-y-4 bg-white border rounded p-4">
        <!-- Target -->
        <div class="relative">
          <label class="block text-sm font-medium mb-1">Target username</label>
          <input
            v-model.trim="target"
            class="w-full border rounded px-3 py-2"
            placeholder="e.g. LegendaryWarriorGuru"
            required
            @focus="targetFocused = true"
            @blur="() => setTimeout(() => targetFocused = false, 100)"
          />
          <!-- Target suggestions -->
          <div
            v-if="targetFocused && targetSuggestions.length"
            class="absolute z-10 mt-1 w-full bg-white border rounded shadow"
          >
            <button
              v-for="u in targetSuggestions"
              :key="u.id"
              type="button"
              class="w-full text-left px-3 py-2 hover:bg-gray-50"
              @click="selectTarget(u.username)"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">{{ u.username }}</span>
                <span class="text-xs text-gray-500">{{ u.points }} pts • {{ u.totalCtoons }} cToons</span>
              </div>
              <div class="text-xs text-gray-500">{{ u.discordTag }}</div>
            </button>
          </div>
        </div>

        <!-- Sources -->
        <div class="relative">
          <label class="block text-sm font-medium mb-1">Source usernames</label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                v-model.trim="sourceInput"
                class="w-full border rounded px-3 py-2"
                placeholder="Type a username and press Add"
                @keydown.enter.prevent="addSource"
                @focus="sourceFocused = true"
                @blur="() => setTimeout(() => sourceFocused = false, 100)"
              />
              <!-- Source suggestions -->
              <div
                v-if="sourceFocused && sourceSuggestions.length"
                class="absolute z-10 mt-1 w-full bg-white border rounded shadow"
              >
                <button
                  v-for="u in sourceSuggestions"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-3 py-2 hover:bg-gray-50"
                  @click="addSourceFromSuggestion(u.username)"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium">{{ u.username }}</span>
                    <span class="text-xs text-gray-500">{{ u.points }} pts • {{ u.totalCtoons }} cToons</span>
                  </div>
                  <div class="text-xs text-gray-500">{{ u.discordTag }}</div>
                </button>
              </div>
            </div>
            <button type="button" class="px-3 py-2 border rounded" @click="addSource">Add</button>
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
            :disabled="!result || enforcing"
            @click="openPreview()"
          >
            Auction cToons and Remove Points
          </button>
        </div>

        <!-- Review + Confirm Modal -->
        <div v-if="showPreview" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl p-5 max-h-[90vh] overflow-auto">
            <h3 class="text-lg font-semibold">Review Removal</h3>

            <div class="mt-3">
              <p class="text-sm"><strong>Deactivate accounts:</strong>
                <span v-if="result?.preview?.deactivationUsernames?.length">
                  {{ result.preview.deactivationUsernames.join(', ') }}
                </span>
                <span v-else>—</span>
              </p>
              <p class="text-sm mt-1"><strong>Points to remove from {{ result?.target }}:</strong> {{ result?.preview?.pointsToRemove ?? 0 }}</p>
            </div>

            <div class="mt-4">
              <h4 class="font-medium">cToons to transfer and auction</h4>
              <p class="text-xs text-gray-500 mb-2">Includes target’s relevant items and all source-owned items.</p>

              <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div
                  v-for="it in allPreviewItems"
                  :key="it.id"
                  class="border rounded p-2 bg-gray-50"
                >
                  <div class="aspect-square bg-white border rounded mb-2 flex items-center justify-center overflow-hidden">
                    <img
                      v-if="it.ctoon?.assetPath"
                      :src="imgUrl(it.ctoon.assetPath)"
                      :alt="it.ctoon?.name || 'cToon'"
                      class="object-contain w-full h-full"
                    />
                    <div v-else class="text-xs text-gray-400">No image</div>
                  </div>
                  <div class="text-sm font-medium truncate">{{ it.ctoon?.name || 'cToon' }}</div>
                  <div class="text-xs text-gray-600">Rarity: {{ it.ctoon?.rarity || '—' }}</div>
                  <div class="text-xs">Owner: <span class="font-mono">{{ it.user?.username || '—' }}</span></div>
                  <div class="text-xs">Mint #: <span class="font-mono">{{ it.mintNumber ?? '—' }}</span></div>
                </div>
              </div>
            </div>

            <div v-if="enforceError" class="text-red-600 text-sm mt-3">{{ enforceError }}</div>
            <div v-if="enforceResult" class="text-sm mt-3">
              <div class="p-2 rounded bg-green-50 border">
                Done. Transferred: {{ enforceResult.transferredCount }} • Target auctions: {{ enforceResult.auctionsCreated }} • Source transfers: {{ enforceResult.sourceTransferredCount }} • Source auctions: {{ enforceResult.sourceAuctionsCreated }} • Points removed: {{ enforceResult.pointsRemoved }}
              </div>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <button class="px-4 py-2 border rounded" @click="closePreview" :disabled="enforcing">Cancel</button>
              <button
                class="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
                :disabled="enforcing"
                @click="enforce()"
              >
                {{ enforcing ? 'Processing…' : 'Confirm Remove' }}
              </button>
            </div>
          </div>
        </div>

        <div class="p-4 border rounded bg-white">
          <h2 class="font-semibold mb-2">By source</h2>
          <div v-if="result.bySource && Object.keys(result.bySource).length" class="space-y-2 text-sm">
            <div v-for="(row, name) in result.bySource" :key="name" class="flex flex-col justify-between bg-gray-50 p-2 rounded">
              <div class="font-medium">{{ name }}</div>
              <span>{{ row.seedCount }} cToons<br>{{ row.currentOwnedCount }} of those cToons are currently owned by {{ result.target }}<br>Auction Points: {{ row.auctionPoints }} pts received<br>Trade Value: {{ row.tradeValue }} points in trade value received</span>
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

    <!-- Legacy modal kept (unused if using preview) -->
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
import { ref, computed, watch } from 'vue'
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
const showPreview = ref(false)

// --- Username suggestions state ---
const usersLoaded = ref(false)
const allUsers = ref([]) // [{id, username, ...}]
const targetFocused = ref(false)
const sourceFocused = ref(false)
const targetSuggestions = ref([])
const sourceSuggestions = ref([])

// fetch all users once, on demand
async function ensureUsersLoaded() {
  if (usersLoaded.value) return
  const res = await fetch('/api/admin/users', { credentials: 'include' })
  if (!res.ok) return
  allUsers.value = (await res.json())?.filter(u => u?.username) || []
  usersLoaded.value = true
}

// normalize
const norm = s => (s || '').toLowerCase()

// recompute suggestions after 3+ chars
watch(target, async (v) => {
  const q = norm(v)
  if (q.length < 3) { targetSuggestions.value = []; return }
  await ensureUsersLoaded()
  targetSuggestions.value = allUsers.value
    .filter(u => norm(u.username).includes(q))
    .slice(0, 10)
})

watch(sourceInput, async (v) => {
  const q = norm(v)
  if (q.length < 3) { sourceSuggestions.value = []; return }
  await ensureUsersLoaded()
  sourceSuggestions.value = allUsers.value
    .filter(u =>
      norm(u.username).includes(q) &&
      u.username !== target.value &&
      !sources.value.includes(u.username)
    )
    .slice(0, 10)
})

function selectTarget(name) {
  target.value = name
  targetSuggestions.value = []
}

function addSourceFromSuggestion(name) {
  if (!sources.value.includes(name)) sources.value.push(name)
  sourceInput.value = ''
  sourceSuggestions.value = []
}

// merge preview items for display
const allPreviewItems = computed(() => {
  const p = result.value?.preview
  if (!p) return []
  return [...(p.targetItems || []), ...(p.sourceItems || [])]
})

function imgUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const base =
    (import.meta.env.PUBLIC_BASE_URL) ||
    (import.meta.env.PROD ? 'https://www.cartoonreorbit.com' : `http://localhost:${import.meta.env.VITE_SOCKET_PORT || 3000}`)
  return `${base}${path}`
}

function openPreview() {
  enforceResult.value = null
  enforceError.value = ''
  showPreview.value = true
}
function closePreview() {
  if (enforcing.value) return
  showPreview.value = false
}

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
    await runCheck()
  } catch (e) {
    enforceError.value = e.message
  } finally {
    enforcing.value = false
  }
}
</script>
