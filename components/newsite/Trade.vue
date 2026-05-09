<template>
  <div class="tr">

    <!-- ── Topbar with tabs ── -->
    <div class="tr-topbar">
      <div class="tr-tabs">
        <button class="tr-tab" :class="{ active: tradeActiveTab === 'incoming' }" @click="switchTab('incoming')">Incoming</button>
        <button class="tr-tab" :class="{ active: tradeActiveTab === 'outgoing' }" @click="switchTab('outgoing')">Outgoing</button>
        <button class="tr-tab" :class="{ active: tradeActiveTab === 'create' }" @click="switchTab('create')">Create Trade</button>
      </div>
      <div v-if="tradeActiveTab !== 'create'" class="tr-topbar-right">
        <span class="tr-pts-label">{{ (user?.points ?? 0).toLocaleString() }} pts</span>
      </div>
      <div v-else-if="tradeTargetUser" class="tr-topbar-right">
        <span class="tr-step-indicator">Step {{ tradeCurrentStep }} of 3</span>
      </div>
    </div>

    <!-- ── Content area ── -->
    <div class="tr-content">

      <!-- ─ INCOMING ─ -->
      <template v-if="tradeActiveTab === 'incoming'">
        <div v-if="loadingOffers" class="tr-loading">Loading…</div>
        <template v-else>
          <div v-if="!incoming.length" class="tr-empty">No incoming trades.</div>
          <template v-else>
            <div class="tr-list-head">
              <span class="tr-col-user">From</span>
              <span class="tr-col-pts">Points</span>
              <span class="tr-col-ct">↓ Off.</span>
              <span class="tr-col-ct">↑ Req.</span>
              <span class="tr-col-stat">Status</span>
              <span class="tr-col-date">Date</span>
              <span class="tr-col-act"></span>
            </div>
            <div
              v-for="offer in incoming"
              :key="offer.id"
              class="tr-row"
            >
              <span class="tr-col-user">
                <NuxtLink :to="`/newsite/czone/${offer.initiator.username}`" class="tr-link">{{ offer.initiator.username }}</NuxtLink>
              </span>
              <span class="tr-col-pts">{{ Number(offer.pointsOffered).toLocaleString() }}</span>
              <span class="tr-col-ct">{{ countByRole(offer, 'OFFERED') }}</span>
              <span class="tr-col-ct">{{ countByRole(offer, 'REQUESTED') }}</span>
              <span class="tr-col-stat"><span class="tr-badge" :class="statusBadgeClass(offer.status)">{{ offer.status.toLowerCase() }}</span></span>
              <span class="tr-col-date">{{ formatDate(offer.createdAt) }}</span>
              <span class="tr-col-act"><button class="tr-view-btn" @click="viewOffer(offer)">View</button></span>
            </div>
          </template>
        </template>
      </template>

      <!-- ─ OUTGOING ─ -->
      <template v-else-if="tradeActiveTab === 'outgoing'">
        <div v-if="loadingOffers" class="tr-loading">Loading…</div>
        <template v-else>
          <div v-if="!outgoing.length" class="tr-empty">No outgoing trades.</div>
          <template v-else>
            <div class="tr-list-head">
              <span class="tr-col-user">To</span>
              <span class="tr-col-pts">Points</span>
              <span class="tr-col-ct">↓ Off.</span>
              <span class="tr-col-ct">↑ Req.</span>
              <span class="tr-col-stat">Status</span>
              <span class="tr-col-date">Date</span>
              <span class="tr-col-act"></span>
            </div>
            <div
              v-for="offer in outgoing"
              :key="offer.id"
              class="tr-row"
            >
              <span class="tr-col-user">
                <NuxtLink :to="`/newsite/czone/${offer.recipient.username}`" class="tr-link">{{ offer.recipient.username }}</NuxtLink>
              </span>
              <span class="tr-col-pts">{{ Number(offer.pointsOffered).toLocaleString() }}</span>
              <span class="tr-col-ct">{{ countByRole(offer, 'OFFERED') }}</span>
              <span class="tr-col-ct">{{ countByRole(offer, 'REQUESTED') }}</span>
              <span class="tr-col-stat"><span class="tr-badge" :class="statusBadgeClass(offer.status)">{{ offer.status.toLowerCase() }}</span></span>
              <span class="tr-col-date">{{ formatDate(offer.createdAt) }}</span>
              <span class="tr-col-act"><button class="tr-view-btn" @click="viewOffer(offer)">View</button></span>
            </div>
          </template>
        </template>
      </template>

      <!-- ─ CREATE TRADE ─ -->
      <template v-else-if="tradeActiveTab === 'create'">

        <!-- Step 0: User picker -->
        <div class="tr-user-picker">
          <div class="tr-find-tabs">
            <button class="tr-find-tab" :class="{ active: findTab === 'user' }" @click="setFindTab('user')">Find User</button>
            <button class="tr-find-tab" :class="{ active: findTab === 'ctoon' }" @click="setFindTab('ctoon')">Find cToon</button>
          </div>

          <!-- Find User input -->
          <div v-if="findTab === 'user'" class="tr-find-row">
            <div class="tr-autocomplete-wrap">
              <input
                ref="userInputRef"
                v-model.trim="userQuery"
                @input="onUserQueryInput"
                @keydown="onUserKeydown"
                type="text"
                placeholder="Type a username…"
                autocomplete="off"
                class="tr-search-input"
              />
              <div v-if="showUserSuggest" ref="userSuggestRef" class="tr-suggest-box">
                <div v-if="isSearching" class="tr-suggest-dim">Searching…</div>
                <template v-else-if="userResults.length">
                  <button
                    v-for="(u, idx) in userResults"
                    :key="u.username"
                    :class="['tr-suggest-item', highlightedIndex === idx ? 'highlighted' : '']"
                    @mouseenter="highlightedIndex = idx"
                    @click="selectTargetUser(u)"
                  >
                    <img :src="`/avatars/${u.avatar || 'default.png'}`" class="tr-sug-avatar" />
                    <span>{{ u.username }}</span>
                    <span v-if="u.isBooster" class="tr-booster-tag">Booster</span>
                  </button>
                </template>
                <div v-else class="tr-suggest-dim">No matches</div>
              </div>
            </div>
          </div>

          <!-- Find cToon input -->
          <div v-else class="tr-find-row">
            <div class="tr-autocomplete-wrap">
              <input
                ref="ctoonInputRef"
                v-model.trim="ctoonQuery"
                @input="onCtoonQueryInput"
                @keydown="onCtoonKeydown"
                type="text"
                placeholder="Type a cToon name or character…"
                autocomplete="off"
                class="tr-search-input"
              />
              <div v-if="showCtoonSuggest" ref="ctoonSuggestRef" class="tr-suggest-box" @click.stop>
                <div v-if="isSearchingCtoon" class="tr-suggest-dim">Searching…</div>
                <template v-else>
                  <div v-if="ctoonMode === 'mint'" class="tr-ctoon-back-row">
                    <button class="tr-ctoon-back" @click="resetCtoonMode">← Back</button>
                    <span class="tr-suggest-dim">Mints for {{ activeCtoon?.name }}</span>
                  </div>
                  <template v-if="ctoonMode === 'ctoon' && ctoonResults.length">
                    <button
                      v-for="(c, idx) in ctoonResults"
                      :key="c.ctoonId"
                      :class="['tr-suggest-item', highlightedCtoonIndex === idx ? 'highlighted' : '']"
                      @mouseenter="highlightedCtoonIndex = idx"
                      @click="selectCtoonSummary(c)"
                    >
                      <img :src="c.assetPath" class="tr-sug-ctoon-img" />
                      <div>
                        <div>{{ c.name }}</div>
                        <div class="tr-suggest-dim">Highest Mint #{{ c.highestMint ?? '—' }}</div>
                      </div>
                    </button>
                  </template>
                  <template v-else-if="ctoonMode === 'mint' && ctoonMintResults.length">
                    <button
                      v-for="(c, idx) in ctoonMintResults"
                      :key="c.userCtoonId"
                      :class="['tr-suggest-item', highlightedCtoonIndex === idx ? 'highlighted' : '']"
                      @mouseenter="highlightedCtoonIndex = idx"
                      @click="selectCtoonMint(c)"
                    >
                      <img :src="c.assetPath" class="tr-sug-ctoon-img" />
                      <div>
                        <div>Mint #{{ c.mintNumber ?? '—' }}</div>
                        <div class="tr-suggest-dim">{{ c.ownerUsername }}</div>
                      </div>
                      <span v-if="c.isTradeListItem" class="tr-tradeable-tag">Tradeable</span>
                    </button>
                  </template>
                  <div v-else class="tr-suggest-dim">No matches</div>
                </template>
              </div>
            </div>
          </div>

          <!-- Selected user bar -->
          <div v-if="tradeTargetUser" class="tr-selected-user">
            <img :src="`/avatars/${tradeTargetUser.avatar || 'default.png'}`" class="tr-sel-avatar" />
            <span class="tr-sel-name">Trading with <strong>{{ tradeTargetUser.username }}</strong></span>
            <button class="tr-sel-change" @click="clearTarget(true)">Change</button>
          </div>
          <div v-if="targetError" class="tr-target-error">{{ targetError }}</div>
        </div>

        <!-- Step 1: Other user's collection -->
        <template v-if="tradeTargetUser && tradeCurrentStep === 1">
          <div class="tr-step-header">
            <div class="tr-step-title-group">
              <span class="tr-step-title">{{ tradeTargetUser.username }}'s Collection</span>
              <span class="tr-step-hint">Select cToons to request</span>
            </div>
            <button class="tr-btn-primary" :disabled="!selectedTargetCtoons.length" @click="tradeCurrentStep = 2">
              Next →
            </button>
          </div>

          <div v-if="loadingCollections.other" class="tr-loading">Loading collection…</div>
          <template v-else>
            <div v-if="!filteredOther.length" class="tr-empty">No cToons match your filters.</div>
            <template v-else>
              <div class="tr-pagination-row">
                <span class="tr-showing">{{ otherShowingRange }}</span>
                <div class="tr-page-btns">
                  <button class="tr-pg-btn" :disabled="pageOther === 1" @click="prevOtherPage">‹</button>
                  <span class="tr-pg-info">{{ pageOther }} / {{ totalPagesOther }}</span>
                  <button class="tr-pg-btn" :disabled="pageOther === totalPagesOther" @click="nextOtherPage">›</button>
                </div>
              </div>
              <div class="tr-cards">
                <div v-for="c in pagedOther" :key="c.id" class="tr-card-wrap">
                  <CtoonCard
                    :ctoon="c"
                    :selected="selectedTargetCtoonsMap.has(c.id)"
                    :disabled="c.inPendingTrade"
                    :badge="selfOwnedIdsCreate.has(c.ctoonId) ? 'Owned' : 'Unowned'"
                    @toggle="toggleTargetCtoon(c)"
                  />
                </div>
              </div>
              <div class="tr-pagination-row">
                <span class="tr-showing">{{ otherShowingRange }}</span>
                <div class="tr-page-btns">
                  <button class="tr-pg-btn" :disabled="pageOther === 1" @click="prevOtherPage">‹</button>
                  <span class="tr-pg-info">{{ pageOther }} / {{ totalPagesOther }}</span>
                  <button class="tr-pg-btn" :disabled="pageOther === totalPagesOther" @click="nextOtherPage">›</button>
                </div>
              </div>
            </template>
          </template>

          <div class="tr-step-footer">
            <button class="tr-btn-primary" :disabled="!selectedTargetCtoons.length" @click="tradeCurrentStep = 2">
              Next →
            </button>
          </div>
        </template>

        <!-- Step 2: Self collection -->
        <template v-if="tradeTargetUser && tradeCurrentStep === 2">
          <div class="tr-step-header">
            <div class="tr-step-title-group">
              <span class="tr-step-title">Your Collection &amp; Points</span>
              <div class="tr-points-row">
                <label class="tr-suggest-dim">Points to offer:</label>
                <input
                  type="number"
                  v-model.number="pointsToOffer"
                  :max="user?.points || 0"
                  min="0"
                  @input="pointsToOffer = Math.max(0, pointsToOffer)"
                  class="tr-points-input"
                  placeholder="0"
                />
              </div>
            </div>
            <div class="tr-step-btns">
              <button class="tr-btn-secondary" @click="tradeCurrentStep = 1">← Back</button>
              <button class="tr-btn-primary" :disabled="(selectedInitiatorCtoons.length === 0 && pointsToOffer === 0) || makingOffer" @click="tradeCurrentStep = 3">
                Confirm →
              </button>
            </div>
          </div>

          <div v-if="loadingCollections.self" class="tr-loading">Loading collection…</div>
          <template v-else>
            <div v-if="!filteredSelf.length" class="tr-empty">
              {{ tradeFiltersSelf.wishlistOnly
                ? `No cToons from ${tradeTargetUser?.username}'s Wishlist in your collection`
                : 'No cToons match your filters.' }}
            </div>
            <template v-else>
              <div class="tr-pagination-row">
                <span class="tr-showing">{{ selfShowingRange }}</span>
                <div class="tr-page-btns">
                  <button class="tr-pg-btn" :disabled="pageSelf === 1" @click="prevSelfPage">‹</button>
                  <span class="tr-pg-info">{{ pageSelf }} / {{ totalPagesSelf }}</span>
                  <button class="tr-pg-btn" :disabled="pageSelf === totalPagesSelf" @click="nextSelfPage">›</button>
                </div>
              </div>
              <div class="tr-cards">
                <div v-for="c in pagedSelf" :key="c.id" class="tr-card-wrap">
                  <CtoonCard
                    :ctoon="c"
                    :selected="selectedInitiatorCtoonsMap.has(c.id)"
                    :disabled="c.inPendingTrade"
                    :badge="targetOwnedIds.has(c.ctoonId) ? 'Owned by User' : 'Unowned by User'"
                    badge-class-owned="tc-badge--blue"
                    @toggle="toggleInitiatorCtoon(c)"
                  />
                </div>
              </div>
              <div class="tr-pagination-row">
                <span class="tr-showing">{{ selfShowingRange }}</span>
                <div class="tr-page-btns">
                  <button class="tr-pg-btn" :disabled="pageSelf === 1" @click="prevSelfPage">‹</button>
                  <span class="tr-pg-info">{{ pageSelf }} / {{ totalPagesSelf }}</span>
                  <button class="tr-pg-btn" :disabled="pageSelf === totalPagesSelf" @click="nextSelfPage">›</button>
                </div>
              </div>
            </template>
          </template>
        </template>

        <!-- Step 3: Confirm -->
        <template v-if="tradeTargetUser && tradeCurrentStep === 3">
          <div class="tr-step-header">
            <div class="tr-step-title-group">
              <span class="tr-step-title">Confirm Offer</span>
              <span class="tr-step-hint">Review before sending</span>
            </div>
            <div class="tr-step-btns">
              <button class="tr-btn-secondary" @click="tradeCurrentStep = 2">← Back</button>
              <button class="tr-btn-green" :disabled="(selectedInitiatorCtoons.length === 0 && pointsToOffer === 0) || makingOffer" @click="sendOffer">
                {{ makingOffer ? 'Sending…' : 'Make Offer' }}
              </button>
            </div>
          </div>

          <div class="tr-confirm-grid">
            <div class="tr-confirm-col">
              <div class="tr-confirm-label">Requesting from {{ tradeTargetUser.username }}</div>
              <div v-if="!selectedTargetCtoons.length" class="tr-suggest-dim tr-confirm-empty">No cToons selected.</div>
              <div v-else class="tr-confirm-cards">
                <div v-for="c in selectedTargetCtoons" :key="c.id" class="tr-confirm-card">
                  <img :src="c.assetPath" :alt="c.name" class="tr-confirm-img" />
                  <span class="tr-confirm-name">{{ c.name }}</span>
                  <span class="tr-suggest-dim">{{ c.rarity }}</span>
                </div>
              </div>
            </div>
            <div class="tr-confirm-col">
              <div class="tr-confirm-label">You're offering</div>
              <div class="tr-confirm-points">Points: {{ Number(pointsToOffer).toLocaleString() }}</div>
              <div v-if="!selectedInitiatorCtoons.length" class="tr-suggest-dim tr-confirm-empty">No cToons offered.</div>
              <div v-else class="tr-confirm-cards">
                <div v-for="c in selectedInitiatorCtoons" :key="c.id" class="tr-confirm-card">
                  <img :src="c.assetPath" :alt="c.name" class="tr-confirm-img" />
                  <span class="tr-confirm-name">{{ c.name }}</span>
                  <span class="tr-suggest-dim">{{ c.rarity }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

      </template>
    </div>

    <!-- ── Trade detail modal ── -->
    <Teleport to="body">
      <div v-if="showModal && currentOffer" class="tm-overlay" @click.self="closeModal">
        <div class="tm-panel">

          <!-- Modal header -->
          <div class="tm-head">
            <div class="tm-head-info">
              <div class="tm-head-title">
                Trade:
                <NuxtLink :to="`/newsite/czone/${currentOffer.initiator.username}`" class="tm-link">{{ currentOffer.initiator.username }}</NuxtLink>
                →
                <NuxtLink :to="`/newsite/czone/${currentOffer.recipient.username}`" class="tm-link">{{ currentOffer.recipient.username }}</NuxtLink>
              </div>
              <div class="tm-head-meta">
                <span>Points: {{ Number(currentOffer.pointsOffered).toLocaleString() }}</span>
                <span class="tr-badge" :class="statusBadgeClass(currentOffer.status)">{{ currentOffer.status.toLowerCase() }}</span>
                <span class="tm-dim">{{ formatDateTime(currentOffer.createdAt) }}</span>
              </div>
            </div>
            <button class="tm-close" @click="closeModal">✕</button>
          </div>

          <!-- Modal body -->
          <div class="tm-body">
            <div class="tm-cols">
              <!-- Offered cToons -->
              <div class="tm-col">
                <div class="tm-col-title">Offered cToons</div>
                <div class="tm-cards">
                  <div
                    v-for="tc in currentOffer.ctoons.filter(c => c.role === 'OFFERED')"
                    :key="tc.id"
                    class="tm-card"
                  >
                    <span class="tm-own-badge" :class="selfOwnedIdsModal.has(tc.userCtoon.ctoonId) ? 'owned' : 'unowned'">
                      {{ selfOwnedIdsModal.has(tc.userCtoon.ctoonId) ? 'Owned' : 'Unowned' }}
                    </span>
                    <img :src="tc.userCtoon.ctoon.assetPath" class="tm-card-img" />
                    <span class="tm-card-name">{{ tc.userCtoon.ctoon.name }}</span>
                    <span class="tm-dim">{{ tc.userCtoon.ctoon.rarity }}</span>
                    <span class="tm-dim">Mint #{{ tc.userCtoon.mintNumber }} of {{ formatQuantity(tc.userCtoon.ctoon.quantity) }}</span>
                    <span class="tm-dim">{{ tc.userCtoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}</span>
                  </div>
                  <div v-if="!currentOffer.ctoons.filter(c => c.role === 'OFFERED').length" class="tm-empty-col">None</div>
                </div>
              </div>
              <!-- Requested cToons -->
              <div class="tm-col">
                <div class="tm-col-title">Requested cToons</div>
                <div class="tm-cards">
                  <div
                    v-for="tc in currentOffer.ctoons.filter(c => c.role === 'REQUESTED')"
                    :key="tc.id"
                    class="tm-card"
                  >
                    <span class="tm-own-badge" :class="selfOwnedIdsModal.has(tc.userCtoon.ctoonId) ? 'owned' : 'unowned'">
                      {{ selfOwnedIdsModal.has(tc.userCtoon.ctoonId) ? 'Owned' : 'Unowned' }}
                    </span>
                    <img :src="tc.userCtoon.ctoon.assetPath" class="tm-card-img" />
                    <span class="tm-card-name">{{ tc.userCtoon.ctoon.name }}</span>
                    <span class="tm-dim">{{ tc.userCtoon.ctoon.rarity }}</span>
                    <span class="tm-dim">Mint #{{ tc.userCtoon.mintNumber }} of {{ formatQuantity(tc.userCtoon.ctoon.quantity) }}</span>
                    <span class="tm-dim">{{ tc.userCtoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}</span>
                    <div class="tm-own-stats">
                      <template v-if="!isLoadingModalSelf">
                        <span>You own: {{ getSelfStats(tc.userCtoon.ctoonId).count }}</span>
                        <span v-if="getSelfStats(tc.userCtoon.ctoonId).count > 0 && getSelfStats(tc.userCtoon.ctoonId).minMint != null">
                          Mints: {{ getSelfStats(tc.userCtoon.ctoonId).minMint }}–{{ getSelfStats(tc.userCtoon.ctoonId).maxMint }}
                        </span>
                      </template>
                      <span v-else class="tm-dim">Loading…</span>
                    </div>
                  </div>
                  <div v-if="!currentOffer.ctoons.filter(c => c.role === 'REQUESTED').length" class="tm-empty-col">None</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Modal footer -->
          <div class="tm-foot">
            <button
              v-if="isRecipient && currentOffer.status === 'PENDING'"
              class="tm-btn tm-btn-accept"
              :disabled="isProcessing"
              @click="acceptOffer"
            >Accept Offer</button>
            <button
              v-if="isRecipient && currentOffer.status === 'PENDING'"
              class="tm-btn tm-btn-reject"
              :disabled="isProcessing"
              @click="rejectOffer"
            >Reject Offer</button>
            <button
              v-if="isInitiator && currentOffer.status === 'PENDING'"
              class="tm-btn tm-btn-reject"
              :disabled="isProcessing"
              @click="rejectOffer"
            >Withdraw Offer</button>
            <button class="tm-btn tm-btn-close" @click="closeModal">Close</button>
          </div>

          <div v-if="modalToast.show" class="tm-toast" :class="modalToast.type">{{ modalToast.message }}</div>
        </div>
      </div>
    </Teleport>

    <!-- Page-level toast -->
    <Teleport to="body">
      <div v-if="pageToast.show" class="tr-page-toast" :class="pageToast.type">{{ pageToast.message }}</div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { formatQuantity } from '~/utils/formatQuantity'
import CtoonCard from '@/components/trade/CtoonCard.vue'

const route = useRoute()
const { user, fetchSelf } = useAuth()

const {
  tradeActiveTab,
  tradeTargetUser,
  tradeCurrentStep,
  tradeFiltersOther,
  tradeFiltersSelf,
  tradeSetOptionsOther,
  tradeSetOptionsSelf,
  tradeSeriesOptionsOther,
  tradeSeriesOptionsSelf,
  tradeRarityOptionsOther,
  tradeRarityOptionsSelf,
  tradeNameSuggestionsOther,
  tradeNameSuggestionsSelf,
  tradeLoadingWishlist,
  tradeTargetWishlistCount,
} = useTradePageFilters()

// ── Trade offers ──────────────────────────────────────────────────
const incoming = ref([])
const outgoing = ref([])
const loadingOffers = ref(false)

async function loadOffers() {
  loadingOffers.value = true
  try {
    const [inc, out] = await Promise.all([
      $fetch('/api/trade/offers/incoming'),
      $fetch('/api/trade/offers/outgoing'),
    ])
    incoming.value = Array.isArray(inc) ? inc : []
    outgoing.value = Array.isArray(out) ? out : []
  } catch {
    incoming.value = []
    outgoing.value = []
  } finally {
    loadingOffers.value = false
  }
}

function switchTab(tab) {
  tradeActiveTab.value = tab
  if (tab === 'incoming' || tab === 'outgoing') loadOffers()
}

// ── Modal ─────────────────────────────────────────────────────────
const showModal = ref(false)
const currentOffer = ref(null)
const isProcessing = ref(false)
const modalSelfCtoons = ref([])
const isLoadingModalSelf = ref(false)

const selfOwnedIdsModal = computed(() => new Set(modalSelfCtoons.value.map(sc => sc.ctoonId)))

const selfStatsByCtoonId = computed(() => {
  const map = new Map()
  for (const uc of modalSelfCtoons.value) {
    const id = uc.ctoonId
    let entry = map.get(id)
    if (!entry) { entry = { count: 0, minMint: null, maxMint: null }; map.set(id, entry) }
    entry.count++
    if (uc.mintNumber != null) {
      entry.minMint = entry.minMint == null ? uc.mintNumber : Math.min(entry.minMint, uc.mintNumber)
      entry.maxMint = entry.maxMint == null ? uc.mintNumber : Math.max(entry.maxMint, uc.mintNumber)
    }
  }
  return map
})
function getSelfStats(ctoonId) {
  return selfStatsByCtoonId.value.get(ctoonId) || { count: 0, minMint: null, maxMint: null }
}

const isRecipient = computed(() => currentOffer.value?.recipient.id === user.value?.id)
const isInitiator = computed(() => currentOffer.value?.initiator.id === user.value?.id)

const modalToast = reactive({ show: false, message: '', type: 'success' })
const pageToast = reactive({ show: false, message: '', type: 'success' })

function showModalToast(msg, type = 'success') {
  modalToast.show = true; modalToast.message = msg; modalToast.type = type
  setTimeout(() => { modalToast.show = false }, 4000)
}
function showPageToast(msg, type = 'success') {
  pageToast.show = true; pageToast.message = msg; pageToast.type = type
  setTimeout(() => { pageToast.show = false }, 4000)
}

function viewOffer(offer) {
  currentOffer.value = offer
  showModal.value = true
  loadModalSelfCollection()
}
function closeModal() {
  showModal.value = false; currentOffer.value = null; isProcessing.value = false; modalToast.show = false
}

async function loadModalSelfCollection() {
  if (!user.value?.username) return
  isLoadingModalSelf.value = true
  try { modalSelfCtoons.value = await $fetch(`/api/collection/${user.value.username}`) }
  catch { modalSelfCtoons.value = [] }
  finally { isLoadingModalSelf.value = false }
}

async function acceptOffer() {
  isProcessing.value = true
  try {
    await $fetch(`/api/trade/offers/${currentOffer.value.id}/accept`, { method: 'POST' })
    closeModal(); await loadOffers(); showPageToast('Offer accepted!', 'success')
  } catch (err) {
    showModalToast(err.data?.statusMessage || err.statusMessage || 'Failed to accept', 'error')
  } finally { isProcessing.value = false }
}

async function rejectOffer() {
  const wasInitiator = isInitiator.value
  isProcessing.value = true
  try {
    await $fetch(`/api/trade/offers/${currentOffer.value.id}/reject`, { method: 'POST' })
    closeModal(); await loadOffers()
    showPageToast(wasInitiator ? 'Offer withdrawn.' : 'Offer rejected.', 'success')
  } catch (err) {
    showModalToast(err.data?.statusMessage || err.statusMessage || 'Failed to reject', 'error')
  } finally { isProcessing.value = false }
}

// ── Create Trade: User search ─────────────────────────────────────
const MIN_CHARS = 3
const DEBOUNCE_MS = 250
const PAGE_SIZE = 50

const findTab = ref('user')
const userQuery = ref('')
const userResults = ref([])
const showUserSuggest = ref(false)
const isSearching = ref(false)
const highlightedIndex = ref(-1)
const targetError = ref('')
const userInputRef = ref(null)
const userSuggestRef = ref(null)

const ctoonQuery = ref('')
const ctoonResults = ref([])
const ctoonMintResults = ref([])
const ctoonMode = ref('ctoon')
const activeCtoon = ref(null)
const showCtoonSuggest = ref(false)
const isSearchingCtoon = ref(false)
const highlightedCtoonIndex = ref(-1)
const ctoonInputRef = ref(null)
const ctoonSuggestRef = ref(null)
const suppressCtoonInput = ref(false)

let userSearchTimer, ctoonSearchTimer
const userSearchCache = new Map()
const ctoonSearchCache = new Map()
const ctoonMintCache = new Map()

async function setFindTab(tab) {
  if (findTab.value === tab) return
  findTab.value = tab; targetError.value = ''; showUserSuggest.value = false; showCtoonSuggest.value = false
  await nextTick()
  if (tab === 'user') userInputRef.value?.focus()
  if (tab === 'ctoon') ctoonInputRef.value?.focus()
}

function isSelfUsername(name) {
  const me = (user.value?.username || '').toLowerCase()
  return !!me && String(name || '').toLowerCase() === me
}
function filterOutSelf(items) { return (items || []).filter(r => r.username && !isSelfUsername(r.username)) }

function onUserQueryInput() {
  targetError.value = ''; showUserSuggest.value = true; highlightedIndex.value = -1
  clearTimeout(userSearchTimer)
  const q = userQuery.value || ''
  if (q.length < MIN_CHARS) { userResults.value = []; isSearching.value = false; return }
  userSearchTimer = setTimeout(async () => {
    const key = q.toLowerCase()
    try {
      isSearching.value = true
      if (userSearchCache.has(key)) { userResults.value = filterOutSelf(userSearchCache.get(key)); return }
      const res = await $fetch('/api/users/search', { params: { q, limit: 8 } })
      const items = Array.isArray(res) ? res : (res?.items || [])
      userSearchCache.set(key, items); userResults.value = filterOutSelf(items)
    } catch { userResults.value = [] }
    finally { isSearching.value = false }
  }, DEBOUNCE_MS)
}

function onUserKeydown(e) {
  if (!showUserSuggest.value) return
  const max = userResults.value.length - 1
  if (e.key === 'ArrowDown') { e.preventDefault(); highlightedIndex.value = highlightedIndex.value < max ? highlightedIndex.value + 1 : 0 }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlightedIndex.value = highlightedIndex.value > 0 ? highlightedIndex.value - 1 : max }
  else if (e.key === 'Enter' && highlightedIndex.value >= 0) { e.preventDefault(); selectTargetUser(userResults.value[highlightedIndex.value]) }
  else if (e.key === 'Escape') showUserSuggest.value = false
}

function onCtoonQueryInput() {
  if (suppressCtoonInput.value) { suppressCtoonInput.value = false; return }
  targetError.value = ''; showCtoonSuggest.value = true; resetCtoonMode()
  clearTimeout(ctoonSearchTimer)
  const q = ctoonQuery.value || ''
  if (q.length < MIN_CHARS) { ctoonResults.value = []; isSearchingCtoon.value = false; return }
  ctoonSearchTimer = setTimeout(async () => {
    const key = q.toLowerCase()
    try {
      isSearchingCtoon.value = true
      if (ctoonSearchCache.has(key)) { ctoonResults.value = ctoonSearchCache.get(key); return }
      const res = await $fetch('/api/trade/search-ctoons', { params: { q, limit: 50 } })
      const items = Array.isArray(res) ? res : (res?.items || [])
      ctoonSearchCache.set(key, items); ctoonResults.value = items
    } catch { ctoonResults.value = [] }
    finally { isSearchingCtoon.value = false }
  }, DEBOUNCE_MS)
}

function onCtoonKeydown(e) {
  if (!showCtoonSuggest.value) return
  const list = ctoonMode.value === 'mint' ? ctoonMintResults.value : ctoonResults.value
  const max = list.length - 1
  if (e.key === 'ArrowDown') { e.preventDefault(); highlightedCtoonIndex.value = highlightedCtoonIndex.value < max ? highlightedCtoonIndex.value + 1 : 0 }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlightedCtoonIndex.value = highlightedCtoonIndex.value > 0 ? highlightedCtoonIndex.value - 1 : max }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const item = list[highlightedCtoonIndex.value >= 0 ? highlightedCtoonIndex.value : 0]
    if (item) ctoonMode.value === 'mint' ? selectCtoonMint(item) : selectCtoonSummary(item)
  } else if (e.key === 'Escape') showCtoonSuggest.value = false
}

function resetCtoonMode() { ctoonMode.value = 'ctoon'; activeCtoon.value = null; ctoonMintResults.value = []; highlightedCtoonIndex.value = -1 }

async function selectCtoonSummary(item) {
  if (!item?.ctoonId) return
  ctoonMode.value = 'mint'; activeCtoon.value = { ctoonId: item.ctoonId, name: item.name, assetPath: item.assetPath }
  suppressCtoonInput.value = true; ctoonQuery.value = item.name || ctoonQuery.value
  setTimeout(() => { suppressCtoonInput.value = false }, 0)
  highlightedCtoonIndex.value = -1; showCtoonSuggest.value = true
  const key = String(item.ctoonId)
  try {
    isSearchingCtoon.value = true
    if (ctoonMintCache.has(key)) { ctoonMintResults.value = sortMintResults(ctoonMintCache.get(key)); return }
    const res = await $fetch('/api/trade/search-ctoons', { params: { ctoonId: item.ctoonId } })
    const items = Array.isArray(res) ? res : (res?.items || [])
    const sorted = sortMintResults(items); ctoonMintCache.set(key, sorted); ctoonMintResults.value = sorted
  } catch { ctoonMintResults.value = [] }
  finally { isSearchingCtoon.value = false }
}

async function selectCtoonMint(item) {
  await ensureSelfLoaded()
  if (!item?.ownerUsername) return
  if (isSelfUsername(item.ownerUsername)) { targetError.value = "You can't trade with yourself."; return }
  await clearTarget(false)
  manualPreselectUserCtoonId.value = item.userCtoonId
  ctoonQuery.value = item.name || ctoonQuery.value
  showCtoonSuggest.value = false; highlightedCtoonIndex.value = -1
  await selectTargetUser({ username: item.ownerUsername, avatar: item.ownerAvatar }, { keepPreselect: true })
}

async function selectTargetUser(u, options = {}) {
  await ensureSelfLoaded()
  if (isSelfUsername(u.username)) { targetError.value = "You can't trade with yourself."; return }
  if (!options.keepPreselect) manualPreselectUserCtoonId.value = null
  tradeTargetUser.value = u; pageOther.value = 1; pageSelf.value = 1
  userQuery.value = u.username; showUserSuggest.value = false; showCtoonSuggest.value = false
  highlightedIndex.value = -1; tradeCurrentStep.value = 1
  bootstrapCollections(); loadTargetWishlist()
}

async function ensureSelfLoaded() {
  if (user.value?.username) return
  try { await fetchSelf() } catch {}
}

async function clearTarget(focusInput = false) {
  tradeTargetUser.value = null; tradeCurrentStep.value = 1; targetError.value = ''
  userQuery.value = ''; userResults.value = []; highlightedIndex.value = -1; showUserSuggest.value = false
  ctoonQuery.value = ''; ctoonResults.value = []; ctoonMintResults.value = []; ctoonMode.value = 'ctoon'
  activeCtoon.value = null; highlightedCtoonIndex.value = -1; showCtoonSuggest.value = false
  manualPreselectUserCtoonId.value = null
  selectedTargetCtoons.value = []; selectedInitiatorCtoons.value = []; pointsToOffer.value = 0
  otherCtoons.value = []; selfCtoons.value = []; otherTradeList.value = []; selfTradeList.value = []
  pageOther.value = 1; pageSelf.value = 1
  tradeFiltersOther.value = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' }
  tradeFiltersSelf.value = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }
  targetWishlist.value = []; tradeLoadingWishlist.value = false; tradeTargetWishlistCount.value = 0
  tradeSetOptionsOther.value = ['All']; tradeSetOptionsSelf.value = ['All']
  tradeSeriesOptionsOther.value = ['All']; tradeSeriesOptionsSelf.value = ['All']
  tradeRarityOptionsOther.value = ['All']; tradeRarityOptionsSelf.value = ['All']
  tradeNameSuggestionsOther.value = []; tradeNameSuggestionsSelf.value = []
  if (focusInput) {
    await nextTick()
    if (findTab.value === 'ctoon') ctoonInputRef.value?.focus()
    else userInputRef.value?.focus()
  }
}

// ── Create Trade: Collections ─────────────────────────────────────
const loadingCollections = reactive({ other: false, self: false })
const otherCtoons = ref([])
const selfCtoons = ref([])
const otherTradeList = ref([])
const selfTradeList = ref([])
const targetWishlist = ref([])
const manualPreselectUserCtoonId = ref(null)

const targetOwnedIds = computed(() => new Set(otherCtoons.value.map(c => c.ctoonId)))
const selfOwnedIdsCreate = computed(() => new Set(selfCtoons.value.map(c => c.ctoonId)))
const otherTradeListIds = computed(() => new Set(otherTradeList.value.map(item => item?.userCtoonId).filter(Boolean)))
const selfTradeListIds = computed(() => new Set(selfTradeList.value.map(item => item?.userCtoonId).filter(Boolean)))
const targetWishlistIds = computed(() => new Set(targetWishlist.value.map(w => w?.ctoon?.id).filter(Boolean)))

async function loadTargetWishlist() {
  if (!tradeTargetUser.value) return
  try {
    tradeLoadingWishlist.value = true
    const res = await $fetch(`/api/wishlist/users/${tradeTargetUser.value.username}`)
    targetWishlist.value = Array.isArray(res) ? res : []
    tradeTargetWishlistCount.value = targetWishlist.value.length
  } catch { targetWishlist.value = []; tradeTargetWishlistCount.value = 0 }
  finally { tradeLoadingWishlist.value = false }
}

async function bootstrapCollections() {
  if (!tradeTargetUser.value) return
  loadingCollections.other = true; loadingCollections.self = true
  try {
    await fetchSelf()
    const [other, self, otherTrade, selfTrade] = await Promise.all([
      $fetch(`/api/collection/${tradeTargetUser.value.username}`),
      $fetch(`/api/collection/${user.value.username}`),
      $fetch(`/api/trade-list/users/${tradeTargetUser.value.username}`).catch(() => []),
      $fetch('/api/trade-list').catch(() => []),
    ])
    otherCtoons.value = Array.isArray(other) ? other : []
    selfCtoons.value = Array.isArray(self) ? self : []
    otherTradeList.value = Array.isArray(otherTrade) ? otherTrade : []
    selfTradeList.value = Array.isArray(selfTrade) ? selfTrade : []
    updateFilterOptions()
    applyPreselectedTargetCtoon()
  } finally { loadingCollections.other = false; loadingCollections.self = false }
}

function updateFilterOptions() {
  tradeSetOptionsOther.value = ['All', ...sortAlpha(uniqueTruthies(otherCtoons.value.map(c => c.set ?? c.setName ?? c.collectionSet)))]
  tradeSetOptionsSelf.value = ['All', ...sortAlpha(uniqueTruthies(selfCtoons.value.map(c => c.set ?? c.setName ?? c.collectionSet)))]
  tradeSeriesOptionsOther.value = ['All', ...sortAlpha(uniqueTruthies(otherCtoons.value.map(c => c.series ?? c.seriesName)))]
  tradeSeriesOptionsSelf.value = ['All', ...sortAlpha(uniqueTruthies(selfCtoons.value.map(c => c.series ?? c.seriesName)))]
  tradeRarityOptionsOther.value = buildRarityOptions(otherCtoons.value)
  tradeRarityOptionsSelf.value = buildRarityOptions(selfCtoons.value)
}

// ── Selections ────────────────────────────────────────────────────
const selectedTargetCtoons = ref([])
const selectedInitiatorCtoons = ref([])
const selectedTargetCtoonsMap = computed(() => new Set(selectedTargetCtoons.value.map(c => c.id)))
const selectedInitiatorCtoonsMap = computed(() => new Set(selectedInitiatorCtoons.value.map(c => c.id)))

function applyPreselectedTargetCtoon() {
  const preselectId = manualPreselectUserCtoonId.value || (route.query.userCtoonId ? String(route.query.userCtoonId) : null)
  if (!preselectId) return
  const match = otherCtoons.value.find(c => c.id === preselectId)
  if (match && !selectedTargetCtoonsMap.value.has(match.id)) selectedTargetCtoons.value.push(match)
}

function toggleTargetCtoon(c) {
  if (c.inPendingTrade) return
  const i = selectedTargetCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedTargetCtoons.value.splice(i, 1); else selectedTargetCtoons.value.push(c)
}
function toggleInitiatorCtoon(c) {
  if (c.inPendingTrade) return
  const i = selectedInitiatorCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedInitiatorCtoons.value.splice(i, 1); else selectedInitiatorCtoons.value.push(c)
}

// ── Filtering ─────────────────────────────────────────────────────
const PRIORITY_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
function buildRarityOptions(list) {
  const all = Array.from(new Set(list.map(c => (c.rarity ?? '').toString().trim()).filter(Boolean)))
  return ['All', ...PRIORITY_RARITIES.filter(r => all.includes(r)), ...all.filter(r => !PRIORITY_RARITIES.includes(r)).sort()]
}
function sortAlpha(arr) { return [...arr].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })) }
function uniqueTruthies(arr) { return [...new Set(arr.map(x => (x ?? '').toString().trim()).filter(Boolean))] }

const dupIdsOther = computed(() => {
  const m = new Map(); for (const c of otherCtoons.value) m.set(c.ctoonId, (m.get(c.ctoonId) || 0) + 1)
  return new Set([...m].filter(([, n]) => n > 1).map(([id]) => id))
})
const dupIdsSelf = computed(() => {
  const m = new Map(); for (const c of selfCtoons.value) m.set(c.ctoonId, (m.get(c.ctoonId) || 0) + 1)
  return new Set([...m].filter(([, n]) => n > 1).map(([id]) => id))
})

function applyFilters(items, f, ctx) {
  const nameQ = f.nameQuery?.toLowerCase().trim()
  return items.filter(c => {
    if (nameQ && !c.name?.toLowerCase().includes(nameQ)) return false
    if (f.set && f.set !== 'All' && c.set !== f.set) return false
    if (f.series && f.series !== 'All' && c.series !== f.series) return false
    if (f.rarity && f.rarity !== 'All' && c.rarity !== f.rarity) return false
    if (f.duplicates === 'dups' && !ctx.dupIds.has(c.ctoonId)) return false
    if (f.duplicates === 'trade-list' && !ctx.tradeListIds.has(c.id)) return false
    const isOwned = ctx.ownedPredicate(c)
    if (f.owned === 'owned' && !isOwned) return false
    if (f.owned === 'unowned' && isOwned) return false
    return true
  }).sort((a, b) => {
    const aO = ctx.ownedPredicate(a); const bO = ctx.ownedPredicate(b)
    return aO === bO ? 0 : (aO ? 1 : -1)
  })
}

const filteredOther = computed(() => applyFilters(otherCtoons.value, tradeFiltersOther.value, {
  ownedPredicate: c => selfOwnedIdsCreate.value.has(c.ctoonId),
  dupIds: dupIdsOther.value, tradeListIds: otherTradeListIds.value
}))
const filteredSelf = computed(() => {
  let list = applyFilters(selfCtoons.value, tradeFiltersSelf.value, {
    ownedPredicate: c => targetOwnedIds.value.has(c.ctoonId),
    dupIds: dupIdsSelf.value, tradeListIds: selfTradeListIds.value
  })
  if (tradeFiltersSelf.value.wishlistOnly) list = list.filter(c => targetWishlistIds.value.has(c.ctoonId))
  return list
})

// ── Pagination ────────────────────────────────────────────────────
const pageOther = ref(1)
const pageSelf = ref(1)
const totalPagesOther = computed(() => Math.max(1, Math.ceil(filteredOther.value.length / PAGE_SIZE)))
const totalPagesSelf = computed(() => Math.max(1, Math.ceil(filteredSelf.value.length / PAGE_SIZE)))
const pagedOther = computed(() => { const s = (pageOther.value - 1) * PAGE_SIZE; return filteredOther.value.slice(s, s + PAGE_SIZE) })
const pagedSelf = computed(() => { const s = (pageSelf.value - 1) * PAGE_SIZE; return filteredSelf.value.slice(s, s + PAGE_SIZE) })
const otherShowingRange = computed(() => {
  const t = filteredOther.value.length; if (!t) return '0 items'
  const s = (pageOther.value - 1) * PAGE_SIZE + 1; return `${s}–${Math.min(pageOther.value * PAGE_SIZE, t)} of ${t}`
})
const selfShowingRange = computed(() => {
  const t = filteredSelf.value.length; if (!t) return '0 items'
  const s = (pageSelf.value - 1) * PAGE_SIZE + 1; return `${s}–${Math.min(pageSelf.value * PAGE_SIZE, t)} of ${t}`
})

watch(tradeFiltersOther, () => { pageOther.value = 1 }, { deep: true })
watch(tradeFiltersSelf, () => { pageSelf.value = 1 }, { deep: true })
watch(totalPagesOther, t => { if (pageOther.value > t) pageOther.value = t })
watch(totalPagesSelf, t => { if (pageSelf.value > t) pageSelf.value = t })

function prevOtherPage() { if (pageOther.value > 1) pageOther.value-- }
function nextOtherPage() { if (pageOther.value < totalPagesOther.value) pageOther.value++ }
function prevSelfPage() { if (pageSelf.value > 1) pageSelf.value-- }
function nextSelfPage() { if (pageSelf.value < totalPagesSelf.value) pageSelf.value++ }

// Watch nameQuery changes from sidebar to rebuild suggestions
watch(() => tradeFiltersOther.value?.nameQuery, q => {
  tradeNameSuggestionsOther.value = buildNameSuggestions(q, otherCtoons.value)
})
watch(() => tradeFiltersSelf.value?.nameQuery, q => {
  tradeNameSuggestionsSelf.value = buildNameSuggestions(q, selfCtoons.value)
})
function buildNameSuggestions(q, list) {
  if (!q || q.length < 3) return []
  const lower = q.toLowerCase()
  return list.map(c => c.name).filter(Boolean).filter(n => n.toLowerCase().includes(lower)).slice(0, 8)
}

// ── Offer creation ────────────────────────────────────────────────
const pointsToOffer = ref(0)
const makingOffer = ref(false)

async function sendOffer() {
  if (!tradeTargetUser.value || pointsToOffer.value < 0) return
  const payload = {
    recipientUsername: tradeTargetUser.value.username,
    ctoonIdsRequested: selectedTargetCtoons.value.map(c => c.id),
    ctoonIdsOffered: selectedInitiatorCtoons.value.map(c => c.id),
    pointsOffered: pointsToOffer.value,
  }
  try {
    makingOffer.value = true
    await $fetch('/api/trade/offers', { method: 'POST', body: payload })
    showPageToast('Trade offer sent!', 'success')
    await clearTarget(false)
    switchTab('outgoing')
  } catch (e) {
    const msg = e?.data?.statusMessage || e?.statusMessage || e?.message || 'Please try again.'
    showPageToast(`Failed to send offer: ${msg}`, 'error')
  } finally { makingOffer.value = false }
}

// ── Global click to close suggestions ────────────────────────────
function onGlobalClick(e) {
  const t = e.target
  if (!(userInputRef.value?.contains(t) || userSuggestRef.value?.contains(t))) showUserSuggest.value = false
  if (!(ctoonInputRef.value?.contains(t) || ctoonSuggestRef.value?.contains(t))) showCtoonSuggest.value = false
}

// ── Init from query ───────────────────────────────────────────────
async function initFromQuery() {
  const rawUsername = route.query.username
  if (!rawUsername) return
  const uname = String(rawUsername).trim()
  if (!uname) return
  tradeActiveTab.value = 'create'
  findTab.value = 'user'
  userQuery.value = uname
  if (isSelfUsername(uname)) { targetError.value = "You can't trade with yourself."; return }
  try {
    isSearching.value = true
    const res = await $fetch('/api/users/search', { params: { q: uname, limit: 8 } })
    const items = Array.isArray(res) ? res : (res?.items || [])
    const match = items.find(u => u.username?.toLowerCase() === uname.toLowerCase())
    if (match) { await selectTargetUser(match) }
    else { showUserSuggest.value = true; onUserQueryInput() }
  } catch { showUserSuggest.value = true; onUserQueryInput() }
  finally { isSearching.value = false }
}

// ── Helpers ───────────────────────────────────────────────────────
function sortMintResults(list) {
  return [...(list || [])].sort((a, b) => {
    const am = a?.mintNumber ?? Infinity; const bm = b?.mintNumber ?? Infinity
    if (am !== bm) return am - bm
    return (a?.ownerUsername || '').localeCompare(b?.ownerUsername || '', undefined, { sensitivity: 'base' })
  })
}
function countByRole(offer, role) { return offer.ctoons.filter(c => c.role === role).length }
function formatDate(iso) { return new Date(iso).toLocaleDateString() }
function formatDateTime(iso) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
function statusBadgeClass(status) {
  return { PENDING: 'badge-pending', ACCEPTED: 'badge-accepted', REJECTED: 'badge-rejected', WITHDRAWN: 'badge-withdrawn' }[status] || 'badge-withdrawn'
}

// ── Lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  if (process.client) window.addEventListener('click', onGlobalClick)
  await fetchSelf()
  await loadOffers()
  await initFromQuery()
})
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', onGlobalClick)
})
</script>

<style scoped>
/* ── Container ── */
.tr {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

/* ── Topbar ── */
.tr-topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--OrbitDarkBlue);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
}
.tr-tabs { display: flex; flex: 1; gap: 2px; }
.tr-tab {
  padding: 3px 10px;
  border: none;
  border-radius: 4px 4px 0 0;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.45);
  font-size: 0.65rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}
.tr-tab.active { background: var(--OrbitLightBlue); color: #fff; }
.tr-tab:not(.active):hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
.tr-topbar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.tr-pts-label { font-size: 0.65rem; color: var(--OrbitGreen); font-weight: bold; }
.tr-step-indicator { font-size: 0.62rem; color: rgba(255,255,255,0.6); }

/* ── Content ── */
.tr-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
}

/* ── List (incoming / outgoing) ── */
.tr-list-head, .tr-row {
  display: grid;
  grid-template-columns: 1fr 60px 45px 45px 80px 72px 58px;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 0.68rem;
}
.tr-list-head {
  background: rgba(0,0,0,0.35);
  border-radius: 4px;
  color: rgba(255,255,255,0.5);
  font-weight: bold;
  text-transform: uppercase;
  font-size: 0.58rem;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.tr-row {
  background: rgba(0,0,0,0.18);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 4px;
  color: white;
  flex-shrink: 0;
  transition: background 0.12s;
}
.tr-row:hover { background: rgba(0,0,0,0.3); }
.tr-col-user { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-col-pts, .tr-col-ct, .tr-col-stat, .tr-col-date, .tr-col-act { text-align: center; }
.tr-link { color: var(--OrbitLightBlue); text-decoration: none; }
.tr-link:hover { text-decoration: underline; }
.tr-view-btn {
  font-size: 0.6rem; font-weight: bold; padding: 2px 6px; border-radius: 3px;
  background: var(--OrbitLightBlue); color: white; border: none; cursor: pointer; font-family: inherit;
}
.tr-view-btn:hover { background: var(--OrbitDarkBlue); }

/* ── Status badges ── */
.tr-badge {
  display: inline-block; padding: 1px 5px; border-radius: 9999px; font-size: 0.58rem; font-weight: bold; text-transform: capitalize;
}
.badge-pending { background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
.badge-accepted { background: rgba(74,222,128,0.2); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.badge-rejected { background: rgba(248,113,113,0.2); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
.badge-withdrawn { background: rgba(156,163,175,0.2); color: #9ca3af; border: 1px solid rgba(156,163,175,0.3); }

/* ── Create Trade: User picker ── */
.tr-user-picker {
  background: rgba(0,0,0,0.25);
  border-radius: 6px;
  padding: 8px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tr-find-tabs { display: flex; gap: 4px; }
.tr-find-tab {
  padding: 2px 8px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.2);
  background: transparent; color: rgba(255,255,255,0.6); font-size: 0.65rem; font-weight: bold;
  cursor: pointer; font-family: inherit; transition: all 0.12s;
}
.tr-find-tab.active { background: var(--OrbitLightBlue); color: white; border-color: var(--OrbitLightBlue); }
.tr-find-tab:not(.active):hover { background: rgba(255,255,255,0.08); color: white; }

.tr-find-row { position: relative; }
.tr-autocomplete-wrap { position: relative; }
.tr-search-input {
  width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px; color: white; font-size: 0.72rem; padding: 5px 8px; outline: none; font-family: inherit;
}
.tr-search-input::placeholder { color: rgba(255,255,255,0.3); }
.tr-search-input:focus { border-color: var(--OrbitLightBlue); }

.tr-suggest-box {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 30; margin-top: 2px;
  background: #002255; border: 1px solid var(--OrbitLightBlue); border-radius: 4px;
  max-height: 200px; overflow-y: auto;
}
.tr-suggest-item {
  display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 5px 8px;
  font-size: 0.68rem; color: white; background: none; border: none; cursor: pointer; font-family: inherit;
}
.tr-suggest-item:hover, .tr-suggest-item.highlighted { background: rgba(51,153,204,0.3); }
.tr-suggest-dim { font-size: 0.6rem; color: rgba(255,255,255,0.45); padding: 4px 8px; }
.tr-sug-avatar { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); }
.tr-sug-ctoon-img { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; border-radius: 3px; background: rgba(255,255,255,0.1); }
.tr-booster-tag { margin-left: auto; font-size: 0.55rem; padding: 1px 4px; border-radius: 9999px; background: rgba(251,191,36,0.25); color: #fbbf24; border: 1px solid rgba(251,191,36,0.35); }
.tr-tradeable-tag { margin-left: auto; font-size: 0.55rem; padding: 1px 4px; border-radius: 9999px; background: rgba(74,222,128,0.2); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.tr-ctoon-back-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.tr-ctoon-back { background: none; border: none; color: var(--OrbitLightBlue); font-size: 0.65rem; cursor: pointer; font-family: inherit; padding: 0; }

.tr-selected-user {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  background: rgba(51,153,204,0.15); border-radius: 4px; border: 1px solid rgba(51,153,204,0.3);
}
.tr-sel-avatar { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; }
.tr-sel-name { font-size: 0.7rem; color: white; flex: 1; }
.tr-sel-change {
  font-size: 0.6rem; padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); cursor: pointer; font-family: inherit;
}
.tr-sel-change:hover { background: rgba(255,255,255,0.18); color: white; }
.tr-target-error { font-size: 0.65rem; color: #f87171; }

/* ── Step header ── */
.tr-step-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  padding: 6px 0 4px; flex-shrink: 0;
}
.tr-step-title-group { display: flex; flex-direction: column; gap: 1px; }
.tr-step-title { font-size: 0.78rem; font-weight: bold; color: white; }
.tr-step-hint { font-size: 0.6rem; color: rgba(255,255,255,0.45); }
.tr-step-btns { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
.tr-step-footer { display: flex; justify-content: flex-end; padding: 4px 0; flex-shrink: 0; }
.tr-points-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
.tr-points-input {
  width: 72px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px; color: white; font-size: 0.7rem; padding: 2px 6px; outline: none; font-family: inherit;
}
.tr-points-input:focus { border-color: var(--OrbitLightBlue); }

/* ── Buttons ── */
.tr-btn-primary, .tr-btn-secondary, .tr-btn-green {
  padding: 4px 10px; border-radius: 4px; border: none; font-size: 0.68rem; font-weight: bold;
  cursor: pointer; font-family: inherit; transition: opacity 0.12s;
}
.tr-btn-primary { background: var(--OrbitLightBlue); color: white; }
.tr-btn-primary:hover:not(:disabled) { opacity: 0.85; }
.tr-btn-secondary { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.2); }
.tr-btn-secondary:hover { background: rgba(255,255,255,0.2); }
.tr-btn-green { background: #16a34a; color: white; }
.tr-btn-green:hover:not(:disabled) { background: #15803d; }
.tr-btn-primary:disabled, .tr-btn-green:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Pagination ── */
.tr-pagination-row {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  font-size: 0.62rem; color: rgba(255,255,255,0.5); padding: 2px 0; flex-shrink: 0;
}
.tr-showing { font-size: 0.62rem; }
.tr-page-btns { display: flex; align-items: center; gap: 4px; }
.tr-pg-btn {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: white;
  border-radius: 3px; padding: 1px 6px; font-size: 0.7rem; cursor: pointer; font-family: inherit;
}
.tr-pg-btn:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
.tr-pg-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tr-pg-info { font-size: 0.62rem; color: rgba(255,255,255,0.6); }

/* ── Cards grid ── */
.tr-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: var(--shortcard-height, 176px);
  gap: 6px;
  flex-shrink: 0;
}
.tr-card-wrap {
  min-height: 0;
}

/* ── Confirm ── */
.tr-confirm-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex-shrink: 0;
}
.tr-confirm-col { background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; }
.tr-confirm-label { font-size: 0.68rem; font-weight: bold; color: rgba(255,255,255,0.8); margin-bottom: 6px; }
.tr-confirm-points { font-size: 0.65rem; color: var(--OrbitGreen); margin-bottom: 4px; }
.tr-confirm-empty { margin-top: 4px; }
.tr-confirm-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }
.tr-confirm-card {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: rgba(255,255,255,0.08); border-radius: 4px; padding: 6px 4px; overflow: hidden;
}
.tr-confirm-img { width: 100%; max-height: 64px; object-fit: contain; }
.tr-confirm-name { font-size: 0.6rem; color: white; text-align: center; line-height: 1.2; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-confirm-rarity { font-size: 0.55rem; color: rgba(255,255,255,0.45); }

/* ── Misc ── */
.tr-loading { font-size: 0.72rem; color: rgba(255,255,255,0.5); padding: 16px 8px; text-align: center; flex-shrink: 0; }
.tr-empty { font-size: 0.7rem; color: rgba(255,255,255,0.4); font-style: italic; padding: 16px 8px; text-align: center; flex-shrink: 0; }

/* ── Page toast ── */
.tr-page-toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  z-index: 2000; padding: 8px 18px; border-radius: 6px; font-size: 0.8rem; font-weight: bold;
  font-family: 'Nunito', sans-serif;
}
.tr-page-toast.success { background: #15803d; color: white; }
.tr-page-toast.error { background: #b91c1c; color: white; }

/* ══════════════════════════════════════════════
   TRADE MODAL
   ══════════════════════════════════════════════ */
.tm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.78);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.tm-panel {
  background: #003466; border: 2px solid var(--OrbitLightBlue);
  border-radius: 8px; width: 700px; max-width: 94vw; max-height: 86vh;
  display: flex; flex-direction: column; position: relative; overflow: hidden;
  font-family: 'Nunito', sans-serif;
}

/* Modal header */
.tm-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 10px 14px 8px; background: var(--OrbitDarkBlue);
  border-bottom: 1px solid rgba(255,255,255,0.12); flex-shrink: 0;
}
.tm-head-info { display: flex; flex-direction: column; gap: 3px; }
.tm-head-title { font-size: 0.82rem; font-weight: bold; color: white; }
.tm-head-meta { display: flex; align-items: center; gap: 8px; font-size: 0.65rem; color: rgba(255,255,255,0.6); flex-wrap: wrap; }
.tm-link { color: var(--OrbitLightBlue); text-decoration: none; }
.tm-link:hover { text-decoration: underline; }
.tm-close {
  background: none; border: none; color: rgba(255,255,255,0.5); font-size: 1rem;
  cursor: pointer; padding: 0 0 0 12px; flex-shrink: 0; line-height: 1;
}
.tm-close:hover { color: white; }

/* Modal body */
.tm-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 10px 14px;
  scrollbar-width: thin; scrollbar-color: var(--OrbitDarkBlue) transparent;
}
.tm-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tm-col { display: flex; flex-direction: column; gap: 6px; }
.tm-col-title { font-size: 0.68rem; font-weight: bold; color: rgba(255,255,255,0.75); text-transform: uppercase; letter-spacing: 0.05em; }
.tm-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tm-empty-col { font-size: 0.65rem; color: rgba(255,255,255,0.35); font-style: italic; }
.tm-card {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px; padding: 8px 6px; position: relative; overflow: hidden;
}
.tm-own-badge {
  position: absolute; top: 4px; right: 4px;
  font-size: 0.52rem; font-weight: bold; padding: 1px 4px; border-radius: 9999px;
}
.tm-own-badge.owned { background: rgba(74,222,128,0.2); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.tm-own-badge.unowned { background: rgba(156,163,175,0.15); color: #9ca3af; border: 1px solid rgba(156,163,175,0.2); }
.tm-card-img { width: 80px; height: 80px; object-fit: contain; margin-top: 14px; }
.tm-card-name { font-size: 0.65rem; color: white; font-weight: bold; text-align: center; line-height: 1.2; }
.tm-dim { font-size: 0.6rem; color: rgba(255,255,255,0.45); text-align: center; }
.tm-own-stats {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  font-size: 0.58rem; color: rgba(255,255,255,0.55); margin-top: 3px; text-align: center;
  padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); width: 100%;
}

/* Modal footer */
.tm-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 6px;
  padding: 8px 14px; background: var(--OrbitDarkBlue);
  border-top: 1px solid rgba(255,255,255,0.12); flex-shrink: 0;
}
.tm-btn {
  padding: 5px 12px; border-radius: 4px; border: none; font-size: 0.7rem; font-weight: bold;
  cursor: pointer; font-family: inherit; transition: opacity 0.12s;
}
.tm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tm-btn-accept { background: #16a34a; color: white; }
.tm-btn-accept:hover:not(:disabled) { background: #15803d; }
.tm-btn-reject { background: #b91c1c; color: white; }
.tm-btn-reject:hover:not(:disabled) { background: #991b1b; }
.tm-btn-close { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.2); }
.tm-btn-close:hover { background: rgba(255,255,255,0.2); color: white; }

/* Modal toast */
.tm-toast {
  position: absolute; bottom: 56px; left: 50%; transform: translateX(-50%);
  padding: 6px 14px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; z-index: 10;
}
.tm-toast.success { background: #15803d; color: white; }
.tm-toast.error { background: #b91c1c; color: white; }
</style>
