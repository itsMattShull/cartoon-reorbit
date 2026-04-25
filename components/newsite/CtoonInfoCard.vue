<template>
  <div class="ctic-overlay" @click.self="close">
    <div class="ctic-panel">
      <!-- Status banner image -->
      <img
        v-if="activeTab === 'info' && statusImage"
        :src="statusImage"
        :alt="statusImageAlt"
        class="ctic-status-img"
      />

      <!-- Header -->
      <div class="ctic-head">
        <img
          v-if="ctoon.assetPath"
          :src="ctoon.assetPath"
          :alt="ctoon.name || 'cToon'"
          class="ctic-thumb"
        />
        <div class="ctic-head-info">
          <h3 class="ctic-name">{{ ctoon.name || 'cToon' }}</h3>
          <p class="ctic-subtitle">cToon details</p>
          <button
            v-if="ctoon.soundPath"
            type="button"
            class="ctic-sound-btn"
            :aria-label="'Replay ' + (ctoon.name || 'cToon') + ' sound'"
            @click="replaySound"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="ctic-sound-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
            </svg>
            Play sound
          </button>
        </div>
        <button class="ctic-close-x" aria-label="Close" @click="close">✕</button>
        <audio ref="audioEl" :src="ctoon.soundPath || ''" preload="auto" style="display:none" />
      </div>

      <!-- Tabs -->
      <div class="ctic-tabs">
        <button
          class="ctic-tab"
          :class="{ 'ctic-tab--active': activeTab === 'info' }"
          @click="activeTab = 'info'"
        >Info</button>
        <button
          v-if="hasGtoon"
          class="ctic-tab"
          :class="{ 'ctic-tab--active': activeTab === 'gtoon' }"
          @click="activeTab = 'gtoon'"
        >gToon</button>
        <button
          v-if="ctoon.id"
          class="ctic-tab"
          :class="{ 'ctic-tab--active': activeTab === 'owners' }"
          @click="activeTab = 'owners'"
        >Owners</button>
        <button
          class="ctic-tab"
          :class="{ 'ctic-tab--active': activeTab === 'suggest' }"
          @click="activeTab = 'suggest'"
        >Suggest Updates</button>
      </div>

      <!-- Body -->
      <div class="ctic-body">

        <!-- ── Info tab ── -->
        <template v-if="activeTab === 'info'">
          <div v-if="loading" class="ctic-skel-wrap">
            <div class="ctic-grid">
              <div v-for="i in 6" :key="`info-skel-${i}`" class="ctic-skel-tile">
                <div class="ctic-skel-line ctic-skel-lbl"></div>
                <div class="ctic-skel-line ctic-skel-val"></div>
                <div class="ctic-skel-line ctic-skel-sub"></div>
              </div>
            </div>
          </div>
          <div v-else-if="error" class="ctic-error">Failed to load cToon details.</div>
          <div v-else>
            <div v-if="ctoonDescription" class="ctic-tile ctic-tile-wide ctic-desc">
              <p>{{ ctoonDescription }}</p>
            </div>
            <div class="ctic-grid">
              <div class="ctic-tile">
                <div class="ctic-label">Highest Mint</div>
                <div class="ctic-value">{{ formatValue(ctoon.highestMint) }}</div>
                <div class="ctic-sub">Total: {{ totalQuantityLabel }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">You Own</div>
                <div class="ctic-value">{{ formatValue(ownedCount) }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Rarity</div>
                <div class="ctic-value">{{ formatValue(ctoon.rarity) }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Set</div>
                <div class="ctic-value">{{ formatValue(ctoon.set) }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Series</div>
                <div class="ctic-value">{{ formatValue(ctoon.series) }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Release Date</div>
                <div class="ctic-value">{{ formatDate(ctoon.releaseDate) }}</div>
              </div>
              <div
                v-if="ctoon.rarity !== 'Auction Only' && ctoon.rarity !== 'Code Only' && ctoon.rarity !== 'Prize Only'"
                class="ctic-tile"
              >
                <div class="ctic-label">cMart Value</div>
                <div class="ctic-value">{{ formatValue(ctoon.price, ' pts') }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Highest Value</div>
                <div class="ctic-value">{{ formatValue(ctoon.highestSale, ' pts') }}</div>
                <div v-if="ctoon.highestSaleMint != null || ctoon.highestSaleEndedAt" class="ctic-sub">
                  <span v-if="ctoon.highestSaleMint != null">Mint #{{ formatValue(ctoon.highestSaleMint) }}</span>
                  <span v-if="ctoon.highestSaleEndedAt"> · {{ formatDate(ctoon.highestSaleEndedAt) }}</span>
                </div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Lowest Value</div>
                <div class="ctic-value">{{ formatValue(ctoon.lowestSale, ' pts') }}</div>
                <div v-if="ctoon.lowestSaleMint != null || ctoon.lowestSaleEndedAt" class="ctic-sub">
                  <span v-if="ctoon.lowestSaleMint != null">Mint #{{ formatValue(ctoon.lowestSaleMint) }}</span>
                  <span v-if="ctoon.lowestSaleEndedAt"> · {{ formatDate(ctoon.lowestSaleEndedAt) }}</span>
                </div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Times Traded</div>
                <div class="ctic-value">{{ formatValue(ctoon.tradedCount) }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Successful Auctions</div>
                <div class="ctic-value">{{ formatValue(ctoon.successfulAuctions) }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Avg Sale</div>
                <div class="ctic-value">{{ formatValue(ctoon.avgSale, ' pts') }}</div>
              </div>
              <div class="ctic-tile">
                <div class="ctic-label">Median Sale</div>
                <div class="ctic-value">{{ formatValue(ctoon.medianSale, ' pts') }}</div>
              </div>
            </div>

            <!-- Mint-specific section -->
            <div v-if="userCtoon" class="ctic-mint-section">
              <h4 class="ctic-mint-title">Mint #{{ formatValue(userCtoon.mintNumber) }}</h4>
              <div class="ctic-grid">
                <div class="ctic-tile">
                  <div class="ctic-label">Times Traded</div>
                  <div class="ctic-value">{{ formatValue(userCtoon.tradedCount) }}</div>
                </div>
                <div class="ctic-tile">
                  <div class="ctic-label">Successful Auctions</div>
                  <div class="ctic-value">{{ formatValue(userCtoon.successfulAuctions) }}</div>
                </div>
                <div class="ctic-tile">
                  <div class="ctic-label">Avg Sale</div>
                  <div class="ctic-value">{{ formatValue(userCtoon.avgSale, ' pts') }}</div>
                </div>
                <div class="ctic-tile">
                  <div class="ctic-label">Median Sale</div>
                  <div class="ctic-value">{{ formatValue(userCtoon.medianSale, ' pts') }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ── gToon tab ── -->
        <template v-else-if="activeTab === 'gtoon' && hasGtoon">
          <div v-if="loading" class="ctic-grid ctic-skel-wrap">
            <div v-for="i in 4" :key="`gtoon-skel-${i}`" class="ctic-skel-tile">
              <div class="ctic-skel-line ctic-skel-lbl"></div>
              <div class="ctic-skel-line ctic-skel-val"></div>
            </div>
          </div>
          <div v-else-if="error" class="ctic-error">Failed to load cToon details.</div>
          <div v-else class="ctic-grid">
            <div class="ctic-tile">
              <div class="ctic-label">Cost</div>
              <div class="ctic-value">{{ formatValue(ctoon.cost) }}</div>
            </div>
            <div class="ctic-tile">
              <div class="ctic-label">Power</div>
              <div class="ctic-value">{{ formatValue(ctoon.power) }}</div>
            </div>
            <div class="ctic-tile ctic-tile-wide">
              <div class="ctic-label">Type</div>
              <div class="ctic-value">{{ formatValue(ctoon.gtoonType) }}</div>
            </div>
            <div class="ctic-tile ctic-tile-wide">
              <div class="ctic-label">Ability</div>
              <div class="ctic-value">{{ abilityLabel(ctoon.abilityKey) }}</div>
            </div>
          </div>
        </template>

        <!-- ── Owners tab ── -->
        <template v-else-if="activeTab === 'owners'">
          <div v-if="ownersLoading" class="ctic-owners-list">
            <div v-for="i in 6" :key="`owners-skel-${i}`" class="ctic-owner-row ctic-skel-tile">
              <div class="ctic-skel-line" style="width:56px;height:11px"></div>
              <div class="ctic-skel-line" style="width:80px;height:11px"></div>
              <div class="ctic-skel-line" style="width:48px;height:14px;border-radius:4px"></div>
            </div>
          </div>
          <div v-else-if="ownersError" class="ctic-error">{{ ownersError }}</div>
          <div v-else-if="!sortedOwners.length" class="ctic-empty">No owners found.</div>
          <ul v-else class="ctic-owners-list">
            <li
              v-for="owner in sortedOwners"
              :key="owner.userId + '-' + owner.mintNumber"
              class="ctic-owner-row"
            >
              <span class="ctic-owner-mint">
                <span v-if="!owner.isHolidayItem">Mint #{{ owner.mintNumber ?? 'N/A' }}</span>
                <span v-else>&nbsp;</span>
              </span>
              <NuxtLink :to="`/czone/${owner.username}`" class="ctic-owner-link">
                {{ owner.username }}
              </NuxtLink>
              <NuxtLink
                v-if="owner.isTradeListItem"
                :to="{ path: `/create-trade/${owner.username}`, query: { userCtoonId: owner.userCtoonId } }"
                class="ctic-tradeable-badge"
              >
                Tradeable
              </NuxtLink>
              <span v-else class="ctic-owner-spacer">&nbsp;</span>
            </li>
          </ul>
        </template>

        <!-- ── Suggest Updates tab ── -->
        <template v-else>
          <p class="ctic-suggest-intro">
            Suggest updates to this cToon. Your submission will be reviewed by the admin team.
          </p>
          <div v-if="loading" class="ctic-skel-wrap">
            <div v-for="i in 4" :key="`sug-skel-${i}`" class="ctic-skel-field">
              <div class="ctic-skel-line ctic-skel-lbl"></div>
              <div class="ctic-skel-line ctic-skel-inp"></div>
            </div>
          </div>
          <div v-else-if="error" class="ctic-error">Failed to load cToon details.</div>
          <form v-else id="ctic-suggestion-form" class="ctic-form" @submit.prevent="submitSuggestion">
            <div class="ctic-field">
              <label class="ctic-label">cToon Name</label>
              <input v-model="suggestName" type="text" class="ctic-input" required />
            </div>
            <div class="ctic-field">
              <label class="ctic-label">Series</label>
              <input
                v-model="suggestSeries"
                type="text"
                list="ctic-series-list"
                class="ctic-input"
                required
              />
              <datalist v-if="suggestSeries.length >= 3" id="ctic-series-list">
                <option v-for="opt in seriesSuggestions" :key="opt" :value="opt" />
              </datalist>
            </div>
            <div class="ctic-field">
              <label class="ctic-label">Set</label>
              <input
                v-model="suggestSet"
                type="text"
                list="ctic-set-list"
                class="ctic-input"
                required
              />
              <datalist v-if="suggestSet.length >= 3" id="ctic-set-list">
                <option v-for="opt in setSuggestions" :key="opt" :value="opt" />
              </datalist>
            </div>
            <div class="ctic-field">
              <label class="ctic-label">Characters (comma-separated)</label>
              <textarea v-model="suggestCharacters" rows="2" class="ctic-input" required></textarea>
            </div>
            <div class="ctic-field">
              <label class="ctic-label">Description</label>
              <textarea v-model="suggestDescription" rows="3" class="ctic-input"></textarea>
            </div>
            <div v-if="submitError" class="ctic-error">{{ submitError }}</div>
            <div v-else-if="submitSuccess" class="ctic-success">
              Suggestion submitted. Thanks for helping improve the collection!
            </div>
            <p v-if="!hasSuggestionChanges" class="ctic-no-change">
              Make a change to submit a suggestion.
            </p>
          </form>
        </template>

      </div>

      <!-- Footer -->
      <div class="ctic-foot">
        <template v-if="activeTab === 'suggest'">
          <button
            type="submit"
            form="ctic-suggestion-form"
            class="ctic-submit-btn"
            :disabled="suggestionDisabled"
          >
            {{ submittingSuggestion ? 'Submitting...' : 'Submit Suggestion' }}
          </button>
        </template>
        <template v-else>
          <button class="ctic-close-action" @click="close">Close</button>
          <div class="ctic-foot-right">
            <NuxtLink
              v-if="isAdmin && ctoon.id"
              :to="`/admin/editCtoon/${ctoon.id}`"
              class="ctic-edit-btn"
            >
              Edit cToon
            </NuxtLink>
            <AddToWishlist v-if="ctoon.id" :ctoon-id="ctoon.id" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import abilities from '@/data/abilities.json'
import { useCtoonModal } from '@/composables/useCtoonModal'
import { useAuth } from '@/composables/useAuth'
import { formatQuantity, TIME_BASED_CAP } from '@/utils/formatQuantity'

const { isAdmin } = useAuth()
const { isOpen, loading, error, data, close } = useCtoonModal()

const ctoon = computed(() => data.value?.ctoon || {})
const ctoonDescription = computed(() => String(ctoon.value?.description || '').trim())
const userCtoon = computed(() => data.value?.userCtoon || null)
const ownedCount = computed(() => data.value?.ownedCount ?? 0)
const hasGtoon = computed(() => !!ctoon.value?.isGtoon)
const totalQuantityLabel = computed(() => formatQuantity(ctoon.value?.quantity))

const statusImage = computed(() => {
  const totalQuantity = ctoon.value?.quantity
  const highestMint = ctoon.value?.highestMint
  const isSoldOut =
    typeof totalQuantity === 'number' &&
    typeof highestMint === 'number' &&
    totalQuantity === highestMint &&
    totalQuantity !== TIME_BASED_CAP

  if (isSoldOut) return '/images/soldout.png'

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
  if (typeof totalQuantity === 'number' && typeof highestMint === 'number') {
    if (totalQuantity - highestMint <= 10) return '/images/goingfast.png'
  }
  return null
})

const statusImageAlt = computed(() => {
  switch (statusImage.value) {
    case '/images/upcomingrelease.png': return 'Upcoming release'
    case '/images/new.png': return 'New release'
    case '/images/goingfast.png': return 'Going fast'
    case '/images/soldout.png': return 'Sold out'
    default: return 'cToon status'
  }
})

const audioEl = ref(null)
const activeTab = ref('info')
const suggestName = ref('')
const suggestSeries = ref('')
const suggestSet = ref('')
const suggestCharacters = ref('')
const suggestDescription = ref('')
const seriesSuggestions = ref([])
const setSuggestions = ref([])
const submittingSuggestion = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)
const formTouched = ref(false)
let suppressTouch = false
let seriesSuggestTimer = null
let setSuggestTimer = null
const ownersLoading = ref(false)
const ownersError = ref('')
const ownersList = ref([])
const lastOwnersCtoonId = ref(null)

function replaySound() {
  if (!audioEl.value || !ctoon.value?.soundPath) return
  audioEl.value.currentTime = 0
  audioEl.value.play().catch(() => {})
}

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

function abilityLabel(key) {
  if (!key) return 'None'
  const entry = abilities.find(a => a.key === key)
  return entry?.label ?? key
}

const suggestionCharacters = computed(() => normalizeCharsText(suggestCharacters.value))
const suggestionValid = computed(() => (
  suggestName.value.trim().length > 0 &&
  suggestSeries.value.trim().length > 0 &&
  suggestSet.value.trim().length > 0 &&
  suggestionCharacters.value.length > 0
))
const hasSuggestionChanges = computed(() => {
  if (!ctoon.value?.id) return false
  const oldName = String(ctoon.value?.name || '').trim()
  const oldSeries = String(ctoon.value?.series || '').trim()
  const oldSet = String(ctoon.value?.set || '').trim()
  const oldChars = normalizeCharsList(ctoon.value?.characters || [])
  const oldDescription = String(ctoon.value?.description || '').trim()
  const newName = suggestName.value.trim()
  const newSeries = suggestSeries.value.trim()
  const newSet = suggestSet.value.trim()
  const newChars = normalizeCharsList(suggestionCharacters.value)
  const newDescription = String(suggestDescription.value || '').trim()
  return (
    newName !== oldName ||
    newSeries !== oldSeries ||
    newSet !== oldSet ||
    !arraysEqual(newChars, oldChars) ||
    newDescription !== oldDescription
  )
})
const suggestionDisabled = computed(() => (
  submittingSuggestion.value ||
  loading.value ||
  !!error.value ||
  !suggestionValid.value ||
  !hasSuggestionChanges.value
))

function syncSuggestionForm(nextCtoon) {
  if (!nextCtoon) return
  suppressTouch = true
  suggestName.value = nextCtoon.name || ''
  suggestSeries.value = nextCtoon.series || ''
  suggestSet.value = nextCtoon.set || ''
  suggestCharacters.value = Array.isArray(nextCtoon.characters)
    ? nextCtoon.characters.join(', ')
    : ''
  suggestDescription.value = nextCtoon.description || ''
  submitError.value = ''
  submitSuccess.value = false
  formTouched.value = false
  suppressTouch = false
}

const sortedOwners = computed(() => {
  return ownersList.value.slice().sort((a, b) => {
    const aMint = a.mintNumber ?? Number.POSITIVE_INFINITY
    const bMint = b.mintNumber ?? Number.POSITIVE_INFINITY
    return aMint - bMint
  })
})

watch(isOpen, (open) => {
  if (!open) {
    submitError.value = ''
    submitSuccess.value = false
    seriesSuggestions.value = []
    setSuggestions.value = []
    formTouched.value = false
    ownersLoading.value = false
    ownersError.value = ''
    ownersList.value = []
    lastOwnersCtoonId.value = null
    if (audioEl.value) { audioEl.value.pause(); audioEl.value.currentTime = 0 }
    return
  }
  activeTab.value = 'info'
  if (!loading.value && ctoon.value?.id) syncSuggestionForm(ctoon.value)
})

watch([isOpen, loading], async ([open, isLoading]) => {
  if (!open || isLoading) return
  if (!ctoon.value?.soundPath) return
  await nextTick()
  if (audioEl.value) {
    audioEl.value.currentTime = 0
    audioEl.value.play().catch(() => {})
  }
})

watch([isOpen, hasGtoon], ([open, isGtoon]) => {
  if (!open) return
  if (!isGtoon && activeTab.value === 'gtoon') activeTab.value = 'info'
})

watch([isOpen, activeTab, () => ctoon.value?.id], ([open, tab, ctoonId]) => {
  if (!open) return
  if (tab !== 'owners') return
  if (!ctoonId) { ownersList.value = []; ownersError.value = ''; return }
  if (lastOwnersCtoonId.value === ctoonId && ownersList.value.length) return
  loadOwners(ctoonId)
})

watch([isOpen, loading], ([open, isLoading]) => {
  if (!open || isLoading) return
  if (!formTouched.value) syncSuggestionForm(ctoon.value)
})

watch([suggestName, suggestSeries, suggestSet, suggestCharacters, suggestDescription], () => {
  if (suppressTouch) return
  formTouched.value = true
  if (submitSuccess.value) submitSuccess.value = false
  if (submitError.value) submitError.value = ''
})

watch(suggestSeries, (next) => {
  if (suppressTouch) return
  if (seriesSuggestTimer) clearTimeout(seriesSuggestTimer)
  const query = String(next || '').trim()
  if (query.length < 3) { seriesSuggestions.value = []; return }
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
  if (query.length < 3) { setSuggestions.value = []; return }
  setSuggestTimer = setTimeout(async () => {
    try {
      const res = await $fetch('/api/ctoon/sets', { query: { q: query } })
      setSuggestions.value = Array.isArray(res) ? res : []
    } catch {
      setSuggestions.value = []
    }
  }, 250)
})

onBeforeUnmount(() => {
  if (seriesSuggestTimer) clearTimeout(seriesSuggestTimer)
  if (setSuggestTimer) clearTimeout(setSuggestTimer)
  if (audioEl.value) audioEl.value.pause()
})

async function loadOwners(ctoonId) {
  ownersLoading.value = true
  ownersError.value = ''
  try {
    const res = await $fetch('/api/collections/owners', { query: { cToonId: ctoonId } })
    ownersList.value = Array.isArray(res) ? res : []
    lastOwnersCtoonId.value = ctoonId
  } catch {
    ownersError.value = 'Failed to load owners.'
    ownersList.value = []
  } finally {
    ownersLoading.value = false
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
        characters: suggestionCharacters.value,
        description: suggestDescription.value.trim()
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
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────── */
.ctic-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 20, 50, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 12px;
  box-sizing: border-box;
}

/* ── Panel ───────────────────────────────────────────────────── */
.ctic-panel {
  background: #0d2a4d;
  border: 2px solid var(--OrbitDarkBlue);
  border-radius: 8px;
  max-width: 480px;
  width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible;
  color: white;
  position: relative;
}

/* ── Status image ────────────────────────────────────────────── */
.ctic-status-img {
  position: absolute;
  top: -14px;
  right: -6px;
  width: 90px;
  height: 90px;
  object-fit: contain;
  transform: rotate(20deg);
  pointer-events: none;
  z-index: 1;
}

/* ── Header ──────────────────────────────────────────────────── */
.ctic-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  position: relative;
}

.ctic-thumb {
  width: 72px;
  height: 72px;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px;
  border-radius: 4px;
  flex-shrink: 0;
}

.ctic-head-info {
  flex: 1;
  min-width: 0;
  padding-right: 20px;
}

.ctic-name {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  word-break: break-word;
}

.ctic-subtitle {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 2px 0 0;
}

.ctic-sound-btn {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: #93c5fd;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.ctic-sound-btn:hover { color: #bfdbfe; }

.ctic-sound-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.ctic-close-x {
  position: absolute;
  top: 8px;
  right: 10px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.95rem;
  cursor: pointer;
  line-height: 1;
  padding: 2px 5px;
}
.ctic-close-x:hover { color: white; }

/* ── Tabs ────────────────────────────────────────────────────── */
.ctic-tabs {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.ctic-tab {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  border: none;
  cursor: pointer;
}
.ctic-tab:hover { background: rgba(255, 255, 255, 0.16); color: white; }
.ctic-tab--active { background: var(--OrbitLightBlue); color: white; }

/* ── Body ────────────────────────────────────────────────────── */
.ctic-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
  min-height: 0;
}

/* ── Grid & Tiles ────────────────────────────────────────────── */
.ctic-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 6px;
}

.ctic-tile {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  padding: 8px 10px;
}

.ctic-tile-wide {
  grid-column: 1 / -1;
}

.ctic-desc {
  margin-bottom: 0;
}
.ctic-desc p {
  font-size: 0.85rem;
  white-space: pre-line;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.ctic-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.55);
}

.ctic-value {
  font-size: 0.85rem;
  font-weight: 600;
}

.ctic-sub {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

/* ── Mint section ────────────────────────────────────────────── */
.ctic-mint-section { margin-top: 12px; }
.ctic-mint-title {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 4px;
}

/* ── Owners ──────────────────────────────────────────────────── */
.ctic-owners-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctic-owner-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 0.8rem;
}

.ctic-owner-mint {
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.ctic-owner-link {
  color: #93c5fd;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ctic-owner-link:hover { color: #bfdbfe; text-decoration: underline; }

.ctic-tradeable-badge {
  background: #d1fae5;
  color: #065f46;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  text-decoration: none;
}
.ctic-tradeable-badge:hover { text-decoration: underline; }

.ctic-owner-spacer {
  font-size: 0.7rem;
  width: 58px;
  display: inline-block;
}

/* ── Suggest form ────────────────────────────────────────────── */
.ctic-suggest-intro {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px;
}

.ctic-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ctic-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ctic-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: white;
  border-radius: 4px;
  padding: 7px 10px;
  font-size: 0.85rem;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.ctic-input:focus {
  outline: 2px solid var(--OrbitLightBlue);
  outline-offset: 0;
}

.ctic-success {
  font-size: 0.8rem;
  color: #86efac;
}

.ctic-no-change {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

/* ── Skeleton ────────────────────────────────────────────────── */
@keyframes ctic-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

.ctic-skel-tile {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctic-skel-line {
  background: linear-gradient(90deg, #1a3a5a 25%, #2a5a8a 50%, #1a3a5a 75%);
  background-size: 200% 100%;
  animation: ctic-shimmer 1.4s ease-in-out infinite;
  border-radius: 3px;
}

.ctic-skel-lbl  { height: 9px;  width: 55%; }
.ctic-skel-val  { height: 12px; width: 72%; }
.ctic-skel-sub  { height: 9px;  width: 45%; }
.ctic-skel-inp  { height: 32px; width: 100%; border-radius: 4px; }

.ctic-skel-wrap { display: flex; flex-direction: column; gap: 6px; }
.ctic-skel-field { display: flex; flex-direction: column; gap: 6px; }

/* ── State messages ──────────────────────────────────────────── */
.ctic-error { font-size: 0.8rem; color: #fca5a5; }
.ctic-empty { font-size: 0.8rem; color: rgba(255, 255, 255, 0.55); }

/* ── Footer ──────────────────────────────────────────────────── */
.ctic-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  gap: 8px;
}

.ctic-foot-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ctic-close-action {
  background: #b91c1c;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.82rem;
  cursor: pointer;
}
.ctic-close-action:hover { background: #991b1b; }

.ctic-edit-btn {
  background: var(--OrbitDarkBlue);
  border: 1px solid var(--OrbitLightBlue);
  color: white;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.82rem;
  text-decoration: none;
  display: inline-block;
}
.ctic-edit-btn:hover { background: #2a5580; }

.ctic-submit-btn {
  background: var(--OrbitLightBlue);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.82rem;
  cursor: pointer;
  margin-left: auto;
}
.ctic-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ctic-submit-btn:hover:not(:disabled) { background: #2288bb; }
</style>
