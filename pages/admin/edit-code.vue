<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <h1 class="text-2xl font-semibold mb-4">Edit Claim Code</h1>

      <div v-if="pending" class="text-gray-500">Loading…</div>
      <div v-else-if="fetchError" class="text-red-600">{{ fetchError.message }}</div>
      <div v-else>
        <form @submit.prevent="submitForm" class="space-y-4">
          <!-- Code (read-only) -->
          <div>
            <label class="block font-medium mb-1">Code</label>
            <input
              v-model="code"
              type="text"
              disabled
              class="w-full bg-gray-100 border rounded p-2"
            />
          </div>

          <!-- Max Claims -->
          <div>
            <label class="block font-medium mb-1">Max Claims</label>
            <input
              v-model.number="maxClaims"
              type="number"
              min="1"
              required
              class="w-full border rounded p-2"
            />
          </div>

          <!-- Expires At -->
          <div>
            <label class="block font-medium mb-1">Expires At</label>
            <input
              v-model="expiresAt"
              type="datetime-local"
              class="w-full border rounded p-2"
            />
            <p class="text-sm text-gray-500">Leave blank for no expiration</p>
          </div>

          <!-- Points Reward -->
          <div>
            <label class="block font-medium mb-1">Points Reward</label>
            <input
              v-model.number="points"
              type="number"
              min="0"
              class="w-full border rounded p-2"
            />
          </div>

          <!-- Pooled cToon Rewards -->
          <div class="space-y-2">
            <label class="inline-flex items-center gap-2">
              <input type="checkbox" v-model="pooledEnabled" />
              <span class="font-medium">Use pooled cToon rewards</span>
            </label>

            <div v-if="pooledEnabled" class="rounded border p-3 space-y-3">
              <div>
                <label class="block font-medium mb-1">Number to give out (unique)</label>
                <input v-model.number="poolUniqueCount" type="number" min="1" class="w-32 border rounded p-2" />
              </div>

              <div>
                <label class="block font-medium mb-1">Pool cToons</label>
                <div v-for="(row, idx) in poolItems" :key="'pool-'+idx" class="flex items-center gap-2 mb-2">
                  <datalist :id="`pool-ctoons-${idx}`">
                    <option v-for="ct in filteredCtoons(row.ctoonName)" :key="ct.id" :value="ct.name" />
                  </datalist>

                  <input v-model="row.ctoonName" :list="`pool-ctoons-${idx}`" class="flex-1 border rounded p-2" placeholder="Type 3+ characters" />

                  <!-- NEW: preview -->
                  <img
                    v-if="findCtoon(row.ctoonName)?.assetPath"
                    :src="findCtoon(row.ctoonName).assetPath"
                    class="w-8 h-8 object-cover rounded"
                    alt="cToon preview"
                  />

                  <input v-model.number="row.weight" type="number" min="1" class="w-20 border rounded p-2" title="Weight" />
                  <button type="button" @click="removePoolItem(idx)" class="text-red-600 hover:underline">Remove</button>
                </div>
                <button type="button" @click="addPoolItem" class="text-blue-600 hover:underline text-sm">+ Add pool cToon</button>
                <p class="text-sm text-gray-500">Users receive <strong>unique</strong> picks from this pool.</p>
              </div>
            </div>
          </div>

          <!-- cToon Rewards -->
          <div>
            <label class="block font-medium mb-1">cToon Rewards</label>

            <div
              v-for="(rc, idx) in ctoonRewards"
              :key="idx"
              class="flex items-center space-x-2 mb-2"
            >
              <!-- per-row datalist, filtered by current input -->
              <datalist :id="`reward-ctoon-list-${idx}`">
                <option
                  v-for="ct in filteredCtoons(rc.ctoonName)"
                  :key="ct.id"
                  :value="ct.name"
                />
              </datalist>

              <input
                v-model="rc.ctoonName"
                :list="`reward-ctoon-list-${idx}`"
                type="text"
                required
                class="flex-1 border rounded p-2"
                placeholder="Type 3+ characters to search"
              />

              <img
                v-if="findCtoon(rc.ctoonName)?.assetPath"
                :src="findCtoon(rc.ctoonName).assetPath"
                class="w-8 h-8 object-cover rounded"
                alt="cToon preview"
              />
              <input
                v-model.number="rc.quantity"
                type="number"
                min="1"
                class="w-20 border rounded p-2"
                placeholder="Qty"
              />
              <button
                type="button"
                @click="removeCtoonReward(idx)"
                class="text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>

            <button
              type="button"
              @click="addCtoonReward"
              class="text-blue-600 hover:underline text-sm"
            >
              + Add another cToon
            </button>
          </div>

          <!-- Prerequisite cToons -->
          <div>
            <label class="block font-medium mb-1">Prerequisite cToons</label>

            <div
              v-for="(pc, idx) in prereqCtoons"
              :key="idx"
              class="flex items-center space-x-2 mb-2"
            >
              <!-- per-row datalist, filtered by current input -->
              <datalist :id="`prereq-ctoon-list-${idx}`">
                <option
                  v-for="ct in filteredCtoons(pc.ctoonName)"
                  :key="ct.id"
                  :value="ct.name"
                />
              </datalist>

              <input
                v-model="pc.ctoonName"
                :list="`prereq-ctoon-list-${idx}`"
                type="text"
                class="flex-1 border rounded p-2"
                placeholder="Type 3+ characters to search"
              />

              <img
                v-if="findCtoon(pc.ctoonName)?.assetPath"
                :src="findCtoon(pc.ctoonName).assetPath"
                class="w-8 h-8 object-cover rounded"
                alt="cToon preview"
              />
              <button
                type="button"
                @click="removePrereqCtoon(idx)"
                class="text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>

            <button
              type="button"
              @click="addPrereqCtoon"
              class="text-blue-600 hover:underline text-sm"
            >
              + Add prerequisite cToon
            </button>
            <p class="text-sm text-gray-500">Leave empty for no prerequisites.</p>
          </div>

          <!-- Background Rewards -->
          <div>
            <label class="block font-medium mb-1">Background Rewards (CODE_ONLY)</label>
            <datalist id="bg-list">
              <option v-for="b in bgOptions" :key="b.id" :value="b.label || b.id" />
            </datalist>
            <div v-for="(rb, idx) in bgRewards" :key="idx" class="flex items-center gap-2 mb-2">
              <input v-model="rb.bgLabel" list="bg-list" class="flex-1 border rounded p-2" placeholder="Type or select background label" />
              <img v-if="findBg(rb.bgLabel)?.imagePath" :src="findBg(rb.bgLabel).imagePath" class="w-12 h-8 object-cover rounded border" />
              <button type="button" @click="removeBgReward(idx)" class="text-red-600 hover:underline">Remove</button>
            </div>
            <button type="button" @click="addBgReward" class="text-blue-600 hover:underline text-sm">+ Add background</button>
          </div>

          <!-- Submit & Errors -->
          <div class="pt-4 border-t flex items-center justify-between">
            <button
              type="submit"
              class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Save Changes
            </button>
            <p v-if="error" class="text-red-600">{{ error }}</p>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const route         = useRoute()
const router        = useRouter()

// form state
const code          = ref('')
const maxClaims     = ref(1)
const expiresAt     = ref('')
const points        = ref(0)
const ctoonRewards  = ref([])
const prereqCtoons  = ref([{ ctoonName: '' }])
const error         = ref('')

// options
const ctoonOptions  = ref([])
const bgOptions     = ref([])

// loading state
const pending       = ref(true)
const fetchError    = ref(null)

const pooledEnabled   = ref(false)
const poolUniqueCount = ref(1)
const poolItems       = ref([{ ctoonName: '', weight: 1 }])
function addPoolItem() { poolItems.value.push({ ctoonName: '', weight: 1 }) }
function removePoolItem(i) { poolItems.value.splice(i,1) }

// helpers
function findCtoon(name) {
  return ctoonOptions.value.find(ct => ct.name === name)
}

// backgrounds state + helpers
const bgRewards = ref([{ bgLabel: '' }])
function findBg(value) {
  const v = (value ?? '').trim()
  return bgOptions.value.find(b => b.label === v || b.id === v)
}
function addBgReward() { bgRewards.value.push({ bgLabel: '' }) }
function removeBgReward(i) { bgRewards.value.splice(i,1) }

// helper to format ISO to CST datetime-local
function isoToCSTLocal(iso) {
  const date = new Date(iso)
  const parts = date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).split(', ')
  const [m,d,y] = parts[0].split('/')
  const time    = parts[1]
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${time}`
}

onMounted(async () => {
  try {
    // 1) fetch all cToon names/ids
    const ctoonRes = await fetch('/api/admin/list-ctoons', { credentials: 'include' })
    if (!ctoonRes.ok) throw new Error(await ctoonRes.text())
    ctoonOptions.value = await ctoonRes.json()

    // 2) fetch backgrounds options
    const resBgs = await fetch('/api/admin/list-backgrounds', { credentials: 'include' })
    if (resBgs.ok) bgOptions.value = await resBgs.json() // [{id,label,imagePath}]

    const target = Array.isArray(route.query.code) ? route.query.code[0] : route.query.code
    if (!target) throw new Error('No code specified')

    // 3) fetch the requested code
    const codesRes = await fetch(`/api/admin/codes?code=${encodeURIComponent(target)}`, { credentials: 'include' })
    if (!codesRes.ok) throw new Error(await codesRes.text())
    const payload = await codesRes.json()
    const items = Array.isArray(payload) ? payload : payload?.items
    if (!Array.isArray(items)) throw new Error('Unexpected codes response')
    const entry = items.find(c => c.code === target)
    if (!entry) throw new Error('Code not found')

    const pooledReward = entry.rewards.find(r => r.pooledUniqueCount && r.poolCtoons?.length)
    if (pooledReward) {
      pooledEnabled.value   = true
      poolUniqueCount.value = pooledReward.pooledUniqueCount
      poolItems.value = pooledReward.poolCtoons.map(p => {
        const found = ctoonOptions.value.find(ct => ct.id === p.ctoonId)
        return { ctoonName: found?.name || '', weight: p.weight || 1 }
      })
    } else {
      pooledEnabled.value = false
    }

    // populate form
    code.value      = entry.code
    maxClaims.value = entry.maxClaims
    expiresAt.value = entry.expiresAt ? isoToCSTLocal(entry.expiresAt) : ''
    points.value    = entry.rewards.reduce((sum,r) => sum + (r.points||0), 0)

    // map existing backgrounds into UI, using label OR id so it round-trips
    bgRewards.value = entry.rewards.flatMap(r =>
      (r.backgrounds||[]).map(rb => {
        const found = bgOptions.value.find(b => b.id === rb.backgroundId)
        return { bgLabel: found?.label || found?.id || rb.backgroundId }
      })
    )
    if (!bgRewards.value.length) bgRewards.value = [{ bgLabel: '' }]

    // map existing cToon rewards
    ctoonRewards.value = entry.rewards.flatMap(r =>
      r.ctoons.map(rc => {
        const found = ctoonOptions.value.find(ct => ct.id === rc.ctoonId)
        return { ctoonName: found?.name||'', quantity: rc.quantity }
      })
    )
    if (ctoonRewards.value.length === 0) {
      ctoonRewards.value = [{ ctoonName: '', quantity: 1 }]
    }

    // map existing prerequisites
    if (entry.prerequisites) {
      prereqCtoons.value = entry.prerequisites.map(p => {
        const found = ctoonOptions.value.find(ct => ct.id === p.ctoonId)
        return { ctoonName: found?.name||'' }
      })
    }
  } catch (e) {
    fetchError.value = e
  } finally {
    pending.value = false
  }
})

function addCtoonReward() { ctoonRewards.value.push({ ctoonName: '', quantity: 1 }) }
function removeCtoonReward(i)  { ctoonRewards.value.splice(i,1) }
function addPrereqCtoon()       { prereqCtoons.value.push({ ctoonName: '' }) }
function removePrereqCtoon(i)   { prereqCtoons.value.splice(i,1) }
function filteredCtoons(input) {
  const v = (input || '').trim()
  if (v.length < 2) return []
  const low = v.toLowerCase()
  return ctoonOptions.value.filter(ct => ct.name.toLowerCase().includes(low))
}

async function submitForm() {
  error.value = ''

  if (maxClaims.value < 1) {
    error.value = 'Max Claims must be at least 1.'
    return
  }
  let expiresIso = null
  if (expiresAt.value) {
    const dt = new Date(expiresAt.value)
    if (isNaN(dt)) { error.value = 'Invalid expiration date.'; return }
    expiresIso = dt.toISOString()
  }

  const validCtoons = []
  for (const r of ctoonRewards.value) {
    const name = (r.ctoonName||'').trim()
    if (!name || r.quantity < 1) continue
    const found = ctoonOptions.value.find(ct => ct.name === name)
    if (!found) { error.value = `Unrecognized cToon: “${name}”`; return }
    validCtoons.push({ ctoonId: found.id, quantity: r.quantity })
  }

  const validPrereqs = []
  for (const p of prereqCtoons.value) {
    const name = (p.ctoonName||'').trim()
    if (!name) continue
    const found = ctoonOptions.value.find(ct => ct.name === name)
    if (!found) { error.value = `Unrecognized prerequisite cToon: “${name}”`; return }
    validPrereqs.push({ ctoonId: found.id })
  }

  // Build backgrounds payload *now* so it reflects current selections
  const backgroundsPayload = bgRewards.value
    .map(r => {
      const v = (r.bgLabel || '').trim()
      if (!v) return null
      const match = bgOptions.value.find(b => b.label === v || b.id === v)
      if (!match) { error.value = `Unrecognized background: “${v}”`; throw new Error(error.value) }
      return { backgroundId: match.id }
    })
    .filter(Boolean)

  // build either fixed cToons or pooled
  let rewardBlock = { points: points.value, backgrounds: backgroundsPayload }

  if (pooledEnabled.value) {
    const validPool = []
    for (const r of poolItems.value) {
      const name = (r.ctoonName || '').trim()
      if (!name) continue
      const match = ctoonOptions.value.find(ct => ct.name === name)
      if (!match) { error.value = `Unrecognized cToon in pool: “${name}”`; return }
      validPool.push({ ctoonId: match.id, weight: Number(r.weight) || 1 })
    }
    if (validPool.length === 0) { error.value = 'Add at least one cToon to the pool.'; return }
    if (poolUniqueCount.value < 1) { error.value = 'Number to give out must be at least 1.'; return }
    if (poolUniqueCount.value > validPool.length) { error.value = 'Number to give out cannot exceed pool size.'; return }
    rewardBlock.pool = { uniqueCount: poolUniqueCount.value, items: validPool }
  } else {
    const validCtoons = []
    for (const r of ctoonRewards.value) {
      const name = (r.ctoonName||'').trim()
      if (!name || r.quantity < 1) continue
      const found = ctoonOptions.value.find(ct => ct.name === name)
      if (!found) { error.value = `Unrecognized cToon: “${name}”`; return }
      validCtoons.push({ ctoonId: found.id, quantity: r.quantity })
    }
    rewardBlock.ctoons = validCtoons
  }

  const payload = {
    code: code.value.trim(),
    maxClaims: maxClaims.value,
    prerequisites: validPrereqs,
    expiresAt: expiresIso,
    rewards: [rewardBlock]
  }

  // Debug (optional)
  // console.log('PUT payload.rewards[0].backgrounds:', payload.rewards[0].backgrounds)

  try {
    const res = await fetch('/api/admin/codes', {
      method: 'PUT', credentials: 'include', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error(await res.text())
    router.push('/admin/codes')
  } catch (e) {
    error.value = e.message || 'Failed to save'
  }
}
</script>

<style scoped>
.max-w-2xl { max-width: 640px }
</style>
