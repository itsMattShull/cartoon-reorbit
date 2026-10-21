<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2 max-w-2xl mx-auto">

      <div class="bg-white rounded border p-3">
        <h1 class="text-base font-semibold mb-3">Create New Claim Code</h1>
        <form @submit.prevent="submitForm" class="space-y-3">
          <!-- Code -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Code</label>
            <input
              v-model="code"
              type="text"
              required
              class="border rounded-md px-2 py-1.5 text-sm"
              placeholder="e.g. SPRING2025"
            />
          </div>

          <!-- Max Claims -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Max Claims</label>
            <input
              v-model.number="maxClaims"
              type="number"
              min="1"
              required
              class="border rounded-md px-2 py-1.5 text-sm"
            />
          </div>

          <!-- Available At -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Available At (CST)</label>
            <input
              v-model="startsAt"
              type="datetime-local"
              class="border rounded-md px-2 py-1.5 text-sm"
            />
            <p class="text-[10px] text-gray-500">
              Leave blank or set to any date/time (including past) — users can only redeem on or after this time. Defaults to now (CST).
            </p>
          </div>

          <!-- Expires At -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Expires At (CST)</label>
            <input
              v-model="expiresAt"
              type="datetime-local"
              class="border rounded-md px-2 py-1.5 text-sm"
            />
            <p class="text-[10px] text-gray-500">
              Leave blank for no expiration
            </p>
          </div>

          <!-- Prerequisite cToons -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Prerequisite cToons</label>

            <div
              v-for="(pc, idx) in prereqCtoons"
              :key="idx"
              class="flex items-center gap-2"
            >
              <datalist :id="`prereq-ctoon-list-${idx}`">
                <option
                  v-for="ct in filteredCtoons(pc.ctoonName)"
                  :key="ct.id"
                  :value="ctoonLabel(ct)"
                />
              </datalist>

              <input
                v-model="pc.ctoonName"
                :list="`prereq-ctoon-list-${idx}`"
                type="text"
                class="flex-1 border rounded-md px-2 py-1.5 text-sm"
                placeholder="Type 3+ characters to search"
              />

              <img
                v-if="findCtoonByInput(pc.ctoonName)?.assetPath"
                :src="findCtoonByInput(pc.ctoonName).assetPath"
                class="w-7 h-7 object-cover rounded border"
                alt="cToon preview"
              />
              <button
                type="button"
                @click="removePrereqCtoon(idx)"
                class="text-red-700 hover:underline text-[11px]"
              >
                Remove
              </button>
            </div>

            <button
              type="button"
              @click="addPrereqCtoon"
              class="text-blue-600 hover:underline text-xs text-left"
            >
              + Add prerequisite cToon
            </button>
            <p class="text-[10px] text-gray-500">Leave empty for no prerequisites.</p>

            <div class="mt-1 space-y-1">
              <label class="inline-flex items-center gap-2">
                <input type="checkbox" v-model="prereqPoolEnabled" />
                <span class="text-xs font-medium">Only require owning some cToons from this pool</span>
              </label>
              <div v-if="prereqPoolEnabled" class="flex items-center gap-2">
                <span class="text-xs">Must own at least</span>
                <input
                  v-model.number="prereqMinOwned"
                  type="number"
                  min="1"
                  class="w-20 border rounded-md px-2 py-1 text-sm"
                />
                <span class="text-xs">of the selected cToons</span>
              </div>
              <p v-if="prereqPoolEnabled" class="text-[10px] text-gray-500">
                Unchecked, users must own ALL prerequisite cToons. Checked, owning any {{ prereqMinOwned || 'X' }} from the pool is enough.
              </p>
              <div v-if="prereqPoolEnabled" class="flex flex-col gap-1">
                <label class="text-xs font-medium">Add Set</label>
                <datalist id="prereq-set-list">
                  <option v-for="s in filteredSets(setSearch)" :key="s" :value="s" />
                </datalist>
                <input
                  v-model="setSearch"
                  list="prereq-set-list"
                  type="text"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Type 3+ characters to search sets"
                  @change="onSetSelected"
                />
                <p class="text-[10px] text-gray-500">Selecting a set adds all of its cToons to the prerequisite list above.</p>
              </div>
            </div>
          </div>

          <!-- Points Reward -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Points Reward</label>
            <input
              v-model.number="points"
              type="number"
              min="0"
              class="border rounded-md px-2 py-1.5 text-sm bg-gray-100"
            />
          </div>

          <!-- Pooled cToon Rewards -->
          <div class="space-y-1">
            <label class="inline-flex items-center gap-2">
              <input type="checkbox" v-model="pooledEnabled" />
              <span class="text-xs font-medium">Use pooled cToon rewards</span>
            </label>

            <div v-if="pooledEnabled" class="bg-white rounded border p-2 space-y-2">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Number to give out (unique)</label>
                <input v-model.number="poolUniqueCount" type="number" min="1" class="w-28 border rounded-md px-2 py-1 text-sm" />
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Pool cToons</label>
                <div v-for="(row, idx) in poolItems" :key="'pool-'+idx" class="flex items-center gap-2">
                  <datalist :id="`pool-ctoons-${idx}`">
                    <option v-for="ct in filteredCtoons(row.ctoonName)" :key="ct.id" :value="ctoonLabel(ct)" />
                  </datalist>

                  <input v-model="row.ctoonName" :list="`pool-ctoons-${idx}`" class="flex-1 border rounded-md px-2 py-1.5 text-sm" placeholder="Type 3+ characters" />

                  <!-- NEW: preview -->
                  <img
                    v-if="findCtoonByInput(row.ctoonName)?.assetPath"
                    :src="findCtoonByInput(row.ctoonName).assetPath"
                    class="w-7 h-7 object-cover rounded border"
                    alt="cToon preview"
                  />

                  <input v-model.number="row.weight" type="number" min="1" class="w-16 border rounded px-1 py-0.5 text-xs" title="Weight" />
                  <button type="button" @click="removePoolItem(idx)" class="text-red-700 hover:underline text-[11px]">Remove</button>
                </div>
                <button type="button" @click="addPoolItem" class="text-blue-600 hover:underline text-xs text-left">+ Add pool cToon</button>
                <p class="text-[10px] text-gray-500">Users receive <strong>unique</strong> picks from this pool.</p>
              </div>
            </div>
          </div>

          <!-- cToon Rewards -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">cToon Rewards</label>
            <p class="text-[10px] text-gray-500">
              Optionally set an End Bonus Date/Time (CST) per cToon below — if set, that cToon is only
              given out when redeemed between the code's Available At time and that cToon's End Bonus
              Date/Time. Leave blank to give it out normally whenever the code is redeemed.
            </p>

            <div
              v-for="(rc, idx) in ctoonRewards"
              :key="idx"
              class="border rounded-md p-2 grid grid-cols-2 sm:grid-cols-[1fr_auto_5rem_auto] gap-2 sm:items-center"
            >
              <!-- per-row datalist fed by filtered options -->
              <datalist :id="`ctoon-list-${idx}`">
                <option
                  v-for="ct in filteredCtoons(rc.ctoonName)"
                  :key="ct.id"
                  :value="ctoonLabel(ct)"
                />
              </datalist>

              <div class="col-span-2 sm:col-span-1">
                <label class="text-[10px] text-gray-500 sm:hidden">cToon</label>
                <input
                  :value="rc.ctoonName"
                  @input="e => {
                    const val = e.target.value;
                    rc.ctoonName = val;
                    onCtoonInput(val);
                  }"
                  :list="`ctoon-list-${idx}`"
                  type="text"
                  required
                  class="w-full border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Type 3+ characters to search"
                />
              </div>

              <img
                v-if="findCtoonByInput(rc.ctoonName)"
                :src="findCtoonByInput(rc.ctoonName).assetPath"
                class="w-7 h-7 object-cover rounded border justify-self-center"
                alt="cToon preview"
              />

              <div>
                <label class="text-[10px] text-gray-500 sm:hidden">Qty</label>
                <input
                  v-model.number="rc.quantity"
                  type="number"
                  min="1"
                  class="w-full sm:w-16 border rounded px-1 py-1 text-sm"
                  placeholder="Qty"
                />
              </div>

              <button
                type="button"
                @click="removeCtoonReward(idx)"
                class="text-red-700 hover:underline text-[11px] justify-self-end sm:justify-self-auto"
              >
                Remove
              </button>

              <div class="col-span-2 flex flex-col gap-1">
                <label class="text-[10px] text-gray-500">End Bonus Date/Time (CST) &middot; optional</label>
                <input
                  v-model="rc.endBonusAt"
                  type="datetime-local"
                  class="w-full border rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              @click="addCtoonReward"
              class="text-blue-600 hover:underline text-xs text-left"
            >
              + Add another cToon
            </button>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Background Rewards (CODE_ONLY)</label>
            <datalist id="bg-list">
              <option v-for="b in bgOptions" :key="b.id" :value="b.label || b.id" />
            </datalist>
            <div v-for="(rb, idx) in bgRewards" :key="idx" class="flex items-center gap-2">
              <input v-model="rb.bgLabel" list="bg-list" class="flex-1 border rounded-md px-2 py-1.5 text-sm" placeholder="Type or select background label" />
              <img v-if="findBg(rb.bgLabel)?.imagePath" :src="findBg(rb.bgLabel).imagePath" class="w-10 h-7 object-cover rounded border" />
              <button type="button" @click="removeBgReward(idx)" class="text-red-700 hover:underline text-[11px]">Remove</button>
            </div>
            <button type="button" @click="addBgReward" class="text-blue-600 hover:underline text-xs text-left">+ Add background</button>
          </div>

          <!-- Submit & Errors -->
          <div class="pt-3 border-t">
            <button
              type="submit"
              class="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700"
            >
              Save Code
            </button>
            <p v-if="error" class="mt-2 text-[11px] text-red-600">{{ error }}</p>
            <p v-if="!error && warning" class="mt-2 text-[11px] text-amber-600">{{ warning }}</p>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const { isoToCSTLocal, cstLocalToISO } = useCentralTime()

// form state
const code = ref('')
const maxClaims = ref(1)
const startsAt = ref(isoToCSTLocal(new Date().toISOString()))
const expiresAt = ref('')        // datetime-local string, optional
const points = ref(0)
const ctoonRewards = ref([
  { ctoonName: '', quantity: 1, endBonusAt: '' }
])
const error = ref('')
const warning = ref('')
const bgOptions = ref([])

const pooledEnabled   = ref(false)
const poolUniqueCount = ref(1)
const poolItems       = ref([{ ctoonName: '', weight: 1 }])

function addPoolItem() { poolItems.value.push({ ctoonName: '', weight: 1 }) }
function removePoolItem(i) { poolItems.value.splice(i, 1) }

// at the top, alongside your other refs
const prereqCtoons = ref([{ ctoonName: '' }])
const prereqPoolEnabled = ref(false)
const prereqMinOwned = ref(1)

const setSearch = ref('')
const setNames = computed(() => {
  const seen = new Set()
  for (const ct of ctoonOptions.value) {
    const s = (ct.set || '').trim()
    if (s) seen.add(s)
  }
  return [...seen].sort()
})
function filteredSets(input) {
  const v = (input || '').trim().toLowerCase()
  if (v.length < 3) return []
  return setNames.value.filter(s => s.toLowerCase().includes(v))
}
function onSetSelected() {
  const v = setSearch.value.trim()
  if (!v) return
  const setName = setNames.value.find(s => s.toLowerCase() === v.toLowerCase())
  if (!setName) return
  const existingIds = new Set(
    prereqCtoons.value.map(p => resolveCtoonId(p.ctoonName).id).filter(Boolean)
  )
  const toAdd = ctoonOptions.value.filter(ct => (ct.set || '').trim() === setName && !existingIds.has(ct.id))
  const rows = prereqCtoons.value.filter(p => (p.ctoonName || '').trim())
  for (const ct of toAdd) rows.push({ ctoonName: ctoonLabel(ct) })
  prereqCtoons.value = rows.length ? rows : [{ ctoonName: '' }]
  setSearch.value = ''
}

function addPrereqCtoon() {
  prereqCtoons.value.push({ ctoonName: '' })
}
function removePrereqCtoon(index) {
  prereqCtoons.value.splice(index, 1)
}

const bgRewards = ref([{ bgLabel: '' }])
// Match by label OR id (since the datalist value is label || id)
function findBg(value) {
  const v = (value ?? '').trim()
  return bgOptions.value.find(b => b.label === v || b.id === v)
}
function addBgReward() { bgRewards.value.push({ bgLabel: '' }) }
function removeBgReward(i) { bgRewards.value.splice(i,1) }

function filteredCtoons(input) {
  const v = (input || '').trim()
  if (v.length < 2) return []
  return ctoonOptions.value.filter(ct =>
    ct.name.toLowerCase().includes(v.toLowerCase()) ||
    ct.id.toLowerCase().includes(v.toLowerCase())
  )
}

function ctoonLabel(ct) {
  return `${ct.name} (${ct.id})`
}

// list of all cToons from the DB
const ctoonOptions = ref([])

function resolveCtoonId(input) {
  const v = (input || '').trim()
  if (!v) return { id: null }
  const direct = ctoonOptions.value.find(ct => ct.id === v)
  if (direct) return { id: direct.id }
  const idMatch = v.match(/\(([^)]+)\)\s*$/)
  if (idMatch) {
    const id = idMatch[1].trim()
    const byId = ctoonOptions.value.find(ct => ct.id === id)
    if (byId) return { id: byId.id }
  }
  const matches = ctoonOptions.value.filter(ct => ct.name === v)
  if (matches.length === 1) return { id: matches[0].id }
  if (matches.length > 1) return { id: null, reason: 'ambiguous', name: v }
  return { id: null, reason: 'notfound', name: v }
}

function findCtoonByInput(input) {
  const v = (input || '').trim()
  if (!v) return null
  const direct = ctoonOptions.value.find(ct => ct.id === v)
  if (direct) return direct
  const idMatch = v.match(/\(([^)]+)\)\s*$/)
  if (idMatch) {
    const id = idMatch[1].trim()
    const byId = ctoonOptions.value.find(ct => ct.id === id)
    if (byId) return byId
  }
  const matches = ctoonOptions.value.filter(ct => ct.name === v)
  if (matches.length === 1) return matches[0]
  return null
}

const highlighted = ref('')

// whenever an input changes, set highlighted to that value
function onCtoonInput(name) {
  highlighted.value = name
}

onMounted(async () => {
  try {
    const res = await fetch('/api/admin/list-ctoons', { credentials: 'include' })
    if (res.ok) {
      ctoonOptions.value = await res.json()  // expected [{ id, name }]
    }

    const resBgs = await fetch('/api/admin/list-backgrounds', { credentials: 'include' })
    if (resBgs.ok) bgOptions.value = await resBgs.json() // [{id,label,imagePath}]
  } catch (e) {
    console.error('Failed to load cToons', e)
  }
})

// add/remove cToon reward entries
function addCtoonReward() {
  ctoonRewards.value.push({ ctoonName: '', quantity: 1, endBonusAt: '' })
}
function removeCtoonReward(index) {
  ctoonRewards.value.splice(index, 1)
}

// form submission
async function submitForm() {
  error.value = ''
  warning.value = ''

  // basic validation
  if (!code.value.trim()) {
    error.value = 'Code is required.'
    return
  }
  if (maxClaims.value < 1) {
    error.value = 'Max Claims must be at least 1.'
    return
  }
  const startsIso = cstLocalToISO(startsAt.value)

  let expiresIso = null
  if (expiresAt.value) {
    const dt = new Date(expiresAt.value)
    if (isNaN(dt.getTime())) {
      error.value = 'Invalid expiration date.'
      return
    }
    if (dt <= new Date()) {
      error.value = 'Expiration must be in the future.'
      return
    }
    expiresIso = dt.toISOString()
  }

  // Build backgrounds payload at submit-time (so it reflects current selections)
  const backgroundsPayload = bgRewards.value
    .map(r => {
      const v = (r.bgLabel || '').trim()
      if (!v) return null
      const match = bgOptions.value.find(b => b.label === v || b.id === v)
      if (!match) {
        error.value = `Unrecognized background: “${v}”`
        throw new Error(error.value)
      }
      return { backgroundId: match.id }
    })
    .filter(Boolean)

  const validPrereqs = []
  for (const p of prereqCtoons.value) {
    const name = p.ctoonName.trim()
    if (!name) continue
    const resolved = resolveCtoonId(name)
    if (!resolved.id) {
      if (resolved.reason === 'ambiguous') {
        error.value = `Multiple prerequisite cToons named “${resolved.name}”. Select one by ID from the dropdown.`
      } else {
        error.value = `Unrecognized prerequisite cToon: “${resolved.name}”`
      }
      return
    }
    validPrereqs.push({ ctoonId: resolved.id })
  }

  if (prereqPoolEnabled.value) {
    if (validPrereqs.length === 0) {
      error.value = 'Add at least one prerequisite cToon to use the ownership pool option.'
      return
    }
    if (!Number.isInteger(prereqMinOwned.value) || prereqMinOwned.value < 1) {
      error.value = 'Number of cToons to own must be at least 1.'
      return
    }
    if (prereqMinOwned.value > validPrereqs.length) {
      error.value = 'Number of cToons to own cannot exceed the number of prerequisite cToons.'
      return
    }
  }

  // build payload
  // build either fixed cToons or pooled
  let rewardBlock = { points: points.value, backgrounds: backgroundsPayload }

  if (pooledEnabled.value) {
    const validPool = []
    for (const r of poolItems.value) {
      const name = (r.ctoonName || '').trim()
      if (!name) continue
      const resolved = resolveCtoonId(name)
      if (!resolved.id) {
        if (resolved.reason === 'ambiguous') {
          error.value = `Multiple cToons named “${resolved.name}”. Select one by ID from the dropdown.`
        } else {
          error.value = `Unrecognized cToon in pool: “${resolved.name}”`
        }
        return
      }
      validPool.push({ ctoonId: resolved.id, weight: Number(r.weight) || 1 })
    }
    if (validPool.length === 0) { error.value = 'Add at least one cToon to the pool.'; return }
    if (poolUniqueCount.value < 1) { error.value = 'Number to give out must be at least 1.'; return }
    if (poolUniqueCount.value > validPool.length) { error.value = 'Number to give out cannot exceed pool size.'; return }
    rewardBlock.pool = { uniqueCount: poolUniqueCount.value, items: validPool }
  } else {
    const startsDateObj = startsIso ? new Date(startsIso) : null
    const nowDate = new Date()
    const endBonusMin = startsDateObj && startsDateObj > nowDate ? startsDateObj : nowDate
    const expiresDateObj = expiresIso ? new Date(expiresIso) : null
    const warnings = []

    const validCtoons = []
    for (const r of ctoonRewards.value) {
      const name = (r.ctoonName||'').trim()
      if (!name || r.quantity < 1) continue
      const resolved = resolveCtoonId(name)
      if (!resolved.id) {
        if (resolved.reason === 'ambiguous') {
          error.value = `Multiple cToons named “${resolved.name}”. Select one by ID from the dropdown.`
        } else {
          error.value = `Unrecognized cToon: “${resolved.name}”`
        }
        return
      }

      let endBonusIso = null
      if (r.endBonusAt) {
        endBonusIso = cstLocalToISO(r.endBonusAt)
        const ebDate = new Date(endBonusIso)
        if (isNaN(ebDate.getTime())) {
          error.value = `Invalid End Bonus Date/Time for “${name}”.`
          return
        }
        if (ebDate <= endBonusMin) {
          error.value = `End Bonus Date/Time for “${name}” must be after the code's start date/time and after now.`
          return
        }
        if (expiresDateObj && ebDate > expiresDateObj) {
          warnings.push(`“${name}”'s End Bonus Date/Time is after the code's Expires At — the code will stop working first, so this bonus window will never take effect.`)
        }
      }

      validCtoons.push({ ctoonId: resolved.id, quantity: r.quantity, endBonusAt: endBonusIso })
    }
    rewardBlock.ctoons = validCtoons
    warning.value = warnings.join(' ')
  }

  const payload = {
    code: code.value.trim(),
    maxClaims: maxClaims.value,
    prerequisites: validPrereqs,
    prereqMinOwned: prereqPoolEnabled.value ? prereqMinOwned.value : null,
    startsAt: startsIso,
    expiresAt: expiresIso,
    rewards: [rewardBlock]
  }

  try {
    const res = await fetch('/api/admin/codes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || 'Failed to create code')
    }
    router.push('/newsite/admin/codes')
  } catch (e) {
    console.error(e)
    error.value = e.message
  }
}
</script>

<style scoped>
.max-w-2xl {
  max-width: 640px;
}
</style>
