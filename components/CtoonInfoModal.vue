<template>
  <Modal v-if="isOpen" :hide-close-button="true" :close-on-backdrop="true" @close="close">
    <div class="text-white flex flex-col max-h-[80vh] relative overflow-visible">
      <img
        v-if="activeTab === 'info' && statusImage"
        :src="statusImage"
        :alt="statusImageAlt"
        class="absolute -top-16 -right-4 w-48 h-48 object-contain rotate-[20deg] translate-x-2 pointer-events-none"
      />
      <div class="flex items-start gap-4 pb-4 border-b border-white/10 shrink-0">
        <img
          v-if="ctoon.assetPath"
          :src="ctoon.assetPath"
          :alt="ctoon.name || 'cToon'"
          class="w-20 h-20 object-contain rounded bg-gray-900/40 p-2"
        />
        <div>
          <h3 class="text-2xl font-semibold">{{ ctoon.name || 'cToon' }}</h3>
          <p class="text-sm text-gray-300">cToon details</p>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-4 shrink-0">
        <button
          class="px-3 py-1.5 rounded text-sm font-medium transition"
          :class="activeTab === 'info' ? 'bg-white text-gray-900' : 'bg-gray-700/60 text-gray-200 hover:bg-gray-700'"
          @click="activeTab = 'info'"
        >
          Info
        </button>
        <button
          class="px-3 py-1.5 rounded text-sm font-medium transition"
          :class="activeTab === 'suggest' ? 'bg-white text-gray-900' : 'bg-gray-700/60 text-gray-200 hover:bg-gray-700'"
          @click="activeTab = 'suggest'"
        >
          Suggest Updates
        </button>
      </div>

      <div class="flex-1 overflow-y-auto py-4 space-y-4">
        <template v-if="activeTab === 'info'">
          <div v-if="loading" class="text-sm text-gray-300">
            Loading details...
          </div>
          <div v-else-if="error" class="text-sm text-red-300">
            Failed to load cToon details.
          </div>
          <div v-else class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Highest Mint</div>
                <div class="font-semibold">{{ formatValue(ctoon.highestMint) }}</div>
                <div class="text-xs text-gray-300 mt-1">Total: {{ totalQuantityLabel }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Rarity</div>
                <div class="font-semibold">{{ formatValue(ctoon.rarity) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Set</div>
                <div class="font-semibold">{{ formatValue(ctoon.set) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Series</div>
                <div class="font-semibold">{{ formatValue(ctoon.series) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Release Date</div>
                <div class="font-semibold">{{ formatDate(ctoon.releaseDate) }}</div>
              </div>
              <div
                v-if="ctoon.rarity !== 'Auction Only' && ctoon.rarity !== 'Code Only' && ctoon.rarity !== 'Prize Only'"
                class="rounded bg-gray-700/60 p-3"
              >
                <div class="text-xs uppercase text-gray-300">cMart Value</div>
                <div class="font-semibold">{{ formatValue(ctoon.price, ' pts') }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Highest Value</div>
                <div class="font-semibold">{{ formatValue(ctoon.highestSale, ' pts') }}</div>
                <div v-if="ctoon.highestSaleMint != null || ctoon.highestSaleEndedAt" class="text-xs text-gray-300">
                  <span v-if="ctoon.highestSaleMint != null">Mint #{{ formatValue(ctoon.highestSaleMint) }}</span>
                  <span v-if="ctoon.highestSaleEndedAt"> · {{ formatDate(ctoon.highestSaleEndedAt) }}</span>
                </div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Lowest Value</div>
                <div class="font-semibold">{{ formatValue(ctoon.lowestSale, ' pts') }}</div>
                <div v-if="ctoon.lowestSaleMint != null || ctoon.lowestSaleEndedAt" class="text-xs text-gray-300">
                  <span v-if="ctoon.lowestSaleMint != null">Mint #{{ formatValue(ctoon.lowestSaleMint) }}</span>
                  <span v-if="ctoon.lowestSaleEndedAt"> · {{ formatDate(ctoon.lowestSaleEndedAt) }}</span>
                </div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Times Traded</div>
                <div class="font-semibold">{{ formatValue(ctoon.tradedCount) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Successful Auctions</div>
                <div class="font-semibold">{{ formatValue(ctoon.successfulAuctions) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Avg Sale</div>
                <div class="font-semibold">{{ formatValue(ctoon.avgSale, ' pts') }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Median Sale</div>
                <div class="font-semibold">{{ formatValue(ctoon.medianSale, ' pts') }}</div>
              </div>
            </div>

            <div v-if="userCtoon" class="space-y-2">
              <h4 class="text-sm uppercase tracking-wide text-gray-300">Mint #{{ formatValue(userCtoon.mintNumber) }}</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div class="rounded bg-gray-700/60 p-3">
                  <div class="text-xs uppercase text-gray-300">Times Traded</div>
                  <div class="font-semibold">{{ formatValue(userCtoon.tradedCount) }}</div>
                </div>
                <div class="rounded bg-gray-700/60 p-3">
                  <div class="text-xs uppercase text-gray-300">Successful Auctions</div>
                  <div class="font-semibold">{{ formatValue(userCtoon.successfulAuctions) }}</div>
                </div>
                <div class="rounded bg-gray-700/60 p-3">
                  <div class="text-xs uppercase text-gray-300">Avg Sale</div>
                  <div class="font-semibold">{{ formatValue(userCtoon.avgSale, ' pts') }}</div>
                </div>
                <div class="rounded bg-gray-700/60 p-3">
                  <div class="text-xs uppercase text-gray-300">Median Sale</div>
                  <div class="font-semibold">{{ formatValue(userCtoon.medianSale, ' pts') }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="text-sm text-gray-300">
            Suggest updates to this cToon. Your submission will be reviewed by the admin team.
          </div>
          <div v-if="loading" class="text-sm text-gray-300">
            Loading details...
          </div>
          <div v-else-if="error" class="text-sm text-red-300">
            Failed to load cToon details.
          </div>
          <form v-else id="ctoon-suggestion-form" class="space-y-4" @submit.prevent="submitSuggestion">
            <div>
              <label class="text-xs uppercase text-gray-300">cToon Name</label>
              <input
                v-model="suggestName"
                type="text"
                class="mt-1 w-full rounded bg-gray-800/70 border border-white/10 px-3 py-2 text-sm text-white"
                required
              />
            </div>
            <div>
              <label class="text-xs uppercase text-gray-300">Series</label>
              <input
                v-model="suggestSeries"
                type="text"
                list="ctoon-series-list"
                class="mt-1 w-full rounded bg-gray-800/70 border border-white/10 px-3 py-2 text-sm text-white"
                required
              />
              <datalist v-if="suggestSeries.length >= 3" id="ctoon-series-list">
                <option v-for="opt in seriesSuggestions" :key="opt" :value="opt" />
              </datalist>
            </div>
            <div>
              <label class="text-xs uppercase text-gray-300">Set</label>
              <input
                v-model="suggestSet"
                type="text"
                list="ctoon-set-list"
                class="mt-1 w-full rounded bg-gray-800/70 border border-white/10 px-3 py-2 text-sm text-white"
                required
              />
              <datalist v-if="suggestSet.length >= 3" id="ctoon-set-list">
                <option v-for="opt in setSuggestions" :key="opt" :value="opt" />
              </datalist>
            </div>
            <div>
              <label class="text-xs uppercase text-gray-300">Characters (comma-separated)</label>
              <textarea
                v-model="suggestCharacters"
                rows="2"
                class="mt-1 w-full rounded bg-gray-800/70 border border-white/10 px-3 py-2 text-sm text-white"
                required
              ></textarea>
            </div>
            <div v-if="submitError" class="text-sm text-red-300">
              {{ submitError }}
            </div>
            <div v-else-if="submitSuccess" class="text-sm text-green-300">
              Suggestion submitted. Thanks for helping improve the collection!
            </div>
            <div class="flex items-center justify-between gap-3">
              <p v-if="!hasSuggestionChanges" class="text-xs text-gray-400">
                Make a change to submit a suggestion.
              </p>
            </div>
          </form>
        </template>
      </div>

      <div class="pt-4 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
        <template v-if="activeTab === 'suggest'">
          <button
            type="submit"
            form="ctoon-suggestion-form"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 text-sm ml-auto"
            :disabled="suggestionDisabled"
          >
            {{ submittingSuggestion ? 'Submitting...' : 'Submit Suggestion' }}
          </button>
        </template>
        <template v-else>
          <button
            class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            @click="close"
          >
            Close
          </button>
          <div v-if="ctoon.id || canSeeHolidayReveal" class="text-right flex flex-col items-end gap-2">
            <div v-if="canSeeHolidayReveal">
              <button
                v-if="canOpenNow"
                class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 text-sm"
                :disabled="openingHoliday"
                @click="openHolidayCtoon"
              >
                {{ openingHoliday ? 'Opening...' : 'Open cToon' }}
              </button>
              <div v-else class="text-xs text-gray-300">
                Reveal available in:
                <span class="font-semibold">{{ revealCountdown }}</span>
              </div>
            </div>
            <AddToWishlist
              v-if="ctoon.id"
              :ctoon-id="ctoon.id"
              class="text-xs"
            />
          </div>
        </template>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import Modal from '@/components/Modal.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import { useCtoonModal } from '@/composables/useCtoonModal'

const {
  isOpen,
  loading,
  error,
  data,
  context,
  close,
  notifyHolidayRedeem
} = useCtoonModal()

const ctoon = computed(() => data.value?.ctoon || {})
const userCtoon = computed(() => data.value?.userCtoon || null)
const totalQuantityLabel = computed(() => {
  const quantity = ctoon.value?.quantity
  if (quantity === null || quantity === undefined) return 'Unlimited'
  return formatValue(quantity)
})
const statusImage = computed(() => {
  const releaseDate = ctoon.value?.releaseDate
  if (releaseDate) {
    const releaseTime = new Date(releaseDate).getTime()
    if (!Number.isNaN(releaseTime)) {
      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      if (releaseTime > now) return '/images/upcomingrelease.png'
      if (now - releaseTime <= 7 * dayMs) return '/images/new.png'
    }
  }

  if (!ctoon.value?.inCmart) return null
  const totalQuantity = ctoon.value?.quantity
  const highestMint = ctoon.value?.highestMint
  if (typeof totalQuantity === 'number' && typeof highestMint === 'number') {
    if (totalQuantity === highestMint) return '/images/soldout.png'
    if (totalQuantity - highestMint <= 10) return '/images/goingfast.png'
  }
  return null
})
const statusImageAlt = computed(() => {
  switch (statusImage.value) {
    case '/images/upcomingrelease.png':
      return 'Upcoming release'
    case '/images/new.png':
      return 'New release'
    case '/images/goingfast.png':
      return 'Going fast'
    case '/images/soldout.png':
      return 'Sold out'
    default:
      return 'cToon status'
  }
})

const activeTab = ref('info')
const suggestName = ref('')
const suggestSeries = ref('')
const suggestSet = ref('')
const suggestCharacters = ref('')
const seriesSuggestions = ref([])
const setSuggestions = ref([])
const submittingSuggestion = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)
const formTouched = ref(false)
let suppressTouch = false
let seriesSuggestTimer = null
let setSuggestTimer = null

const holidayEvent = ref(null)
const openingHoliday = ref(false)
const revealCountdown = ref('')
let revealTimer = null

const isCzoneContext = computed(() => context.value?.source === 'czone')
const canSeeHolidayReveal = computed(() => {
  return (
    isCzoneContext.value &&
    !!context.value?.isOwner &&
    !!holidayEvent.value &&
    !!userCtoon.value?.id
  )
})
const eventMinRevealAt = computed(() => holidayEvent.value?.minRevealAt || null)
const canOpenNow = computed(() => {
  if (!canSeeHolidayReveal.value) return false
  const mra = eventMinRevealAt.value ? new Date(eventMinRevealAt.value).getTime() : null
  return mra === null || Date.now() >= mra
})

function normalizeCharsList(list) {
  if (!Array.isArray(list)) return []
  return list.map(item => String(item || '').trim()).filter(Boolean)
}

function normalizeCharsText(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

const suggestionCharacters = computed(() => normalizeCharsText(suggestCharacters.value))
const suggestionValid = computed(() => {
  return (
    suggestName.value.trim().length > 0 &&
    suggestSeries.value.trim().length > 0 &&
    suggestSet.value.trim().length > 0 &&
    suggestionCharacters.value.length > 0
  )
})
const hasSuggestionChanges = computed(() => {
  if (!ctoon.value?.id) return false
  const oldName = String(ctoon.value?.name || '').trim()
  const oldSeries = String(ctoon.value?.series || '').trim()
  const oldSet = String(ctoon.value?.set || '').trim()
  const oldChars = normalizeCharsList(ctoon.value?.characters || [])
  const newName = suggestName.value.trim()
  const newSeries = suggestSeries.value.trim()
  const newSet = suggestSet.value.trim()
  const newChars = normalizeCharsList(suggestionCharacters.value)

  return (
    newName !== oldName ||
    newSeries !== oldSeries ||
    newSet !== oldSet ||
    !arraysEqual(newChars, oldChars)
  )
})
const suggestionDisabled = computed(() => {
  return (
    submittingSuggestion.value ||
    loading.value ||
    !!error.value ||
    !suggestionValid.value ||
    !hasSuggestionChanges.value
  )
})

function syncSuggestionForm(nextCtoon) {
  if (!nextCtoon) return
  suppressTouch = true
  suggestName.value = nextCtoon.name || ''
  suggestSeries.value = nextCtoon.series || ''
  suggestSet.value = nextCtoon.set || ''
  suggestCharacters.value = Array.isArray(nextCtoon.characters)
    ? nextCtoon.characters.join(', ')
    : ''
  submitError.value = ''
  submitSuccess.value = false
  formTouched.value = false
  suppressTouch = false
}

function stopRevealCountdown() {
  if (revealTimer) {
    clearInterval(revealTimer)
    revealTimer = null
  }
}

function startRevealCountdown() {
  stopRevealCountdown()
  if (!canSeeHolidayReveal.value) {
    revealCountdown.value = ''
    return
  }
  const mraStr = eventMinRevealAt.value
  if (!mraStr) {
    revealCountdown.value = 'now'
    return
  }

  const target = new Date(mraStr).getTime()
  const tick = () => {
    const diff = Math.max(0, target - Date.now())
    if (diff <= 0) {
      revealCountdown.value = 'now'
      stopRevealCountdown()
      return
    }
    const s = Math.floor(diff / 1000)
    const days = Math.floor(s / 86400)
    const hours = Math.floor((s % 86400) / 3600)
    const mins = Math.floor((s % 3600) / 60)
    const secs = s % 60
    revealCountdown.value = `${days}d ${hours}h ${mins}m ${secs}s`
  }
  tick()
  revealTimer = setInterval(tick, 1000)
}

watch(isOpen, (open) => {
  if (!open) {
    submitError.value = ''
    submitSuccess.value = false
    seriesSuggestions.value = []
    setSuggestions.value = []
    formTouched.value = false
    return
  }
  activeTab.value = 'info'
  if (!loading.value && ctoon.value?.id) syncSuggestionForm(ctoon.value)
})

watch([isOpen, loading], ([open, isLoading]) => {
  if (!open || isLoading) return
  if (!formTouched.value) syncSuggestionForm(ctoon.value)
})

watch([suggestName, suggestSeries, suggestSet, suggestCharacters], () => {
  if (suppressTouch) return
  formTouched.value = true
  if (submitSuccess.value) submitSuccess.value = false
  if (submitError.value) submitError.value = ''
})

watch(suggestSeries, (next) => {
  if (suppressTouch) return
  if (seriesSuggestTimer) clearTimeout(seriesSuggestTimer)
  const query = String(next || '').trim()
  if (query.length < 3) {
    seriesSuggestions.value = []
    return
  }
  seriesSuggestTimer = setTimeout(async () => {
    try {
      const res = await $fetch('/api/ctoon/series', { query: { q: query } })
      seriesSuggestions.value = Array.isArray(res) ? res : []
    } catch {
      seriesSuggestions.value = []
    }
  }, 250)
})

watch(suggestSet, (next) => {
  if (suppressTouch) return
  if (setSuggestTimer) clearTimeout(setSuggestTimer)
  const query = String(next || '').trim()
  if (query.length < 3) {
    setSuggestions.value = []
    return
  }
  setSuggestTimer = setTimeout(async () => {
    try {
      const res = await $fetch('/api/ctoon/sets', { query: { q: query } })
      setSuggestions.value = Array.isArray(res) ? res : []
    } catch {
      setSuggestions.value = []
    }
  }, 250)
})

watch([isOpen, () => ctoon.value?.id, isCzoneContext], async ([open, ctoonId, isCzone]) => {
  if (!open || !isCzone || !ctoonId) {
    holidayEvent.value = null
    stopRevealCountdown()
    return
  }
  try {
    holidayEvent.value = await $fetch('/api/holiday/event-for-ctoon', {
      query: { ctoonId }
    })
  } catch {
    holidayEvent.value = null
  }
}, { immediate: true })

watch([isOpen, canSeeHolidayReveal, eventMinRevealAt], () => {
  if (isOpen.value && canSeeHolidayReveal.value) startRevealCountdown()
  else stopRevealCountdown()
})

onBeforeUnmount(() => {
  stopRevealCountdown()
  if (seriesSuggestTimer) clearTimeout(seriesSuggestTimer)
  if (setSuggestTimer) clearTimeout(setSuggestTimer)
})

async function openHolidayCtoon() {
  if (!canOpenNow.value || openingHoliday.value) return
  const userCtoonId = userCtoon.value?.id
  if (!userCtoonId) return
  openingHoliday.value = true
  try {
    const res = await $fetch('/api/holiday/redeem', {
      method: 'POST',
      body: { userCtoonId }
    })
    notifyHolidayRedeem({ userCtoonId, reward: res?.reward || null })
    close()
  } catch (err) {
    console.error('Failed to open holiday cToon', err)
  } finally {
    openingHoliday.value = false
  }
}

async function submitSuggestion() {
  if (suggestionDisabled.value || submittingSuggestion.value) return
  if (!ctoon.value?.id) return
  submittingSuggestion.value = true
  submitError.value = ''
  submitSuccess.value = false
  try {
    await $fetch('/api/ctoon/suggestions', {
      method: 'POST',
      body: {
        ctoonId: ctoon.value.id,
        name: suggestName.value.trim(),
        series: suggestSeries.value.trim(),
        set: suggestSet.value.trim(),
        characters: suggestionCharacters.value
      }
    })
    submitSuccess.value = true
  } catch (err) {
    submitError.value = err?.data?.statusMessage || err?.message || 'Failed to submit suggestion.'
  } finally {
    submittingSuggestion.value = false
  }
}

function formatValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'N/A'
  if (typeof value === 'number') return `${value.toLocaleString()}${suffix}`
  return `${value}${suffix}`
}

function formatDate(value) {
  if (!value) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>
