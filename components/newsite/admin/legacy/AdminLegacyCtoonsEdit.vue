<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

      <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-3 relative">
        <h1 class="text-base font-semibold mb-3">Edit cToon</h1>

        <form @submit.prevent="submitForm" class="space-y-3">

          <!-- ── Media ─────────────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Media</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">The image and (optional) sound that represent this cToon in the c-mart and inventory.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Current Image</label>
              <img :src="assetPath" alt="cToon" class="h-32" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Upload New Image (PNG or GIF)</label>
              <input type="file" accept="image/png,image/gif" @change="handleNewFile" class="text-xs" />
              <p class="text-[11px] text-gray-500">Optional. If set, the image and type will update. A timestamped filename will bypass cache.</p>
              <p v-if="err.image" class="text-red-600 text-[11px] mt-1">{{ err.image }}</p>
              <div v-if="newImagePreview" class="mt-1">
                <label class="text-xs font-medium">Preview</label>
                <img :src="newImagePreview" class="h-32 mt-1" />
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">cToon Sound (optional)</label>
              <div v-if="currentSoundPath && !clearSound" class="flex items-center gap-3">
                <audio :src="currentSoundPath" controls class="h-8"></audio>
                <button type="button" @click="clearSound = true" class="text-[11px] text-red-600 hover:underline">Remove sound</button>
              </div>
              <p v-else-if="clearSound" class="text-[11px] text-amber-600">Sound will be removed on save. <button type="button" @click="clearSound = false" class="underline">Undo</button></p>
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg" @change="handleSoundFile" class="text-xs" />
              <p class="text-[11px] text-gray-500">MP3, WAV, or OGG. Leave blank to keep existing. Uploading a new file replaces the current sound.</p>
              <p v-if="err.sound" class="text-red-600 text-[11px] mt-1">{{ err.sound }}</p>
              <p v-if="newSoundFile" class="text-[11px] text-green-600 mt-1">Selected: {{ newSoundFile.name }}</p>
            </div>
          </section>

          <!-- ── Identity & Classification ────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Identity &amp; Classification</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">What this cToon is called and how it's grouped/priced by rarity.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Type</label>
              <input v-model="type" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              <p class="text-[11px] text-gray-500">Set automatically from the image file — read only.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Name</label>
              <input v-model="name" required class="border rounded-md px-2 py-1.5 text-sm" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Series</label>
              <input v-model="series" list="series-list" required class="border rounded-md px-2 py-1.5 text-sm" />
              <datalist v-if="series.length >= 3" id="series-list">
                <option v-for="opt in filteredSeriesOptions" :key="opt" :value="opt" />
              </datalist>
              <p class="text-[11px] text-gray-500">Used to group similar cToons.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Set</label>
              <input v-model="setField" list="sets-list" required class="border rounded-md px-2 py-1.5 text-sm" />
              <datalist v-if="setField.length >= 3" id="sets-list">
                <option v-for="opt in filteredSetsOptions" :key="opt" :value="opt" />
              </datalist>
              <p class="text-[11px] text-gray-500">Which collectible set this cToon belongs to.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Rarity</label>
              <select v-model="rarity" required class="border rounded-md px-2 py-1.5 text-sm">
                <option disabled value="">Select rarity</option>
                <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <p class="text-[11px] text-gray-500">Drives the default price, quantity, and c-mart placement below.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">cMoon (optional)</label>
              <CtoonCMoonSelect v-model="cMoonId" />
              <p class="text-[11px] text-gray-500">If set, this cToon's modal (outside cMart/Auction) is redesigned in this cMoon's colors, with a link to its cMoon page.</p>
            </div>
          </section>

          <!-- ── Pricing ───────────────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Pricing</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Point cost to mint/purchase this cToon.</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Price</label>
              <input type="number" min="0" v-model.number="price" class="border rounded-md px-2 py-1.5 text-sm" />
              <p class="text-[11px] text-gray-500">Defaults based on rarity, but you can adjust it here.</p>
            </div>
          </section>

          <!-- ── Availability & Mint Limits ───────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Availability &amp; Mint Limits</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">When this cToon goes live, how many can be minted, and where it can be obtained.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Release Date &amp; Time (CDT)</label>
              <input type="datetime-local" v-model="releaseDate" required class="border rounded-md px-2 py-1.5 text-sm" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Mint Limit</label>
              <select v-model="mintLimitType" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                <option value="defined">Defined Number Limit</option>
                <option value="timeBased">Time Based Limit</option>
              </select>
              <p class="text-[11px] text-gray-500">
                <template v-if="mintLimitType === 'defined'">Set a fixed quantity. cToon sells out when all are minted.</template>
                <template v-else>Allow unlimited minting until the Mint End Date, then cap based on demand.</template>
              </p>
            </div>

            <div v-if="mintLimitType === 'timeBased'" class="flex flex-col gap-1">
              <label class="text-xs font-medium">Mint End Date/Time (CST)</label>
              <input v-model="mintEndDate" type="datetime-local" required class="border rounded-md px-2 py-1.5 text-sm" />
              <p class="text-[11px] text-gray-500">Minting will be open until this date/time, then the quantity will be capped.</p>
              <p v-if="mintEndDateLocal" class="text-[11px] text-blue-600 mt-1">
                (Your time: {{ mintEndDateLocal }})
              </p>
            </div>

            <div v-if="mintLimitType === 'timeBased'" class="border rounded-md bg-indigo-50 p-3 space-y-2">
              <div>
                <h3 class="text-xs font-semibold text-gray-800">Purchase Limit Override
                  <span class="text-[11px] font-normal text-gray-500 ml-1">— optional, overrides the rarity default from Global Settings</span>
                </h3>
                <p class="text-[11px] text-gray-500 mt-1">Leave either field blank to use the rarity default. Window blank = full release window.</p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Limit Count</label>
                  <input
                    type="number"
                    min="1"
                    :value="timeBasedLimitCountStr"
                    @input="timeBasedLimitCountStr = $event.target.value"
                    placeholder="Use rarity default"
                    class="border rounded-md px-2 py-1.5 text-sm"
                  />
                  <p class="text-[11px] text-gray-500">Max purchases per user.</p>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Window (days)</label>
                  <input
                    type="number"
                    min="1"
                    :value="timeBasedLimitWindowDaysStr"
                    @input="timeBasedLimitWindowDaysStr = $event.target.value"
                    placeholder="Full duration"
                    class="border rounded-md px-2 py-1.5 text-sm"
                  />
                  <p class="text-[11px] text-gray-500">Rolling window. Blank = full release window.</p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Per-User Limit</label>
                <input v-model.number="perUserLimit" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div v-if="mintLimitType === 'defined'" class="flex flex-col gap-1">
                <label class="text-xs font-medium">Total Quantity</label>
                <input v-model.number="quantity" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div v-if="mintLimitType === 'defined'" class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Quantity</label>
                <input v-model.number="initialQuantity" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3" v-if="schedule.initialQty != null && schedule.finalAtDisplay">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Release %</label>
                <input
                  v-model.number="releasePercent"
                  type="number"
                  min="1"
                  max="100"
                  @input="clampReleasePercent"
                  class="border rounded-md px-2 py-1.5 text-sm"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Release Qty</label>
                <input :value="schedule.initialQty" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Final Release At (CST/CDT)</label>
                <input :value="schedule.finalAtDisplay" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Final Release Qty</label>
                <input :value="schedule.finalQty" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
            </div>

            <label class="flex items-center gap-2">
              <input v-model="inCmart" type="checkbox"
                     :disabled="rarity === 'Prize Only' || rarity === 'Auction Only' || (rarity === 'Code Only' && !inCmart)" />
              <span class="text-xs font-medium">In C-mart</span>
            </label>
            <p class="text-[11px] text-gray-500">Whether this cToon is purchasable in the c-mart shop. Disabled automatically for Prize/Auction Only rarities.</p>
          </section>

          <!-- ── Description & Characters ─────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Description &amp; Characters</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Flavor text and character tags shown to players.</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Description</label>
              <textarea v-model="description" rows="3" class="border rounded-md px-2 py-1.5 text-sm" placeholder="Optional description"></textarea>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Characters (comma-separated)</label>
              <textarea v-model="characters" rows="2" class="border rounded-md px-2 py-1.5 text-sm"></textarea>
            </div>
          </section>

          <!-- ── G-toon Gameplay ───────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">G-toon Gameplay</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Only needed if this cToon is playable as a card in Clash.</p>
            </div>

            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="isGtoon" />
              <span class="text-xs font-medium">Is this a G-toon?</span>
            </label>

            <div v-if="isGtoon" class="border rounded-md bg-indigo-50 p-3 space-y-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Type (gToon)</label>
                <input v-model="gtoonType" type="text" class="border rounded-md px-2 py-1.5 text-sm" placeholder="e.g. Beast, Robot, Support" />
                <p class="text-[11px] text-gray-500">Optional. Leave blank if none.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Cost <span class="text-[11px] font-normal">(0–6)</span></label>
                <input v-model.number="cost" type="number" min="0" max="6" class="border rounded-md px-2 py-1.5 text-sm" />
                <p v-if="err.cost" class="text-red-600 text-[11px]">{{ err.cost }}</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Power <span class="text-[11px] font-normal">(0–12)</span></label>
                <input v-model.number="power" type="number" min="0" max="12" class="border rounded-md px-2 py-1.5 text-sm" />
                <p v-if="err.power" class="text-red-600 text-[11px]">{{ err.power }}</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Ability</label>
                <select v-model="abilityKey" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">None</option>
                  <option v-for="a in abilityKeyOptions" :key="a.key" :value="a.key">{{ a.label }}</option>
                </select>
              </div>
              <div v-if="selectedAbility && selectedAbility.params?.length" class="flex flex-col gap-1">
                <label class="text-xs font-medium">{{ selectedAbility.paramLabel }}</label>
                <select v-model="abilityParam" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option disabled :value="null">Select value</option>
                  <option v-for="p in selectedAbility.params" :key="p" :value="p">{{ p }}</option>
                </select>
              </div>
              <div class="text-[11px] text-gray-600">
                <p class="font-semibold">Ability cheat-sheet:</p>
                <ul class="list-disc list-inside">
                  <li><strong>Flame Bug</strong> – Deals X damage to a random enemy on play.</li>
                  <li><strong>Heal Ally</strong> – Heals all friendlies in lane by X.</li>
                </ul>
              </div>
            </div>
          </section>

          <!-- ── Second Edition ────────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Second Edition</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Mark this cToon as a reprint of an existing one, with an overlay badge.</p>
            </div>
            <SecondEditionFields
              v-model="secondEdition"
              :ctoon-image-src="newImagePreview || assetPath"
              :exclude-ctoon-id="id"
            />
          </section>

          <!-- Submit -->
          <div class="text-right">
            <button class="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700">
              Update cToon
            </button>
          </div>
        </form>

        <Toast v-if="showToast" :message="toastMessage" :type="toastType" />
      </div>
    </div>
  </div>
</template>

<script setup>

import { ref, reactive, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { zonedTimeToUtc } from 'date-fns-tz'
import Toast from '~/components/Toast.vue'
import abilityMeta from '~/data/abilities.json'
import SecondEditionFields from '~/components/admin/SecondEditionFields.vue'

const route = useRoute()
const router = useRouter()
// Rendered by the admin shell's catch-all route, which passes the
// trailing URL segments as `subPath`. The route.params fallback keeps
// this component usable if it is ever mounted from a real dynamic route.
const props = defineProps({ subPath: { type: Array, default: () => [] } })
const id = props.subPath[0] ?? route.params.id

/* core refs */
const name = ref(''); const type = ref('')
const series = ref(''); const rarity = ref('')
const cMoonId = ref(null)
const price = ref(0); const releaseDate = ref('')
const rarityDefaults = ref(null)
const ctoonLoaded = ref(false)
const perUserLimit = ref(null); const quantity = ref(null)
const initialQuantity = ref(null); const inCmart = ref(false)
const assetPath = ref(''); const setField = ref('')
const characters = ref('')
const description = ref('')

/* mint limit refs */
const mintLimitType = ref('defined')
const mintEndDate = ref('')
const timeBasedLimitCountStr = ref('')      // '' = no override (use rarity default)
const timeBasedLimitWindowDaysStr = ref('') // '' = no override (use rarity default / full duration)

/* new image refs */
const newImageFile = ref(null)
const newImagePreview = ref('')

/* sound refs */
const currentSoundPath = ref('')
const newSoundFile = ref(null)
const clearSound = ref(false)

/* Second Edition refs */
const secondEdition = ref({
  isSecondEdition: false,
  relatedFirstEditionId: null,
  relatedFirstEditionName: '',
  overlayX: 85,
  overlayY: 85,
  overlaySize: 100
})

/* G-toon refs */
const isGtoon = ref(false)
const cost = ref(0); const power = ref(0)
const abilityKey = ref('')
const abilityParam = ref(null)
const gtoonType = ref('')

const abilityKeyOptions = abilityMeta

const selectedAbility = computed(() =>
  abilityKeyOptions.find(a => a.key === abilityKey.value) || null
)

/* validation errors */
const err = reactive({ cost:'', power:'', image:'', sound:'' })

/* series + set + rarity lists */
const seriesOptions = ref([])
const setsOptions = ref([])
const rarityOptions = ['Common','Uncommon','Rare','Very Rare','Crazy Rare','Prize Only','Code Only','Auction Only']

// only show suggestions once the user has typed ≥3 chars
const filteredSeriesOptions = computed(() => {
  if (series.value.length < 3) return []
  return seriesOptions.value.filter(opt =>
    opt.toLowerCase().includes(series.value.toLowerCase())
  )
})

const filteredSetsOptions = computed(() => {
  if (setField.value.length < 3) return []
  return setsOptions.value.filter(opt =>
    opt.toLowerCase().includes(setField.value.toLowerCase())
  )
})
const releasePercent = ref(75)
const delayHours = ref(12)

function clampReleasePercent() {
  const next = Number(releasePercent.value)
  if (!Number.isFinite(next)) {
    releasePercent.value = 1
    return
  }
  releasePercent.value = Math.min(100, Math.max(1, next))
}

// Compute the user's local timezone display for the mint end date
const mintEndDateLocal = computed(() => {
  if (!mintEndDate.value) return ''
  try {
    const utc = zonedTimeToUtc(mintEndDate.value, 'America/Chicago')
    return utc.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour12: true })
  } catch {
    return ''
  }
})

/* toast helpers */
const showToast = ref(false)
const toastMessage = ref(''); const toastType = ref('success')
function displayToast(msg, type='error'){ toastMessage.value = msg; toastType.value = type; showToast.value = true; setTimeout(()=>showToast.value = false, 4000) }

/* date helpers (pure JS; America/Chicago) */
function nthSundayDay(year, monthNumber) {
  const monthIdx = monthNumber - 1
  const first = new Date(Date.UTC(year, monthIdx, 1))
  const firstDow = first.getUTCDay() // 0=Sun
  const firstSunday = 1 + ((7 - firstDow) % 7)
  if (monthNumber === 3) return firstSunday + 7 // second Sunday in March
  if (monthNumber === 11) return firstSunday    // first Sunday in November
  return firstSunday
}
function isChicagoDstLocalParts(y, m, d) {
  if (m < 3 || m > 11) return false
  if (m > 3 && m < 11) return true
  if (m === 3) return d >= nthSundayDay(y, 3)
  if (m === 11) return d < nthSundayDay(y, 11)
  return false
}
function toDateTimeLocal(utc) {
  const dt = new Date(utc)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
  const parts = Object.fromEntries(fmt.formatToParts(dt).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
function localToUtcIso(localStr) {
  // localStr is 'YYYY-MM-DDTHH:mm' in America/Chicago
  const [datePart, timePart] = localStr.split('T')
  const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10))
  const [hh, mm] = timePart.split(':').map(n => parseInt(n, 10))
  const isDst = isChicagoDstLocalParts(y, m, d)
  const offset = isDst ? '-05:00' : '-06:00'
  const isoLike = `${datePart}T${timePart}:00${offset}`
  return new Date(isoLike).toISOString()
}

/* reset param when ability cleared */
watch(abilityKey, val => {
  if (!val) abilityParam.value = null
})

/* load data */
onMounted(async ()=>{
  try{
    // load staged release settings
    try {
      const rs = await $fetch('/api/release-settings')
      releasePercent.value = Number(rs.initialReleasePercent ?? 75)
      delayHours.value = Number(rs.finalReleaseDelayHours ?? 12)
      clampReleasePercent()
    } catch {}
    const res = await fetch(`/api/admin/ctoon/${id}`,{credentials:'include'})
    if(!res.ok) throw new Error()
    const { ctoon } = await res.json()

    name.value = ctoon.name
    type.value = ctoon.type
    series.value = ctoon.series || ''
    rarity.value = ctoon.rarity
    cMoonId.value = ctoon.cMoonId || null
    price.value = ctoon.price
    releaseDate.value = toDateTimeLocal(ctoon.releaseDate)
    perUserLimit.value = ctoon.perUserLimit
    quantity.value = ctoon.quantity
    initialQuantity.value = ctoon.initialQuantity
    inCmart.value = ctoon.inCmart
    assetPath.value = ctoon.assetPath
    setField.value = ctoon.set || ''
    characters.value = (ctoon.characters||[]).join(', ')
    description.value = ctoon.description || ''
    mintLimitType.value = ctoon.mintLimitType || 'defined'
    if (ctoon.mintEndDate) mintEndDate.value = toDateTimeLocal(ctoon.mintEndDate)
    timeBasedLimitCountStr.value      = ctoon.timeBasedLimitCount      != null ? String(ctoon.timeBasedLimitCount)      : ''
    timeBasedLimitWindowDaysStr.value = ctoon.timeBasedLimitWindowDays != null ? String(ctoon.timeBasedLimitWindowDays) : ''
    currentSoundPath.value = ctoon.soundPath || ''
    if (ctoon.quantity != null && ctoon.initialReleaseQty != null) {
      const qty = Number(ctoon.quantity)
      const initQty = Number(ctoon.initialReleaseQty)
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(initQty) && initQty > 0) {
        releasePercent.value = Math.round((initQty / qty) * 100)
        clampReleasePercent()
      }
    }

    secondEdition.value = {
      isSecondEdition: !!ctoon.isSecondEdition,
      relatedFirstEditionId: ctoon.relatedFirstEditionId || null,
      relatedFirstEditionName: ctoon.relatedFirstEdition?.name || '',
      overlayX: ctoon.secondEditionOverlayX ?? 85,
      overlayY: ctoon.secondEditionOverlayY ?? 85,
      overlaySize: ctoon.secondEditionOverlaySize ?? 100
    }

    isGtoon.value   = ctoon.isGtoon
    gtoonType.value = ctoon.gtoonType || ''
    cost.value      = ctoon.cost ?? 0
    power.value     = ctoon.power ?? 0
    abilityKey.value= ctoon.abilityKey || ''
    if(ctoon.abilityData && ctoon.abilityKey) {
      const param = Object.values(ctoon.abilityData)[0]
      if(param != null) abilityParam.value = param
    }

    const [sRes, setsRes] = await Promise.all([
      fetch('/api/admin/series',{credentials:'include'}),
      fetch('/api/admin/sets',{credentials:'include'})
    ])
    seriesOptions.value = await sRes.json()
    setsOptions.value = (await setsRes.json()).filter(Boolean)

    try {
      const rdRes = await fetch('/api/rarity-defaults')
      const rdJson = await rdRes.json()
      rarityDefaults.value = rdJson?.defaults || null
    } catch {}

    ctoonLoaded.value = true
  }catch{ displayToast('Error loading cToon') }
})

watch(rarity, v => {
  if (!ctoonLoaded.value) return
  const d = rarityDefaults.value?.[v]
  if (d) {
    price.value = Number(d.price ?? 0)
  } else {
    const map = { Common:100, Uncommon:200, Rare:400, 'Very Rare':750, 'Crazy Rare':1250 }
    price.value = map[v] || 0
  }
})

function handleSoundFile(e){
  err.sound = ''
  const file = e.target.files?.[0]
  if (!file){ newSoundFile.value = null; return }
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg']
  if (!allowed.includes(file.type)){
    err.sound = 'Only MP3, WAV, or OGG files allowed.'
    newSoundFile.value = null
    return
  }
  newSoundFile.value = file
  clearSound.value = false
}

function handleNewFile(e){
  err.image = ''
  const file = e.target.files?.[0]
  if (!file){ newImageFile.value = null; newImagePreview.value = ''; return }
  if (!['image/png','image/gif'].includes(file.type)){
    err.image = 'Only PNG or GIF files allowed.'
    return
  }
  newImageFile.value = file
  type.value = file.type // reflect pending change
  const reader = new FileReader()
  reader.onload = () => { newImagePreview.value = reader.result }
  reader.readAsDataURL(file)
}

// computed schedule for display + advisory persistence
const schedule = computed(() => {
  const qty = Number(quantity.value)
  const hasQty = Number.isFinite(qty) && qty > 0
  const hasDate = Boolean(releaseDate.value)
  if (!hasQty || !hasDate) return { initialQty: null, finalQty: null, finalAt: null, finalAtDisplay: '' }
  const init = Math.max(1, Math.floor((qty * Number(releasePercent.value)) / 100))
  const fin = Math.max(0, qty - init)
  const base = new Date(releaseDate.value)
  const finAt = new Date(base.getTime() + Number(delayHours.value) * 60 * 60 * 1000)
  const finDisplay = finAt.toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false })
  return { initialQty: init, finalQty: fin, finalAt: finAt, finalAtDisplay: finDisplay }
})

/* submit */
async function submitForm(){
  err.cost=''; err.power=''
  if (isGtoon.value) {
    if (cost.value<0||cost.value>6)    err.cost='Cost 0-6'
    if (power.value<0||power.value>12) err.power='Power 0-12'
    if (err.cost || err.power) return
  }
  const gtoonTypeValue = isGtoon.value ? gtoonType.value.trim() : ''

  // If a new image or sound is selected, send multipart; else JSON.
  if (newImageFile.value || newSoundFile.value){
    const fd = new FormData()
    if (newImageFile.value) fd.append('image', newImageFile.value)
    fd.append('name', name.value.trim())
    fd.append('series', series.value.trim())
    fd.append('rarity', rarity.value)
    fd.append('cMoonId', cMoonId.value || '')
    fd.append('price', String(price.value))
    fd.append('releaseDate', localToUtcIso(releaseDate.value))
    fd.append('mintLimitType', mintLimitType.value)
    if (mintLimitType.value === 'timeBased' && mintEndDate.value) {
      fd.append('mintEndDate', localToUtcIso(mintEndDate.value))
    }
    fd.append('timeBasedLimitCount',      timeBasedLimitCountStr.value)
    fd.append('timeBasedLimitWindowDays', timeBasedLimitWindowDaysStr.value)
    fd.append('perUserLimit', perUserLimit.value ?? '')
    fd.append('quantity', mintLimitType.value === 'defined' ? (quantity.value ?? '') : '')
    fd.append('initialQuantity', mintLimitType.value === 'defined' ? (initialQuantity.value ?? '') : '')
    fd.append('inCmart', inCmart.value)
    fd.append('set', setField.value)
    fd.append('description', description.value.trim())
    fd.append('characters', JSON.stringify(characters.value.split(',').map(s=>s.trim()).filter(Boolean)))
    fd.append('isGtoon', isGtoon.value)
    fd.append('gtoonType', gtoonTypeValue)
    fd.append('cost', String(cost.value))
    fd.append('power', String(power.value))
    fd.append('abilityKey', abilityKey.value || '')
    if (abilityKey.value){
      fd.append('abilityData', JSON.stringify({ value: abilityParam.value }))
    }

    // advisory schedule fields
    fd.append('initialReleaseAt', releaseDate.value ? new Date(releaseDate.value).toISOString() : '')
    fd.append('finalReleaseAt', schedule.value.finalAt ? schedule.value.finalAt.toISOString() : '')
    fd.append('initialReleaseQty', schedule.value.initialQty ?? '')
    fd.append('finalReleaseQty', schedule.value.finalQty ?? '')

    if (newSoundFile.value) fd.append('sound', newSoundFile.value)
    else if (clearSound.value) fd.append('clearSound', 'true')

    fd.append('isSecondEdition', secondEdition.value.isSecondEdition)
    if (secondEdition.value.isSecondEdition) {
      fd.append('relatedFirstEditionId', secondEdition.value.relatedFirstEditionId ?? '')
      fd.append('secondEditionOverlayX', secondEdition.value.overlayX)
      fd.append('secondEditionOverlayY', secondEdition.value.overlayY)
      fd.append('secondEditionOverlaySize', secondEdition.value.overlaySize)
    }

    const res = await fetch(`/api/admin/ctoon/${id}`, {
      method: 'PUT',
      credentials: 'include',
      body: fd
    })
    if (!res.ok) return displayToast('Update failed')
    displayToast('Updated','success')
    router.push('/newsite/admin/ctoons')
    return
  }

  // JSON path (no image change)
  const body = {
    name:            name.value.trim(),
    series:          series.value.trim(),
    rarity:          rarity.value,
    cMoonId:         cMoonId.value || null,
    price:           price.value,
    releaseDate:     localToUtcIso(releaseDate.value),

    mintLimitType:   mintLimitType.value,
    mintEndDate:     mintLimitType.value === 'timeBased' && mintEndDate.value
                       ? localToUtcIso(mintEndDate.value) : null,
    timeBasedLimitCount:      timeBasedLimitCountStr.value      !== '' && !isNaN(Number(timeBasedLimitCountStr.value))      ? Number(timeBasedLimitCountStr.value)      : null,
    timeBasedLimitWindowDays: timeBasedLimitWindowDaysStr.value !== '' && !isNaN(Number(timeBasedLimitWindowDaysStr.value)) ? Number(timeBasedLimitWindowDaysStr.value) : null,
    perUserLimit:    perUserLimit.value,
    quantity:        mintLimitType.value === 'defined' ? quantity.value : null,
    initialQuantity: mintLimitType.value === 'defined' ? initialQuantity.value : null,
    inCmart:         inCmart.value,

    set:             setField.value,
    description:     description.value.trim() || null,
    characters:      characters.value.split(',').map(s => s.trim()),

    isGtoon:         isGtoon.value,
    gtoonType:       gtoonTypeValue || null,
    cost:            cost.value,
    power:           power.value,
    abilityKey:      abilityKey.value || null,
    abilityData:     abilityKey.value
                      ? JSON.stringify({ value: abilityParam.value })
                      : null,

    // advisory schedule fields
    initialReleaseAt: releaseDate.value ? new Date(releaseDate.value).toISOString() : null,
    finalReleaseAt:   schedule.value.finalAt ? schedule.value.finalAt.toISOString() : null,
    initialReleaseQty: schedule.value.initialQty ?? null,
    finalReleaseQty:   schedule.value.finalQty ?? null,

    isSecondEdition: secondEdition.value.isSecondEdition,
    relatedFirstEditionId: secondEdition.value.isSecondEdition ? (secondEdition.value.relatedFirstEditionId ?? null) : null,
    secondEditionOverlayX: secondEdition.value.isSecondEdition ? secondEdition.value.overlayX : null,
    secondEditionOverlayY: secondEdition.value.isSecondEdition ? secondEdition.value.overlayY : null,
    secondEditionOverlaySize: secondEdition.value.isSecondEdition ? secondEdition.value.overlaySize : null,

    clearSound: clearSound.value || false
  }

  const res = await fetch(`/api/admin/ctoon/${id}`, {
    method:      'PUT',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(body)
  })

  if (!res.ok) return displayToast('Update failed')
  displayToast('Updated','success')
  router.push('/newsite/admin/ctoons')
}
</script>
