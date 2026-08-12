<template>
  <div class="bg-gray-50 text-xs">

    <div class="px-2 py-2 max-w-3xl mx-auto">
      <h1 class="text-base font-semibold mb-3">Check Cheating</h1>

      <form @submit.prevent="runCheck" class="bg-white rounded border p-3 space-y-3">
        <!-- Target -->
        <div class="relative flex flex-col gap-1">
          <label class="text-xs font-medium">Target username</label>
          <input
            ref="targetInputEl"
            v-model.trim="target"
            class="border rounded-md px-2 py-1.5 text-sm"
            placeholder="e.g. LegendaryWarriorGuru"
            required
            @focus="targetFocused = true"
            @blur="() => setTimeout(() => targetFocused = false, 100)"
          />
          <!-- Target suggestions -->
          <div
            v-if="targetFocused && targetSuggestions.length"
            class="absolute z-10 top-full mt-1 w-full bg-white border rounded-md shadow"
          >
            <button
              v-for="u in targetSuggestions"
              :key="u.id"
              type="button"
              class="w-full text-left px-2 py-1.5 hover:bg-gray-50"
              @click="selectTarget(u.username)"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium text-xs">{{ u.username }}</span>
                <span class="text-[10px] text-gray-500">{{ u.points }} pts • {{ u.totalCtoons }} cToons</span>
              </div>
              <div class="text-[10px] text-gray-500">{{ u.discordTag }}</div>
            </button>
          </div>
        </div>

        <!-- Sources -->
        <div class="relative flex flex-col gap-1">
          <label class="text-xs font-medium">Source usernames</label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                v-model.trim="sourceInput"
                class="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="Type a username and press Add"
                @keydown.enter.prevent="addSource"
                @focus="sourceFocused = true"
                @blur="() => setTimeout(() => sourceFocused = false, 100)"
              />
              <!-- Source suggestions -->
              <div
                v-if="sourceFocused && sourceSuggestions.length"
                class="absolute z-10 top-full mt-1 w-full bg-white border rounded-md shadow"
              >
                <button
                  v-for="u in sourceSuggestions"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-2 py-1.5 hover:bg-gray-50"
                  @click="addSourceFromSuggestion(u.username)"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-xs">{{ u.username }}</span>
                    <span class="text-[10px] text-gray-500">{{ u.points }} pts • {{ u.totalCtoons }} cToons</span>
                  </div>
                  <div class="text-[10px] text-gray-500">{{ u.discordTag }}</div>
                </button>
              </div>
            </div>
            <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="addSource">Add</button>
          </div>
          <div class="mt-1 flex flex-wrap gap-1.5">
            <span v-for="(s,i) in sources" :key="s" class="inline-flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
              <span>{{ s }}</span>
              <button type="button" class="text-gray-600" @click="removeSource(i)">×</button>
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button :disabled="loading || !target || sources.length===0" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {{ loading ? 'Checking…' : 'Run check' }}
          </button>
          <span v-if="error" class="text-red-600 text-xs">{{ error }}</span>
        </div>
      </form>

      <div v-if="result" class="grid md:grid-cols-2 gap-2 mt-3">
        <div class="bg-white rounded border p-3">
          <h2 class="text-xs font-semibold mb-2">Summary</h2>
          <ul class="space-y-1 text-xs">
            <li><strong>Target:</strong> {{ result.target }}</li>
            <li><strong>Sources:</strong> {{ result.sources.join(', ') }}</li>
            <li><strong>Seed items:</strong> {{ result.seedCount }}</li>
            <li><strong>Currently owned by target:</strong> {{ result.currentOwnedCount }}</li>
            <li><strong>Auction points received:</strong> {{ result.auctionPoints }}</li>
            <li><strong>Trade value received:</strong> {{ result.tradeValue }}</li>
          </ul>

          <button
            class="mt-3 px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50 disabled:opacity-50"
            :disabled="!result || enforcing"
            @click="openPreview()"
          >
            Auction cToons and Remove Points
          </button>
        </div>

        <!-- Review + Confirm Modal -->
        <div v-if="showPreview" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
          <div class="relative bg-white w-full max-w-4xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
            <!-- BEFORE processing: review -->
            <template v-if="!hasOutcome">
              <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
                <h3 class="text-sm font-semibold">Review Removal</h3>
              </div>

              <div class="overflow-y-auto flex-1 px-4 py-3">
                <div>
                  <p class="text-xs"><strong>Deactivate accounts:</strong>
                    <span v-if="result?.preview?.deactivationUsernames?.length">
                      {{ result.preview.deactivationUsernames.join(', ') }}
                    </span>
                    <span v-else>—</span>
                  </p>
                  <p class="text-xs mt-1">
                    <strong>Points to remove from {{ result?.target }}:</strong>
                    {{ result?.preview?.pointsToRemove ?? 0 }}
                  </p>
                </div>

                <div class="mt-3">
                  <h4 class="text-xs font-semibold">cToons to transfer and auction</h4>
                  <p class="text-[10px] text-gray-500 mb-2">Includes target’s relevant items and all source-owned items.</p>

                  <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    <div
                      v-for="it in allPreviewItems"
                      :key="it.id"
                      class="border rounded-md p-2 bg-gray-50"
                    >
                      <div class="aspect-square bg-white border rounded mb-2 flex items-center justify-center overflow-hidden">
                        <img
                          v-if="it.ctoon?.assetPath"
                          :src="imgUrl(it.ctoon.assetPath)"
                          :alt="it.ctoon?.name || 'cToon'"
                          class="object-contain w-full h-full"
                        />
                        <div v-else class="text-[10px] text-gray-400">No image</div>
                      </div>
                      <div class="text-xs font-medium truncate">{{ it.ctoon?.name || 'cToon' }}</div>
                      <div class="text-[10px] text-gray-600">Rarity: {{ it.ctoon?.rarity || '—' }}</div>
                      <div class="text-[10px]">Owner: <span class="font-mono">{{ it.user?.username || '—' }}</span></div>
                      <div class="text-[10px]">Mint #: <span class="font-mono">{{ it.mintNumber ?? '—' }}</span></div>
                    </div>
                  </div>
                </div>

                <div v-if="enforceError" class="text-red-600 text-[11px] mt-3">{{ enforceError }}</div>
              </div>

              <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
                <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closePreview" :disabled="enforcing">Cancel</button>
                <button
                  class="px-3 py-1 text-xs rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                  :disabled="enforcing"
                  @click="enforce()"
                >
                  {{ enforcing ? 'Processing…' : 'Confirm Remove' }}
                </button>
              </div>
            </template>

            <!-- AFTER processing: results (success or with errors) -->
            <template v-else>
              <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
                <h3 class="text-sm font-semibold">Removal Results</h3>
              </div>

              <div class="overflow-y-auto flex-1 px-4 py-3">
                <!-- Transport-level error -->
                <div v-if="enforceError" class="p-2 border rounded-md bg-red-50 text-red-700 text-xs">
                  {{ enforceError }}
                </div>

                <!-- Summary -->
                <div v-else class="p-2 border rounded-md bg-green-50 text-green-800">
                  <p class="text-xs font-medium mb-1">
                    {{ hasAnyErrors ? 'Completed with issues' : 'Completed successfully' }}
                  </p>
                  <div class="grid sm:grid-cols-2 gap-x-4 text-xs">
                    <div>Transferred (target seeds): <strong>{{ enforceResult?.transferredCount ?? 0 }}</strong></div>
                    <div>Auctions (target seeds): <strong>{{ enforceResult?.auctionsCreated ?? 0 }}</strong></div>
                    <div>Transferred (sources): <strong>{{ enforceResult?.sourceTransferredCount ?? 0 }}</strong></div>
                    <div>Auctions (sources): <strong>{{ enforceResult?.sourceAuctionsCreated ?? 0 }}</strong></div>
                    <div>Points removed: <strong>{{ enforceResult?.pointsRemoved ?? 0 }}</strong></div>
                    <div>Sources deactivated: <strong>{{ enforceResult?.deactivatedSources ?? 0 }}</strong></div>
                  </div>
                </div>

                <!-- Detailed errors -->
                <div v-if="hasAnyErrors" class="mt-3 space-y-3">
                  <div v-if="(enforceResult?.errors?.target?.length || 0) > 0">
                    <h4 class="text-xs font-semibold">Issues while processing target items</h4>
                    <div class="overflow-x-auto border rounded-md">
                      <table class="min-w-full text-xs">
                        <thead class="bg-gray-100">
                          <tr>
                            <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">UserCtoonId</th>
                            <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Phase</th>
                            <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(e,i) in enforceResult.errors.target" :key="'t'+i" class="border-t">
                            <td class="px-2 py-1.5 font-mono">{{ e.userCtoonId || '—' }}</td>
                            <td class="px-2 py-1.5">{{ e.phase }}</td>
                            <td class="px-2 py-1.5">{{ e.message }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div v-if="(enforceResult?.errors?.sources?.length || 0) > 0">
                    <h4 class="text-xs font-semibold">Issues while processing source items</h4>
                    <div class="overflow-x-auto border rounded-md">
                      <table class="min-w-full text-xs">
                        <thead class="bg-gray-100">
                          <tr>
                            <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">UserCtoonId</th>
                            <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Phase</th>
                            <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(e,i) in enforceResult.errors.sources" :key="'s'+i" class="border-t">
                            <td class="px-2 py-1.5 font-mono">{{ e.userCtoonId || '—' }}</td>
                            <td class="px-2 py-1.5">{{ e.phase }}</td>
                            <td class="px-2 py-1.5">{{ e.message }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-end px-4 py-3 border-t flex-shrink-0">
                <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closePreview" :disabled="enforcing">Close</button>
              </div>
            </template>
          </div>
        </div>

        <div class="bg-white rounded border p-3">
          <h2 class="text-xs font-semibold mb-2">By source</h2>
          <div v-if="result.bySource && Object.keys(result.bySource).length" class="space-y-2 text-xs">
            <div v-for="(row, name) in result.bySource" :key="name" class="flex flex-col justify-between bg-gray-50 p-2 rounded-md">
              <div class="font-medium">{{ name }}</div>
              <span>{{ row.seedCount }} cToons
                <br><br>{{ row.currentOwnedCount }} of those cToons are currently owned by {{ result.target }}
                <br><br>Auction Points: {{ row.auctionPoints }} pts received
                <br><br>Trade Value: {{ row.tradeValue }} points in trade value received</span>
            </div>
          </div>
          <div v-else class="text-xs text-gray-500">No breakdown.</div>
        </div>

        <div class="md:col-span-2 bg-white rounded border p-3">
          <h2 class="text-xs font-semibold mb-2">Debug</h2>
          <pre class="text-[10px] overflow-auto">{{ result }}</pre>
        </div>
      </div>
    </div>

    <!-- Legacy modal kept (unused if using preview) -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
      <div class="relative bg-white w-full max-w-xl rounded-lg shadow-lg p-4">
        <h3 class="text-sm font-semibold mb-2">Confirm Enforcement</h3>
        <p class="text-xs text-gray-700">
          Target <strong>{{ result?.target }}</strong>. Sources: <strong>{{ result?.sources?.join(', ') }}</strong>.
        </p>
        <p class="text-xs text-gray-700 mt-2">
          This will transfer the target’s relevant cToons to <strong>CartoonReOrbitOfficial</strong>,
          create 3-day auctions at rarity floor, and remove previously gained auction points.
        </p>
        <ul class="text-xs mt-2 space-y-1">
          <li>Seed items: <strong>{{ result?.seedCount }}</strong></li>
          <li>Currently owned by target: <strong>{{ result?.currentOwnedCount }}</strong></li>
          <li>Points to remove (max): <strong>{{ result?.auctionPoints }}</strong></li>
        </ul>

        <div v-if="enforceError" class="text-red-600 text-[11px] mt-2">{{ enforceError }}</div>
        <div v-if="enforceResult" class="text-xs mt-2">
          <div class="p-2 rounded-md bg-green-50 border">
            Done. Transferred: {{ enforceResult.transferredCount }}. Auctions created: {{ enforceResult.auctionsCreated }}. Points removed: {{ enforceResult.pointsRemoved }}.
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closeEnforce" :disabled="enforcing">Cancel</button>
          <button
            class="px-3 py-1 text-xs rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300"
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
import { ref, computed, watch, nextTick } from 'vue'

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

// outcome flags for the preview modal
const hasOutcome = computed(() => !!enforceError.value || !!enforceResult.value)
const hasAnyErrors = computed(() => {
  const r = enforceResult.value
  const t = r?.errors?.target?.length || 0
  const s = r?.errors?.sources?.length || 0
  return (t + s) > 0
})

// --- Username suggestions state ---
const usersLoaded = ref(false)
const allUsers = ref([])
const targetFocused = ref(false)
const sourceFocused = ref(false)
const targetSuggestions = ref([])
const sourceSuggestions = ref([])
const targetInputEl = ref(null)

// fetch all users once, on demand
async function ensureUsersLoaded() {
  if (usersLoaded.value) return
  const res = await fetch('/api/admin/users', { credentials: 'include' })
  if (!res.ok) return
  const raw = await res.json()
  allUsers.value = (raw || []).filter(u => u?.username && u?.active === true)
  usersLoaded.value = true
}

// recompute suggestions after 3+ chars
watch(target, async (v) => {
  const q = (v || '').toLowerCase()
  if (q.length < 3) { targetSuggestions.value = []; return }
  await ensureUsersLoaded()
  targetSuggestions.value = allUsers.value
    .filter(u => u.active === true && u.username.toLowerCase().includes(q))
    .slice(0, 10)
})
watch(sourceInput, async (v) => {
  const q = (v || '').toLowerCase()
  if (q.length < 3) { sourceSuggestions.value = []; return }
  await ensureUsersLoaded()
  sourceSuggestions.value = allUsers.value
    .filter(u =>
      u.active === true &&
      u.username.toLowerCase().includes(q) &&
      u.username !== target.value &&
      !sources.value.includes(u.username)
    )
    .slice(0, 10)
})

function selectTarget(name) {
  target.value = name
  targetSuggestions.value = []
  targetFocused.value = false
  nextTick(() => { try { targetInputEl.value?.blur() } catch {} })
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
