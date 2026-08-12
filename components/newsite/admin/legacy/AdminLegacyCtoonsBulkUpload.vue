<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

    <!-- Toast notifications -->
    <Toast
      v-for="t in toasts"
      :key="t.id"
      :message="t.message"
      :type="t.type"
    />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-3">
      <h1 class="text-base font-semibold mb-3">Bulk Upload cToons</h1>

      <!-- STEP 1: Image Upload -->
      <div v-if="step === 1" class="space-y-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">Select Images</label>
          <input
            type="file"
            accept="image/png,image/gif"
            multiple
            @change="handleFiles"
            class="text-xs"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="(file, i) in imageFiles"
            :key="i"
            class="w-20 h-20 border rounded overflow-hidden"
          >
            <img
              :src="file.preview"
              :alt="file.name"
              class="object-cover w-full h-full"
            />
          </div>
        </div>
        <div class="text-right">
          <button
            @click="step = 2"
            :disabled="!imageFiles.length"
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Next: Details
          </button>
        </div>
      </div>

      <!-- STEP 2: Metadata & Table -->
      <div v-else class="space-y-3">

        <!-- ── Batch Identity ────────────────────────────────────── -->
        <section class="border rounded-lg p-3 space-y-3">
          <div>
            <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Batch Identity</h2>
            <p class="text-[11px] text-gray-500 mt-0.5">Set, series, and release date applied to every cToon in this batch.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Set</label>
              <input
                v-model="bulkSet"
                list="sets-list"
                required
                class="border rounded-md px-2 py-1.5 text-sm"
              />
              <datalist v-if="bulkSet.length >= 2" id="sets-list">
                <option
                  v-for="opt in filteredBulkSetsOptions"
                  :key="opt"
                  :value="opt"
                />
              </datalist>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Series</label>
              <input
                v-model="bulkSeries"
                list="bulk-series-list"
                required
                class="border rounded-md px-2 py-1.5 text-sm"
              />
              <datalist v-if="bulkSeries.length >= 2" id="bulk-series-list">
                <option
                  v-for="opt in filteredBulkSeriesOptions"
                  :key="opt"
                  :value="opt"
                />
              </datalist>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Release Date</label>
              <input
                v-model="bulkReleaseDate"
                type="datetime-local"
                required
                class="border rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </section>

        <!-- ── Mint Limit & Purchase Limits ─────────────────────── -->
        <section class="border rounded-lg p-3 space-y-3">
          <div>
            <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Mint Limit &amp; Purchase Limits</h2>
            <p class="text-[11px] text-gray-500 mt-0.5">How many total mints happen, and any per-user purchase override, for every cToon in this batch.</p>
          </div>

          <!-- Mint Limit Type -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Mint Limit</label>
              <select v-model="bulkMintLimitType" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                <option value="defined">Defined Number Limit</option>
                <option value="timeBased">Time Based Limit</option>
              </select>
              <p class="text-[11px] text-gray-500">
                <template v-if="bulkMintLimitType === 'defined'">Fixed quantity per cToon.</template>
                <template v-else>Unlimited minting until Mint End Date.</template>
              </p>
            </div>
            <div v-if="bulkMintLimitType === 'timeBased'" class="flex flex-col gap-1">
              <label class="text-xs font-medium">Mint End Date/Time (CST)</label>
              <input
                v-model="bulkMintEndDate"
                type="datetime-local"
                required
                class="border rounded-md px-2 py-1.5 text-sm"
              />
              <p class="text-[11px] text-gray-500">Minting open until this date/time.</p>
              <p v-if="bulkMintEndDateLocal" class="text-[11px] text-blue-600 mt-1">
                (Your time: {{ bulkMintEndDateLocal }})
              </p>
            </div>
          </div>

          <!-- Time-Based Purchase Limit Override (bulk, only for timeBased) -->
          <div v-if="bulkMintLimitType === 'timeBased'" class="border rounded-md bg-indigo-50 p-3 space-y-2">
            <div>
              <h3 class="text-xs font-semibold text-gray-800">Purchase Limit Override
                <span class="text-[11px] font-normal text-gray-500 ml-1">— applied to all cToons in this batch; leave blank to use each rarity's default</span>
              </h3>
              <p class="text-[11px] text-gray-500 mt-1">Window blank = full release window (release date → mint end date).</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Limit Count</label>
                <input
                  type="number"
                  min="1"
                  :value="bulkTimeBasedLimitCountStr"
                  @input="bulkTimeBasedLimitCountStr = $event.target.value"
                  placeholder="Use rarity default"
                  class="border rounded-md px-2 py-1.5 text-sm"
                />
                <p class="text-[11px] text-gray-500">Max purchases per user for each cToon.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Window (days)</label>
                <input
                  type="number"
                  min="1"
                  :value="bulkTimeBasedLimitWindowDaysStr"
                  @input="bulkTimeBasedLimitWindowDaysStr = $event.target.value"
                  placeholder="Full duration"
                  class="border rounded-md px-2 py-1.5 text-sm"
                />
                <p class="text-[11px] text-gray-500">Rolling window. Blank = full release window.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Release Schedule (applies to each row based on its Total Qty) ─ -->
        <section v-if="bulkReleaseDate" class="border rounded-lg p-3 space-y-3">
          <div>
            <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Release Schedule</h2>
            <p class="text-[11px] text-gray-500 mt-0.5">Initial/Final quantities are computed per row from each Total Qty.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <label class="text-xs font-medium">Final Release At (CST/CDT)</label>
              <input :value="new Date(new Date(bulkReleaseDate).getTime() + delayHours*3600000).toLocaleString('en-US',{timeZone:'America/Chicago',hour12:false})" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
            </div>
          </div>
        </section>

        <!-- Desktop Table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-max table-auto border-separate border-spacing-0 text-xs">
            <thead>
              <tr class="bg-gray-100">
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Preview</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Duplicate</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">2nd Ed.</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Name</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Series</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Rarity</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Characters</th>
                <th v-if="bulkMintLimitType === 'defined'" class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Total Qty</th>
                <th v-if="bulkMintLimitType === 'defined'" class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Initial Qty</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Per-User Limit</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">In cMart</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in imageFiles" :key="f.id" class="border-b">
                <td class="px-2 py-1.5">
                  <img :src="f.preview" alt class="h-10 w-auto rounded" />
                </td>
                <td class="px-2 py-1.5">
                  <div v-if="f.duplicateStatus === 'checking'" class="text-[11px] text-gray-500">Checking...</div>
                  <div v-else-if="f.duplicateStatus === 'error'" class="text-[11px] text-red-600">
                    {{ f.duplicateError || 'Duplicate check failed.' }}
                  </div>
                  <div v-else-if="f.duplicateMatch" class="text-[11px]">
                    <div class="text-amber-700 font-medium">Possible duplicate</div>
                    <div class="flex items-center gap-2 mt-1">
                      <img
                        v-if="f.duplicateMatch.ctoon?.assetPath"
                        :src="f.duplicateMatch.ctoon.assetPath"
                        alt="Possible duplicate"
                        class="w-9 h-9 object-contain border rounded bg-white"
                      />
                      <div class="text-[11px] leading-tight">
                        <div class="font-medium truncate max-w-[140px]">
                          {{ f.duplicateMatch.ctoon?.name || 'Unknown cToon' }}
                        </div>
                        <div class="text-gray-600">
                          p: {{ f.duplicateMatch.phashDist }}, d: {{ f.duplicateMatch.dhashDist }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="f.duplicateStatus === 'done'" class="text-[11px] text-green-600">No duplicates</div>
                </td>
                <td class="px-2 py-1.5" style="min-width:180px;">
                  <SecondEditionFields
                    :model-value="rowSecondEdition(f)"
                    :exclude-ctoon-id="''"
                    :show-position-editor="false"
                    @update:model-value="val => applyRowSecondEdition(f, val)"
                  />
                </td>
                <td class="px-2 py-1.5">
                  <input v-model="f.nameField" class="border rounded px-1.5 py-1 text-xs w-full" />
                </td>
                <td class="px-2 py-1.5">
                  <input
                    v-model="f.series"
                    :list="`row-series-list-desktop-${f.id}`"
                    class="border rounded px-1.5 py-1 text-xs w-full"
                    @input="lockRowSeries(f)"
                  />
                  <datalist
                    v-if="(f.series || '').length >= 2"
                    :id="`row-series-list-desktop-${f.id}`"
                  >
                    <option
                      v-for="opt in filteredSeriesOptionsFor(f.series)"
                      :key="opt"
                      :value="opt"
                    />
                  </datalist>
                </td>
                <td class="px-2 py-1.5">
                  <select v-model="f.rarity" class="border rounded px-1.5 py-1 text-xs w-full bg-white" @change="updateDefaults(f)">
                    <option v-for="opt in rarityOptions" :key="opt" :value="opt">
                      {{ opt }}
                    </option>
                  </select>
                </td>
                <td class="px-2 py-1.5">
                  <input v-model="f.characters" class="border rounded px-1.5 py-1 text-xs w-full" placeholder="e.g. Amy,Bob"/>
                </td>
                <td v-if="bulkMintLimitType === 'defined'" class="px-2 py-1.5">
                  <input v-model.number="f.totalQuantity" type="number" min="1" class="border rounded px-1.5 py-1 text-xs w-full" />
                </td>
                <td v-if="bulkMintLimitType === 'defined'" class="px-2 py-1.5">
                  <input v-model.number="f.initialQuantity" type="number" min="0" class="border rounded px-1.5 py-1 text-xs w-full" />
                </td>
                <td class="px-2 py-1.5">
                  <input v-model.number="f.perUserLimit" type="number" min="0" class="border rounded px-1.5 py-1 text-xs w-full" />
                </td>
                <td class="px-2 py-1.5 text-center">
                  <input type="checkbox" v-model="f.inCmart" />
                </td>
                <td class="px-2 py-1.5">
                  <input v-model.number="f.price" type="number" class="border rounded px-1.5 py-1 text-xs w-full" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="space-y-3 block sm:hidden">
          <div
            v-for="(f, i) in imageFiles"
            :key="f.id"
            class="bg-gray-100 rounded-lg p-3"
          >
            <!-- Image on top -->
            <img
              :src="f.preview"
              :alt="f.nameField"
              class="w-full h-32 object-cover rounded mb-3"
            />
            <div class="mb-3">
              <div v-if="f.duplicateStatus === 'checking'" class="text-[11px] text-gray-500">Checking for duplicates...</div>
              <div v-else-if="f.duplicateStatus === 'error'" class="text-[11px] text-red-600">
                {{ f.duplicateError || 'Duplicate check failed.' }}
              </div>
              <div v-else-if="f.duplicateMatch" class="text-[11px] bg-amber-50 border rounded p-2">
                <div class="text-amber-700 font-medium">Possible duplicate found</div>
                <div class="flex items-center gap-2 mt-2">
                  <img
                    v-if="f.duplicateMatch.ctoon?.assetPath"
                    :src="f.duplicateMatch.ctoon.assetPath"
                    alt="Possible duplicate"
                    class="w-10 h-10 object-contain border rounded bg-white"
                  />
                  <div class="text-[11px] leading-tight">
                    <div class="font-medium">
                      {{ f.duplicateMatch.ctoon?.name || 'Unknown cToon' }}
                    </div>
                    <div class="text-gray-600">
                      p: {{ f.duplicateMatch.phashDist }}, d: {{ f.duplicateMatch.dhashDist }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-else-if="f.duplicateStatus === 'done'" class="text-[11px] text-green-600">No duplicates found.</div>
            </div>

            <SecondEditionFields
              :model-value="rowSecondEdition(f)"
              :exclude-ctoon-id="''"
              :show-position-editor="false"
              @update:model-value="val => applyRowSecondEdition(f, val)"
            />

            <!-- Fields underneath -->
            <div class="space-y-3">
              <!-- Name -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Name</label>
                <input
                  v-model="f.nameField"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Enter cToon name"
                />
                <p class="text-[11px] text-gray-500">
                  The display name for this cToon.
                </p>
              </div>

              <!-- Series -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Series</label>
                <input
                  v-model="f.series"
                  :list="`row-series-list-mobile-${f.id}`"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Enter series"
                  @input="lockRowSeries(f)"
                />
                <datalist
                  v-if="(f.series || '').length >= 2"
                  :id="`row-series-list-mobile-${f.id}`"
                >
                  <option
                    v-for="opt in filteredSeriesOptionsFor(f.series)"
                    :key="opt"
                    :value="opt"
                  />
                </datalist>
                <p class="text-[11px] text-gray-500">
                  Defaults to the bulk series unless overridden.
                </p>
              </div>

              <!-- Rarity -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Rarity</label>
                <select
                  v-model="f.rarity"
                  @change="updateDefaults(f)"
                  class="border rounded-md px-2 py-1.5 text-sm bg-white"
                >
                  <option disabled value="">Select rarity</option>
                  <option
                    v-for="opt in rarityOptions"
                    :key="opt"
                    :value="opt"
                  >{{ opt }}</option>
                </select>
                <p class="text-[11px] text-gray-500">
                  Choose the rarity tier for this cToon.
                </p>
              </div>

              <!-- Characters -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">
                  Characters (comma-separated)
                </label>
                <input
                  v-model="f.characters"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="e.g. Amy,Bob"
                />
                <p class="text-[11px] text-gray-500">
                  List all characters featured in this cToon.
                </p>
              </div>

              <!-- Total Quantity (only for Defined Number Limit) -->
              <div v-if="bulkMintLimitType === 'defined'" class="flex flex-col gap-1">
                <label class="text-xs font-medium">Total Quantity</label>
                <input
                  v-model.number="f.totalQuantity"
                  type="number"
                  min="1"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Leave blank for unlimited"
                />
                <p class="text-[11px] text-gray-500">
                  Maximum number that can be minted. Leave blank for unlimited.
                </p>
              </div>

              <!-- Initial Quantity (only for Defined Number Limit) -->
              <div v-if="bulkMintLimitType === 'defined'" class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Quantity</label>
                <input
                  v-model.number="f.initialQuantity"
                  type="number"
                  min="0"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Number of first editions"
                />
                <p class="text-[11px] text-gray-500">
                  Number of first editions available. Must be ≤ total quantity.
                </p>
              </div>

              <!-- Per-User Limit -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Per-User Limit</label>
                <input
                  v-model.number="f.perUserLimit"
                  type="number"
                  min="0"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Limit per user"
                />
                <p class="text-[11px] text-gray-500">
                  Limit on how many each user can mint within the first 48 hours of
                  release. Leave blank for no limit.
                </p>
              </div>

              <!-- In cMart -->
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  v-model="f.inCmart"
                />
                <span class="text-xs font-medium">In cMart</span>
              </label>
              <p class="text-[11px] text-gray-500">
                Check to list this cToon in the shop.
              </p>

              <!-- Price -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Price</label>
                <input
                  v-model.number="f.price"
                  type="number"
                  class="border rounded-md px-2 py-1.5 text-sm"
                />
                <p class="text-[11px] text-gray-500">
                  Defaults based on rarity, but you can adjust it here.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Upload Button -->
        <div class="text-right">
          <button
            @click="uploadAll"
            :disabled="uploading || !canUpload"
            class="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {{ uploading ? 'Uploading cToons...' : 'Upload cToons' }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, computed, watch } from 'vue'
import { zonedTimeToUtc } from 'date-fns-tz'
import { useRouter } from 'vue-router'
import Toast from '~/components/Toast.vue'
import SecondEditionFields from '~/components/admin/SecondEditionFields.vue'
// Object URLs for the per-file previews. Each pins its Blob until revoked;
// a bulk session can hold dozens of full-size images alive otherwise.
const uploadResources = useAdminResources()

const router = useRouter()
const step = ref(1)
const imageFiles = ref([])
const setsOptions = ref([])
const seriesOptions = ref([])
const bulkSet = ref('')
const bulkSeries = ref('')
const bulkReleaseDate = ref('')
const bulkMintLimitType = ref('defined')
const bulkMintEndDate = ref('')
const bulkTimeBasedLimitCountStr = ref('')      // '' = use rarity default
const bulkTimeBasedLimitWindowDaysStr = ref('') // '' = use rarity default / full duration
const uploading = ref(false)
const releasePercent = ref(75)
const delayHours = ref(12)

// Compute the user's local timezone display for the bulk mint end date
const bulkMintEndDateLocal = computed(() => {
  if (!bulkMintEndDate.value) return ''
  try {
    const utc = zonedTimeToUtc(bulkMintEndDate.value, 'America/Chicago')
    return utc.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour12: true })
  } catch {
    return ''
  }
})

// Auto-set bulkMintEndDate to bulkReleaseDate + 7 days
watch([bulkReleaseDate, bulkMintLimitType], () => {
  if (bulkMintLimitType.value === 'timeBased' && bulkReleaseDate.value && !bulkMintEndDate.value) {
    const base = new Date(bulkReleaseDate.value)
    base.setDate(base.getDate() + 7)
    const pad = n => String(n).padStart(2, '0')
    bulkMintEndDate.value = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`
  }
})

function clampReleasePercent() {
  const next = Number(releasePercent.value)
  if (!Number.isFinite(next)) {
    releasePercent.value = 1
    return
  }
  releasePercent.value = Math.min(100, Math.max(1, next))
}

// only allow upload once every file has a rarity AND a non-empty characters string
const canUpload = computed(() => {
  return (
    // at least one file
    imageFiles.value.length > 0 &&
    // bulk metadata filled
    Boolean(bulkSet.value.trim()) &&
    Boolean(bulkSeries.value.trim()) &&
    Boolean(bulkReleaseDate.value) &&
    // each row has rarity + non-empty characters + series
    imageFiles.value.every(f =>
      Boolean(f.rarity) &&
      f.characters.trim().length > 0 &&
      resolveRowSeries(f).length > 0
    )
  )
})

const RARITY_PATTERNS = [
  { key: 'Crazy Rare', re: /crazy[\s_]*rare/i },
  { key: 'Very Rare',  re: /very[\s_]*rare/i },
  { key: 'Uncommon',   re: /un[\s_]*common/i },
  { key: 'Common',     re: /common/i },
  { key: 'Rare',       re: /rare/i },
  { key: 'Prize Only', re: /prize[\s_]*only/i },
  { key: 'Code Only',  re: /code[\s_]*only/i },
  { key: 'Auction Only', re: /auction[\s_]*only/i }
]

const rarityOptions = [
  'Common',
  'Uncommon',
  'Rare',
  'Very Rare',
  'Crazy Rare',
  'Prize Only',
  'Code Only',
  'Auction Only'
]

const makeRowId = (() => {
  let n = 0
  return () =>
    (globalThis.crypto?.randomUUID?.() ?? `row_${Date.now().toString(36)}_${n++}`)
})()

const DUPLICATE_CHECK_CONCURRENCY = 3

// toast state
const toasts = ref([])
function showToast(message, type = 'error') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 5000)
}

function profileFromName(basename) {
  let working = basename
  let detected = ''

  // Detect & strip rarity (first match wins)
  for (const { key, re } of RARITY_PATTERNS) {
    if (re.test(working)) {
      detected = key
      // remove ALL instances of the matched rarity pattern
      const rm = new RegExp(re.source, 'ig')
      working = working.replace(rm, '')
      break
    }
  }

  // Remove any "_pic" (before stripping underscores)
  working = working.replace(/_pic/ig, '')

  // Remove all underscores
  working = working.replace(/_/g, ' ')

  // Collapse extra spaces and trim
  working = working.replace(/\s{2,}/g, ' ').trim()

  return { name: working, rarity: detected }
}

// server-provided rarity defaults (loaded in onMounted)
const rarityDefaults = ref(null)

// apply the same defaults logic as addCtoon.vue, but sourced from global settings
function updateDefaults(f) {
  const d = rarityDefaults.value?.[f.rarity]
  if (d) {
    f.totalQuantity   = d.totalQuantity ?? null
    f.initialQuantity = d.initialQuantity ?? null
    f.perUserLimit    = d.perUserLimit ?? null
    f.inCmart         = !!d.inCmart
    f.price           = Number(d.price ?? 0)
    return
  }
  // fallback hard-coded if settings unavailable
  const pricing = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }
  f.price = pricing[f.rarity] ?? 0
  f.inCmart = f.rarity !== 'Code Only'
  switch (f.rarity) {
    case 'Common':     f.totalQuantity = 160; f.initialQuantity = 160; f.perUserLimit = 7; break
    case 'Uncommon':   f.totalQuantity = 120; f.initialQuantity = 120; f.perUserLimit = 5; break
    case 'Rare':       f.totalQuantity = 80;  f.initialQuantity = 80;  f.perUserLimit = 3; break
    case 'Very Rare':  f.totalQuantity = 60;  f.initialQuantity = 60;  f.perUserLimit = 2; break
    case 'Crazy Rare': f.totalQuantity = 40;  f.initialQuantity = 40;  f.perUserLimit = 1; break
    default: break
  }
}

const filteredBulkSetsOptions = computed(() => {
  if (bulkSet.value.length < 2) return []
  return setsOptions.value.filter(opt =>
    opt.toLowerCase().includes(bulkSet.value.toLowerCase())
  )
})

// new: only show bulk-series suggestions once user typed ≥2 chars
const filteredBulkSeriesOptions = computed(() => {
  if (bulkSeries.value.length < 2) return []
  return seriesOptions.value.filter(opt =>
    opt.toLowerCase().includes(bulkSeries.value.toLowerCase())
  )
})

const filteredSeriesOptionsFor = (value = '') => {
  const normalized = (value || '').trim()
  if (normalized.length < 2) return []
  return seriesOptions.value.filter(opt =>
    opt.toLowerCase().includes(normalized.toLowerCase())
  )
}

const resolveRowSeries = (row) => {
  if (row?.seriesLocked) return (row.series || '').trim()
  return (row?.series || '').trim() || bulkSeries.value.trim()
}

const lockRowSeries = (row) => {
  if (!row?.seriesLocked) row.seriesLocked = true
}

watch(bulkSeries, (next) => {
  const nextValue = (next || '').trim()
  imageFiles.value.forEach((row) => {
    if (!row.seriesLocked) row.series = nextValue
  })
})

onMounted(async () => {
  const [setsRes, seriesRes, rarityRes, relRes] = await Promise.all([
    fetch('/api/admin/sets', { credentials: 'include' }),
    fetch('/api/admin/series', { credentials: 'include' }),
    fetch('/api/rarity-defaults'),
    fetch('/api/release-settings')
  ])
  setsOptions.value = await setsRes.json()
  seriesOptions.value = await seriesRes.json()
  try { const j = await rarityRes.json(); rarityDefaults.value = j?.defaults || null } catch {}
  try {
    const r = await relRes.json()
    releasePercent.value = Number(r.initialReleasePercent ?? 75)
    delayHours.value = Number(r.finalReleaseDelayHours ?? 12)
    clampReleasePercent()
  } catch {}
})

function handleFiles(e) {
  const files = Array.from(e.target.files || [])
  imageFiles.value = files.map((file) => {
    const stem = file.name.replace(/\.[^/.]+$/, '')
    const { name: cleanedName, rarity } = profileFromName?.(stem) ?? { name: stem, rarity: '' }

    const row = {
      id: makeRowId(),
      file,
      preview: uploadResources.objectUrl(file),
      nameField: cleanedName,      // ← prefilled name
      characters: cleanedName,     // ← prefilled to match name
      rarity: rarity || '',
      series: bulkSeries.value.trim(),
      seriesLocked: false,
      totalQuantity: null,
      initialQuantity: null,
      perUserLimit: null,
      inCmart: false,
      price: 0,
      duplicateStatus: 'idle',
      duplicateMatch: null,
      duplicateError: '',
      isSecondEdition: false,
      relatedFirstEditionId: null,
      relatedFirstEditionName: ''
    }

    if (row.rarity) updateDefaults?.(row)
    return row
  })
  runDuplicateChecks(imageFiles.value)
}

async function runDuplicateChecks(rows) {
  const queue = rows.slice()
  const workers = Array.from({ length: DUPLICATE_CHECK_CONCURRENCY }, () => (async () => {
    while (queue.length) {
      const row = queue.shift()
      if (!row) return
      await checkDuplicateForRow(row)
    }
  })())
  await Promise.all(workers)
}

async function checkDuplicateForRow(row) {
  if (!row?.file) return
  row.duplicateStatus = 'checking'
  row.duplicateMatch = null
  row.duplicateError = ''
  const formData = new FormData()
  formData.append('image', row.file)

  try {
    const res = await fetch('/api/admin/ctoon-duplicate', {
      method: 'POST',
      credentials: 'include',
      body: formData
    })
    if (!res.ok) {
      row.duplicateStatus = 'error'
      row.duplicateError = 'Duplicate check failed.'
      return
    }
    const data = await res.json()
    row.duplicateMatch = data?.duplicate ? data.match : null
    row.duplicateStatus = 'done'

    // Auto-set Second Edition when both duplicate-distance values are exactly 0
    const m = row.duplicateMatch
    if (m && m.phashDist === 0 && m.dhashDist === 0 && m.ctoon) {
      row.isSecondEdition = true
      row.relatedFirstEditionId = m.ctoon.id
      row.relatedFirstEditionName = m.ctoon.name
    }
  } catch {
    row.duplicateStatus = 'error'
    row.duplicateError = 'Duplicate check failed.'
  }
}

function rowSecondEdition(row) {
  return {
    isSecondEdition: row.isSecondEdition,
    relatedFirstEditionId: row.relatedFirstEditionId,
    relatedFirstEditionName: row.relatedFirstEditionName,
    overlayX: 85,
    overlayY: 85,
    overlaySize: 100
  }
}

function applyRowSecondEdition(row, val) {
  row.isSecondEdition = val.isSecondEdition
  row.relatedFirstEditionId = val.relatedFirstEditionId
  row.relatedFirstEditionName = val.relatedFirstEditionName
}

async function uploadAll() {
  uploading.value = true
  let allSuccess = true

  for (const f of imageFiles.value) {
    // validate required fields
    if (
      !f.nameField ||
      !f.rarity ||
      !bulkSet.value ||
      !bulkSeries.value ||
      !bulkReleaseDate.value ||
      !resolveRowSeries(f)
    ) {
      showToast(`Missing required fields for ${f.nameField}`, 'error')
      allSuccess = false
      continue
    }

    const rowSeries = resolveRowSeries(f)
    const formData = new FormData()
    formData.append('image', f.file)
    formData.append('name', f.nameField)
    formData.append('series', rowSeries)
    formData.append('type', f.file.type)
    formData.append('rarity', f.rarity)
    formData.append('set', bulkSet.value)
    formData.append(
      'characters',
      JSON.stringify(f.characters.split(',').map(c => c.trim()))
    )
    // Convert admin-entered CST/CDT to UTC
    try {
      formData.append('releaseDate', zonedTimeToUtc(bulkReleaseDate.value, 'America/Chicago').toISOString())
    } catch {
      formData.append('releaseDate', new Date(bulkReleaseDate.value).toISOString())
    }
    formData.append('mintLimitType', bulkMintLimitType.value)
    if (bulkMintLimitType.value === 'timeBased' && bulkMintEndDate.value) {
      try {
        formData.append('mintEndDate', zonedTimeToUtc(bulkMintEndDate.value, 'America/Chicago').toISOString())
      } catch {
        formData.append('mintEndDate', new Date(bulkMintEndDate.value).toISOString())
      }
    }
    formData.append('timeBasedLimitCount',      bulkTimeBasedLimitCountStr.value)
    formData.append('timeBasedLimitWindowDays', bulkTimeBasedLimitWindowDaysStr.value)
    formData.append('totalQuantity', bulkMintLimitType.value === 'defined' ? (f.totalQuantity ?? '') : '')
    formData.append('initialQuantity', bulkMintLimitType.value === 'defined' ? (f.initialQuantity ?? '') : '')
    // advisory schedule fields per row
    if (f.totalQuantity && bulkReleaseDate.value) {
      const init = Math.max(1, Math.floor((Number(f.totalQuantity) * Number(releasePercent.value)) / 100))
      const fin  = Math.max(0, Number(f.totalQuantity) - init)
      const finAt = new Date(new Date(bulkReleaseDate.value).getTime() + Number(delayHours.value) * 60 * 60 * 1000)
      formData.append('initialReleaseAt', new Date(bulkReleaseDate.value).toISOString())
      formData.append('finalReleaseAt', finAt.toISOString())
      formData.append('initialReleaseQty', init)
      formData.append('finalReleaseQty', fin)
    }
    formData.append('perUserLimit', f.perUserLimit ?? '')
    formData.append('inCmart', f.inCmart)
    formData.append('price', f.price)
    formData.append('isSecondEdition', f.isSecondEdition)
    if (f.isSecondEdition) {
      formData.append('relatedFirstEditionId', f.relatedFirstEditionId ?? '')
      formData.append('secondEditionOverlayX', 85)
      formData.append('secondEditionOverlayY', 85)
      formData.append('secondEditionOverlaySize', 100)
    }

    try {
      const res = await fetch('/api/admin/ctoon', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      if (!res.ok) {
        const err = await res.text()
        showToast(`Failed upload ${f.nameField}: ${err}`, 'error')
        allSuccess = false
      }
    } catch (err) {
      showToast(`Error uploading ${f.nameField}`, 'error')
      allSuccess = false
    }
  }

  uploading.value = false
  if (allSuccess) {
    showToast('All cToons uploaded successfully!', 'success')
    setTimeout(() => router.push('/newsite/admin/ctoons'), 1000)
  }
}
</script>
