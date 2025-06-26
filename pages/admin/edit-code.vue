<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16">
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

          <!-- cToon Rewards -->
          <div>
            <label class="block font-medium mb-1">cToon Rewards</label>
            <datalist id="ctoont-list">
              <option v-for="ct in ctoonOptions" :key="ct.id" :value="ct.name" />
            </datalist>
            <div
              v-for="(rc, idx) in ctoonRewards"
              :key="idx"
              class="flex items-center space-x-2 mb-2"
            >
              <input
                v-model="rc.ctoonName"
                list="ctoont-list"
                type="text"
                required
                class="flex-1 border rounded p-2"
                placeholder="Type or select cToon name"
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
            <datalist id="ctoont-list">
              <option v-for="ct in ctoonOptions" :key="ct.id" :value="ct.name" />
            </datalist>
            <div
              v-for="(pc, idx) in prereqCtoons"
              :key="idx"
              class="flex items-center space-x-2 mb-2"
            >
              <input
                v-model="pc.ctoonName"
                list="ctoont-list"
                type="text"
                class="flex-1 border rounded p-2"
                placeholder="Type or select cToon name"
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

// cToon options from DB
const ctoonOptions  = ref([])

// loading state
const pending       = ref(true)
const fetchError    = ref(null)

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

    // 2) fetch codes list
    const codesRes = await fetch('/api/admin/codes', { credentials: 'include' })
    if (!codesRes.ok) throw new Error(await codesRes.text())
    const all = await codesRes.json()

    const target = route.query.code
    if (!target) throw new Error('No code specified')
    const entry = all.find(c => c.code === target)
    if (!entry) throw new Error('Code not found')

    // populate form
    code.value      = entry.code
    maxClaims.value = entry.maxClaims
    expiresAt.value = entry.expiresAt ? isoToCSTLocal(entry.expiresAt) : ''
    points.value    = entry.rewards.reduce((sum,r) => sum + (r.points||0), 0)

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
    const name = r.ctoonName.trim()
    if (!name||r.quantity<1) continue
    const found = ctoonOptions.value.find(ct=>ct.name===name)
    if (!found) { error.value = `Unrecognized cToon: "${name}"`; return }
    validCtoons.push({ ctoonId: found.id, quantity: r.quantity })
  }

  const validPrereqs = []
  for (const p of prereqCtoons.value) {
    const name = p.ctoonName.trim()
    if (!name) continue
    const found = ctoonOptions.value.find(ct=>ct.name===name)
    if (!found) { error.value = `Unrecognized prerequisite cToon: "${name}"`; return }
    validPrereqs.push({ ctoonId: found.id })
  }

  const payload = {
    code:          code.value,
    maxClaims:     maxClaims.value,
    expiresAt:     expiresIso,
    rewards:       [{ points: points.value, ctoons: validCtoons }],
    prerequisites: validPrereqs
  }

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