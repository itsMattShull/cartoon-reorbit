<template>
  <div class="cmp-wrap" :style="paletteStyle">
    <div v-if="loading" class="cmp-status">Loading…</div>
    <div v-else-if="error" class="cmp-status cmp-status--error">{{ error }}</div>
    <template v-else-if="cmoon">
      <div class="cmp-masthead-wrap">
        <img
          v-if="cmoon.pageBannerImagePath"
          :src="cmoon.pageBannerImagePath"
          :alt="`${cmoon.name} cMoon`"
          class="cmp-masthead-img"
          loading="eager"
          fetchpriority="high"
        />
        <div v-else class="cmp-banner">
          <h1 class="cmp-title">{{ cmoon.name }}</h1>
          <p class="cmp-member-count">{{ cmoon.memberCount.toLocaleString() }} member{{ cmoon.memberCount === 1 ? '' : 's' }}</p>
        </div>
      </div>

      <div class="cmp-body">
        <div class="cmp-stats">
          <div class="cmp-stat">
            <span class="cmp-stat-label">Team Rank</span>
            <span class="cmp-stat-value">#{{ cmoon.rank }}</span>
          </div>
          <div class="cmp-stat">
            <span class="cmp-stat-label">Team Score</span>
            <span class="cmp-stat-value">{{ cmoon.teamScore.toLocaleString() }}</span>
          </div>
        </div>

        <div v-if="affinity && affinity.isMember" class="cmp-affinity" :class="{ 'cmp-affinity--pulse': justLeveledUp }">
          <div class="cmp-affinity-head">
            <span class="cmp-affinity-label">Your Affinity</span>
            <span class="cmp-affinity-level">{{ currentLevelName }}</span>
          </div>
          <div class="cmp-affinity-bar-track">
            <div class="cmp-affinity-bar-fill" :style="{ width: affinityProgressPct + '%' }"></div>
          </div>
          <p class="cmp-affinity-next">
            <span v-if="affinity.nextLevel">
              {{ affinity.affinitySpent.toLocaleString() }} / {{ affinity.nextLevel.threshold.toLocaleString() }} pts to {{ affinity.nextLevel.name }}
            </span>
            <span v-else-if="affinity.levels.length">Max level reached — {{ affinity.affinitySpent.toLocaleString() }} pts contributed</span>
            <span v-else>{{ affinity.affinitySpent.toLocaleString() }} pts contributed</span>
          </p>

          <button
            v-if="!contributeOpen"
            type="button"
            class="cmp-affinity-toggle"
            @click="contributeOpen = true"
          >Contribute to {{ cmoon.name }}</button>

          <div v-else class="cmp-affinity-form">
            <input
              v-model.number="contributeAmount"
              type="number"
              inputmode="numeric"
              min="1"
              :max="affinityRemainingToMax ?? undefined"
              step="1"
              class="cmp-affinity-input"
              style="font-size:16px"
              placeholder="Points"
              :disabled="contributing || affinityRemainingToMax === 0"
            />
            <button type="button" class="cmp-affinity-submit" :disabled="contributing || !contributeAmount || affinityRemainingToMax === 0" @click="submitContribute">
              {{ contributing ? 'Contributing…' : 'Contribute' }}
            </button>
            <button type="button" class="cmp-affinity-cancel" :disabled="contributing" @click="contributeOpen = false">Cancel</button>
          </div>
          <p v-if="affinityRemainingToMax === 0" class="cmp-affinity-error">You've already reached the highest affinity rank for this cMoon.</p>
          <p v-else-if="contributeError" class="cmp-affinity-error">{{ contributeError }}</p>
        </div>

        <!-- Hard-stop warning, not a confirm-and-proceed prompt: the amount is rejected outright
             (see submitContribute/server contribute.post.js), this dialog only explains why. -->
        <div v-if="showMaxRankWarning" class="cmp-modal-overlay" @click="showMaxRankWarning = false">
          <div class="cmp-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="cmp-max-rank-title" @click.stop>
            <p id="cmp-max-rank-title" class="cmp-modal-title">You are attempting to contribute a higher amount than any affinity Ranks available</p>
            <p v-if="affinityRemainingToMax" class="cmp-modal-body">
              You can contribute up to {{ affinityRemainingToMax.toLocaleString() }} more point{{ affinityRemainingToMax === 1 ? '' : 's' }} toward this cMoon's highest rank.
            </p>
            <button type="button" class="cmp-modal-ok" @click="showMaxRankWarning = false">OK</button>
          </div>
        </div>

        <!-- Rank Ladder progress: only shown to a member of THIS cMoon, since rank is per-cMoon
             even though the ladder itself (name/threshold/rewards) is universal — see
             prisma/schema.prisma's CMoonRankTier. Independent of the affinity widget above:
             ranks are earned automatically from cMoonPoints, not spent like affinity. -->
        <div v-if="rankProgress && rankProgress.isMember" class="cmp-rank">
          <div class="cmp-rank-head">
            <span class="cmp-affinity-label">Your Rank</span>
            <span class="cmp-affinity-level">{{ rankProgress.currentRank ? rankProgress.currentRank.name : 'Unranked' }}</span>
          </div>
          <div class="cmp-affinity-bar-track">
            <div class="cmp-affinity-bar-fill" :style="{ width: rankProgressPct + '%' }"></div>
          </div>
          <p class="cmp-affinity-next">
            <span v-if="rankProgress.nextTier">
              {{ rankProgress.cMoonPoints.toLocaleString() }} / {{ rankProgress.nextTier.pointThreshold.toLocaleString() }} pts to {{ rankProgress.nextTier.name }}
            </span>
            <span v-else-if="rankProgress.tiers.length">Max rank reached — {{ rankProgress.cMoonPoints.toLocaleString() }} pts</span>
            <span v-else>{{ rankProgress.cMoonPoints.toLocaleString() }} pts contributed</span>
          </p>
        </div>

        <!-- Featured cToons comes first in the markup (the page's visual centerpiece) so a
             narrow/stacked layout shows it before the leaderboard panel; a wide container
             reorders them side by side via the container query below. -->
        <div class="cmp-middle-row">
          <section class="cmp-panel cmp-featured-panel">
            <h2 class="cmp-section-title">Featured cToons</h2>
            <div v-if="!cmoon.featuredCtoons.length" class="cmp-empty">No cToons are featured under this cMoon yet.</div>
            <div v-else class="cmp-featured-grid">
              <button
                v-for="c in cmoon.featuredCtoons"
                :key="c.id"
                type="button"
                class="cmp-card"
                @click="openInfo(c)"
              >
                <img :src="c.assetPath" :alt="c.name" class="cmp-card-img" loading="lazy" />
                <span class="cmp-card-name">{{ c.name }}</span>
              </button>
            </div>
          </section>

          <section class="cmp-panel cmp-leaderboard-panel">
            <h2 class="cmp-section-title">cMoon Leaderboard</h2>
            <select v-model="leaderboardView" class="cmp-leaderboard-select">
              <option value="points">Top Weekly Contributors</option>
              <option value="rank">Top Ranking Members</option>
            </select>
            <div v-if="!leaderboardRows.length" class="cmp-empty">
              {{ leaderboardView === 'points' ? 'No contributions yet.' : 'No ranked members yet.' }}
            </div>
            <div v-else class="cmp-members">
              <NuxtLink
                v-for="m in leaderboardRows" :key="m.username"
                :to="`/newsite/czone/${m.username}`"
                class="cmp-member"
              >
                <img :src="`/avatars/${m.avatar || 'default.png'}`" class="cmp-member-avatar" alt="" />
                <span class="cmp-member-name">{{ m.username }}</span>
                <span class="cmp-member-points">{{ leaderboardView === 'points' ? `${m.points.toLocaleString()} pts` : m.rankName }}</span>
              </NuxtLink>
            </div>
          </section>
        </div>

        <template v-if="cmoon.captains.length">
          <h2 class="cmp-section-title">Captains</h2>
          <div class="cmp-captains">
            <NuxtLink
              v-for="name in cmoon.captains" :key="name"
              :to="`/newsite/czone/${name}`"
              class="cmp-captain-link"
            >{{ name }}</NuxtLink>
          </div>
        </template>

        <!-- Bottom row: description on the left, poll + button-pills stacked on the right. -->
        <div class="cmp-bottom-row">
          <section class="cmp-panel cmp-description-panel">
            <h2 v-if="cmoon.pageDescription" class="cmp-section-title">About</h2>
            <p v-if="cmoon.pageDescription" class="cmp-description">{{ cmoon.pageDescription }}</p>
            <p v-else class="cmp-empty">No description yet.</p>
          </section>

          <section class="cmp-panel cmp-poll-buttons-panel">
            <template v-if="cmoon.poll">
              <h2 class="cmp-section-title">{{ cmoon.poll.question }}</h2>
              <div v-if="cmoon.poll.myVote" class="cmp-poll-results">
                <div v-for="opt in cmoon.poll.options" :key="opt.id" class="cmp-poll-result-row">
                  <span class="cmp-poll-result-label">
                    {{ opt.label }}
                    <span v-if="opt.id === cmoon.poll.myVote" aria-hidden="true">✓</span>
                  </span>
                  <div class="cmp-poll-result-bar-track">
                    <div class="cmp-poll-result-bar-fill" :style="{ width: pollResultPercent(opt.id) + '%' }"></div>
                  </div>
                  <span class="cmp-poll-result-pct">{{ pollResultPercent(opt.id) }}%</span>
                </div>
              </div>
              <template v-else>
                <div class="cmp-poll-options" role="radiogroup">
                  <button
                    v-for="opt in cmoon.poll.options" :key="opt.id"
                    type="button"
                    class="cmp-poll-option"
                    :class="{ 'cmp-poll-option--selected': pollChoice === opt.id }"
                    role="radio"
                    :aria-checked="pollChoice === opt.id"
                    @click="pollChoice = opt.id"
                  >{{ opt.label }}</button>
                </div>
                <button
                  type="button"
                  class="cmp-poll-vote-btn"
                  :disabled="!pollChoice || pollSubmitting"
                  @click="voteOnPoll"
                >{{ pollSubmitting ? 'Voting…' : 'Vote' }}</button>
                <p v-if="pollError" class="cmp-offer-error">{{ pollError }}</p>
              </template>
            </template>
            <p v-else class="cmp-empty">No poll right now.</p>

            <div v-if="buttonPills.length" class="cmp-button-pills">
              <NuxtLink
                v-for="b in buttonPills" :key="b.id"
                :to="`/newsite/cmoon/${b.id}`"
                class="cmp-button-pill-link"
              >
                <img :src="b.buttonImagePath" :alt="`${b.name} cMoon`" class="cmp-button-pill-img" loading="lazy" />
              </NuxtLink>
            </div>
          </section>
        </div>

        <template v-if="offers.length">
          <h2 class="cmp-section-title">cToon Offers</h2>
          <div v-for="o in offers" :key="o.id" class="cmp-offer">
            <p class="cmp-offer-meta">
              <span v-if="o.myClaim">You claimed this offer.</span>
              <span v-else-if="o.status !== 'OPEN'">This offer has closed.</span>
              <span v-else-if="!eligible">Join this cMoon to claim a reward here.</span>
              <span v-else>Pick one — you'll get {{ o.quantityPerMember }} cop{{ o.quantityPerMember === 1 ? 'y' : 'ies' }}.</span>
            </p>
            <div class="cmp-grid">
              <button
                v-for="opt in o.options" :key="opt.id"
                type="button"
                class="cmp-card cmp-offer-option"
                :class="{
                  'cmp-offer-option--picked': o.myClaim && o.myClaim.optionId === opt.id,
                  'cmp-offer-option--selected': !o.myClaim && offerSelections[o.id] === opt.id,
                }"
                :disabled="!!o.myClaim || o.status !== 'OPEN' || !eligible || offerClaiming[o.id]"
                @click="offerSelections[o.id] = opt.id"
              >
                <img :src="opt.assetPath" :alt="opt.name" class="cmp-card-img" loading="lazy" />
                <span class="cmp-card-name">{{ opt.name }}</span>
                <span v-if="o.myClaim && o.myClaim.optionId === opt.id" class="cmp-offer-picked-badge">Your pick</span>
              </button>
            </div>
            <button
              v-if="!o.myClaim && o.status === 'OPEN' && eligible"
              type="button"
              class="cmp-offer-claim-btn"
              :disabled="!offerSelections[o.id] || offerClaiming[o.id]"
              @click="claimOffer(o)"
            >{{ offerClaiming[o.id] ? 'Claiming…' : 'Claim' }}</button>
            <p v-if="offerErrors[o.id]" class="cmp-offer-error">{{ offerErrors[o.id] }}</p>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { cMoonPaletteStyle } from '@/utils/cmoonPalette'
import { useCtoonModal } from '@/composables/useCtoonModal'
import { useCMoonRewardModal } from '@/composables/useCMoonRewardModal'

const route = useRoute()
const { open: openCtoonModal } = useCtoonModal()
const { open: openRewardModal } = useCMoonRewardModal()
const { fetchSelf } = useAuth()

const loading = ref(true)
const error = ref('')
const cmoon = ref(null)
const buttonPills = ref([])
const affinity = ref(null)
const rankProgress = ref(null)

const contributeOpen = ref(false)
const contributeAmount = ref(null)
const contributing = ref(false)
const contributeError = ref('')
const justLeveledUp = ref(false)
let pulseTimer = null

const offers = ref([])
const eligible = ref(false)
const offerSelections = reactive({})
const offerClaiming = reactive({})
const offerErrors = reactive({})

const leaderboardView = ref('points')
const leaderboardRows = computed(() => {
  if (!cmoon.value) return []
  return leaderboardView.value === 'points' ? cmoon.value.topPointContributors : cmoon.value.topRankMembers
})

const pollChoice = ref(null)
const pollSubmitting = ref(false)
const pollError = ref('')

function pollResultPercent(optionId) {
  const results = cmoon.value?.poll?.results
  if (!results) return 0
  const total = results.reduce((sum, r) => sum + r.count, 0)
  if (!total) return 0
  const row = results.find(r => r.optionId === optionId)
  return Math.round(((row?.count || 0) / total) * 100)
}

async function voteOnPoll() {
  if (!pollChoice.value || pollSubmitting.value || !cmoon.value) return
  pollSubmitting.value = true
  pollError.value = ''
  try {
    await $fetch(`/api/cmoon/${encodeURIComponent(cmoon.value.id)}/poll-vote`, {
      method: 'POST',
      body: { optionId: pollChoice.value },
    })
    // Refreshes the whole page payload rather than hand-patching poll state locally — the vote
    // tally (getPollResults) is cached server-side, so this stays cheap.
    await load(cmoon.value.id)
  } catch (err) {
    pollError.value = err?.data?.statusMessage || 'Failed to submit your vote'
  } finally {
    pollSubmitting.value = false
  }
}

const paletteStyle = computed(() => cmoon.value ? cMoonPaletteStyle(cmoon.value.color) : {})

const currentLevelName = computed(() => {
  if (!affinity.value) return ''
  const lvl = affinity.value.levels.find(l => l.id === affinity.value.currentLevelId)
  return lvl ? lvl.name : 'Unranked'
})

const affinityProgressPct = computed(() => {
  if (!affinity.value) return 0
  const spent = affinity.value.affinitySpent
  const next = affinity.value.nextLevel
  if (!next) return 100
  const currentLevel = affinity.value.levels.find(l => l.id === affinity.value.currentLevelId)
  const floor = currentLevel ? currentLevel.threshold : 0
  const span = next.threshold - floor
  if (span <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((spent - floor) / span) * 100)))
})

// The highest configured level's threshold is the ceiling on contributions: points spent past it
// earn no further reward, so a contribution that would cross it is rejected rather than silently
// accepted. `Math.max` over threshold rather than trusting array order — `levels` here is sorted
// by `sortOrder` (its display order), not `threshold`, and the two aren't guaranteed to match.
// Null (not 0) when this cMoon has no levels configured yet, so "no ceiling" and "ceiling of 0"
// stay distinguishable.
const maxAffinityThreshold = computed(() => {
  const levels = affinity.value?.levels
  if (!levels?.length) return null
  return Math.max(...levels.map(l => l.threshold))
})

const affinityRemainingToMax = computed(() => {
  if (maxAffinityThreshold.value == null) return null
  return Math.max(0, maxAffinityThreshold.value - (affinity.value?.affinitySpent || 0))
})

const showMaxRankWarning = ref(false)

useHead({
  title: computed(() => cmoon.value ? `${cmoon.value.name} · cMoon` : 'cMoon')
})

function openInfo(c) {
  openCtoonModal({ ctoonId: c.id, assetPath: c.assetPath, name: c.name })
}

async function loadAffinity(id) {
  try {
    affinity.value = await $fetch(`/api/cmoon/${encodeURIComponent(id)}/affinity`)
  } catch {
    affinity.value = null
  }
}

async function loadRankProgress(id) {
  try {
    rankProgress.value = await $fetch(`/api/cmoon/${encodeURIComponent(id)}/rank-progress`)
  } catch {
    rankProgress.value = null
  }
}

const rankProgressPct = computed(() => {
  const rp = rankProgress.value
  if (!rp || !rp.nextTier) return 100
  // Match the current rank to its tier by sortOrder, not id — CMoonRank.id (per-cMoon) and
  // CMoonRankTier.id (global) are different rows entirely; a tier-linked rank's sortOrder is
  // always kept in sync with its tier's (see server/utils/cmoonRankTiers.js), and is unique per
  // cMoon, so this reliably finds "the floor" for a tier-managed rank. A legacy custom rank
  // (not tier-linked) simply won't match anything here — falls back to a floor of 0, which is
  // an acceptable approximation for that now-secondary path.
  const floor = rp.currentRank ? (rp.tiers.find(t => t.sortOrder === rp.currentRank.sortOrder)?.pointThreshold ?? 0) : 0
  const span = rp.nextTier.pointThreshold - floor
  if (span <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((rp.cMoonPoints - floor) / span) * 100)))
})

async function loadOffers(id) {
  try {
    const res = await $fetch(`/api/cmoon/${encodeURIComponent(id)}/dispersal-offers`)
    offers.value = res.offers || []
    eligible.value = !!res.eligible
  } catch {
    offers.value = []
    eligible.value = false
  }
}

async function loadButtonPills(id) {
  try {
    const res = await $fetch('/api/cmoons', { params: { view: 'buttons', excludeId: id } })
    buttonPills.value = res?.cmoons || []
  } catch {
    buttonPills.value = []
  }
}

async function claimOffer(offer) {
  const optionId = offerSelections[offer.id]
  if (!optionId || offerClaiming[offer.id]) return
  const opt = offer.options.find(o => o.id === optionId)
  if (!confirm(`Claim ${opt?.name || 'this cToon'}? This can't be changed once claimed.`)) return
  offerClaiming[offer.id] = true
  offerErrors[offer.id] = ''
  try {
    const res = await $fetch(`/api/cmoon/${encodeURIComponent(cmoon.value.id)}/dispersal-offers/${offer.id}/claim`, {
      method: 'POST',
      body: { optionId },
    })
    offer.myClaim = { optionId: res.optionId, quantity: res.quantity }
    openRewardModal({
      kind: 'offer',
      eyebrow: 'cToon Offer Claimed!',
      title: 'Nice pick!',
      items: [{ id: res.optionId, imagePath: opt?.assetPath || null, label: opt?.name || 'cToon', qty: res.quantity, variant: 'ctoon' }],
    })
  } catch (err) {
    offerErrors[offer.id] = err?.data?.statusMessage || 'Failed to claim'
  } finally {
    offerClaiming[offer.id] = false
  }
}

async function load(id) {
  if (!id) return
  loading.value = true
  error.value = ''
  pollChoice.value = null
  pollError.value = ''
  contributeOpen.value = false
  try {
    cmoon.value = await $fetch(`/api/cmoon/${encodeURIComponent(id)}`)
    await Promise.all([loadOffers(id), loadButtonPills(id), loadAffinity(id), loadRankProgress(id)])
  } catch (err) {
    cmoon.value = null
    error.value = err?.data?.statusMessage || 'Failed to load this cMoon.'
  } finally {
    loading.value = false
  }
}

async function submitContribute() {
  const amount = Math.trunc(Number(contributeAmount.value))
  if (!Number.isInteger(amount) || amount <= 0) {
    contributeError.value = 'Enter a whole number of points.'
    return
  }
  // Hard cap, checked client-side for immediate feedback — the server enforces the same ceiling
  // independently (see server/api/cmoon/[id]/contribute.post.js), so this is a UX shortcut, not
  // the actual guard.
  if (maxAffinityThreshold.value != null && (affinity.value?.affinitySpent || 0) + amount > maxAffinityThreshold.value) {
    showMaxRankWarning.value = true
    return
  }
  contributeError.value = ''
  contributing.value = true
  try {
    const res = await $fetch(`/api/cmoon/${encodeURIComponent(cmoon.value.id)}/contribute`, {
      method: 'POST',
      body: { amount },
    })
    contributeAmount.value = null
    contributeOpen.value = false
    await Promise.all([loadAffinity(cmoon.value.id), fetchSelf({ force: true })])
    if (res?.leveledUpTo) {
      const level = res.leveledUpTo
      const rewards = level.rewards || {}
      const items = [
        ...(rewards.avatars || []).map(av => ({ id: `av-${av.id}`, imagePath: av.imagePath, label: av.label || 'Avatar', variant: 'avatar' })),
        ...(rewards.backgrounds || []).map(bg => ({ id: `bg-${bg.id}`, imagePath: bg.imagePath, label: bg.label || 'Background', variant: 'background' })),
      ]
      if (rewards.border) items.push({ id: 'border', imagePath: null, label: 'cZone Border', variant: 'swatch', icon: '🔲' })
      if (rewards.glow) items.push({ id: 'glow', imagePath: null, label: 'cZone Glow', variant: 'swatch', icon: '✨' })
      openRewardModal({
        kind: 'affinity',
        eyebrow: `${cmoon.value.name} Affinity — Rank Up!`,
        title: level.name,
        subtitle: level.levelNames?.length > 1
          ? `You jumped ${level.levelNames.length} ranks in one contribution: ${level.levelNames.join(' → ')}`
          : '',
        items,
        emptyText: 'This rank is a milestone — no cosmetic reward attached.',
      })
      justLeveledUp.value = true
      clearTimeout(pulseTimer)
      pulseTimer = setTimeout(() => { justLeveledUp.value = false }, 1600)
    }
  } catch (err) {
    contributeError.value = err?.data?.statusMessage || 'Could not contribute right now.'
  } finally {
    contributing.value = false
  }
}

watch(() => route.params.id, (id) => load(id), { immediate: true })
</script>

<style scoped>
.cmp-wrap {
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
}

.cmp-status {
  padding: 24px 16px;
  color: #ffffff;
  font-size: 0.95rem;
}
.cmp-status--error { color: #fca5a5; }

.cmp-masthead-wrap {
  width: 100%;
}

/* Locked to the upload's real stored aspect ratio (the backend always normalizes to exactly
   1200x100 — see page-banner-image.post.js) rather than a fixed height: with the box's aspect
   ratio matching the image's exactly, object-fit has nothing to crop, so the full banner is
   always visible edge to edge. On a narrow phone this does mean a shorter strip in absolute
   pixels, but a cropped side is worse than a shorter (fully visible) banner. */
.cmp-masthead-img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1200 / 100;
  object-fit: cover;
}

.cmp-banner {
  background: var(--cm-banner, var(--OrbitDarkBlue));
  color: var(--cm-banner-text, #ffffff);
  padding: 18px 16px;
}

.cmp-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.cmp-member-count {
  margin: 4px 0 0;
  font-size: 0.8rem;
  opacity: 0.85;
}

/* Container query, not a viewport media query: `.site-container` in layouts/newsite-template.vue
   applies transform:scale() on desktop, which desyncs real viewport width from this element's
   actual rendered width — the same reason CMoonSelectModal.vue/CMoonNav.vue use auto-fit grids
   instead of breakpoints, and AuctionHouse.vue already uses container queries for exactly this. */
.cmp-body {
  container-type: inline-size;
  container-name: cmp-pane;
  padding: 16px;
  background: var(--cm-bg, transparent);
  color: var(--cm-text, #ffffff);
  box-sizing: border-box;
}

.cmp-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}
.cmp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cmp-stat-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}
.cmp-stat-value {
  font-size: 1.3rem;
  font-weight: 800;
}

.cmp-panel {
  min-width: 0;
}

.cmp-affinity,
.cmp-rank {
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.cmp-rank-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.cmp-affinity-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.cmp-affinity-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-affinity-level {
  font-size: 0.95rem;
  font-weight: 800;
}

.cmp-affinity-bar-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--cm-hairline, rgba(255,255,255,0.14));
  overflow: hidden;
}

.cmp-affinity-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  transition: width 0.4s ease;
}

.cmp-affinity-next {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-affinity-toggle {
  margin-top: 10px;
  min-height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  color: var(--cm-banner-text, #ffffff);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  width: 100%;
}
.cmp-affinity-toggle:hover { opacity: 0.9; }

.cmp-affinity-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.cmp-affinity-input {
  flex: 1 1 100px;
  min-width: 0;
  min-height: 44px;
  border-radius: 6px;
  border: 1px solid var(--cm-border, rgba(255,255,255,0.3));
  background: var(--cm-bg, transparent);
  color: var(--cm-text, #ffffff);
  padding: 0 10px;
  box-sizing: border-box;
}

.cmp-affinity-submit,
.cmp-affinity-cancel {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 6px;
  border: none;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.cmp-affinity-submit {
  background: var(--cm-success, #16a34a);
  color: #ffffff;
}
.cmp-affinity-submit:disabled { opacity: 0.5; cursor: default; }

.cmp-affinity-cancel {
  background: transparent;
  color: var(--cm-text, #ffffff);
  border: 1px solid var(--cm-border, rgba(255,255,255,0.3));
}

.cmp-affinity-error {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: var(--cm-danger, #fca5a5);
}

.cmp-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cmp-modal-card {
  width: 100%;
  max-width: 360px;
  background: var(--cm-bg, #1a1a2e);
  color: var(--cm-text, #ffffff);
  border: 1px solid var(--cm-border, rgba(255,255,255,0.3));
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.cmp-modal-title {
  margin: 0 0 8px;
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--cm-danger, #fca5a5);
}

.cmp-modal-body {
  margin: 0 0 14px;
  font-size: 0.82rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.7));
}

.cmp-modal-ok {
  min-height: 44px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  color: var(--cm-banner-text, #ffffff);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

/* A brief, non-animated highlight rather than a filter/box-shadow loop — cheap and respects
   prefers-reduced-motion for free since it's just a background-color transition. */
.cmp-affinity--pulse .cmp-affinity-bar-fill {
  background: #ffd700;
}

@media (prefers-reduced-motion: reduce) {
  .cmp-affinity-bar-fill { transition: none; }
}

/* The Featured cToons panel is deliberately NOT themed off the cMoon's color like the rest of the
   page (.cmp-body's --cm-bg) — it's the site's fixed classic blue, matching the reference layout
   where the center "Featured cToons" panel stays blue regardless of which world's colors surround
   it. Cards get their own fixed light tile + dark text here too, rather than the cMoon-derived
   --cm-tile-bg/--cm-text, since those are only contrast-tuned against --cm-bg and could clash
   against a fixed blue an admin's chosen color was never checked against. */
.cmp-featured-panel {
  background: var(--OrbitDarkBlue, #336699);
  color: #ffffff;
  border-radius: 10px;
  padding: 14px;
}
.cmp-featured-panel .cmp-empty {
  color: rgba(255, 255, 255, 0.75);
}
.cmp-featured-panel .cmp-card {
  background: rgba(255, 255, 255, 0.94);
  color: #1a2b3d;
}

.cmp-middle-row,
.cmp-bottom-row {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 20px;
}

/* Side-by-side once the pane is wide enough to fit both comfortably — leaderboard first (left),
   featured cToons second (right), even though featured cToons comes first in the DOM (so a
   stacked/narrow layout shows the centerpiece grid before the leaderboard). */
@container cmp-pane (min-width: 640px) {
  .cmp-middle-row { flex-direction: row; align-items: flex-start; }
  .cmp-featured-panel { order: 2; flex: 1 1 auto; }
  .cmp-leaderboard-panel { order: 1; flex: 0 0 240px; }
  .cmp-bottom-row { flex-direction: row; align-items: flex-start; }
  .cmp-description-panel { flex: 1 1 auto; }
  .cmp-poll-buttons-panel { flex: 0 0 260px; }
}

.cmp-description {
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0;
}

.cmp-section-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 10px;
}

.cmp-empty {
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
  font-size: 0.9rem;
}

.cmp-grid {
  display: grid;
  /* auto-fit off the container's own rendered width (see the .cmp-body comment above) — settles
     into ~6 columns for a 12-item grid on a wide pane, fewer on a narrow one, with no viewport
     breakpoint to keep in sync. */
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 8px;
}

/* Featured cToons only: fixed-size (not 1fr-stretched) tracks with justify-content:center, so the
   grid reads as a flush, centered block — like the reference layout's 2-row-of-6 — instead of
   stretching cards edge-to-edge and instead of an off-center last row. auto-fill (not auto-fit)
   keeps the track count stable as items are added/removed; centering handles any leftover slots
   in the final row itself, so 12 cards on a wide pane settle into two centered rows of 6. */
.cmp-featured-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 100px));
  justify-content: center;
  gap: 10px;
}

.cmp-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  border: none;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  color: var(--cm-text, #ffffff);
  font-family: inherit;
  /* Real touch target on top of whatever internal padding the image adds. */
  min-height: 44px;
  box-sizing: border-box;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-card:hover { opacity: 0.85; }
}
.cmp-card:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-card-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.cmp-card-name {
  font-size: 0.75rem;
  text-align: center;
  overflow-wrap: anywhere;
}

.cmp-leaderboard-select {
  width: 100%;
  min-height: 44px;
  margin-bottom: 10px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--cm-tile-bg, rgba(255,255,255,0.2));
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  color: var(--cm-text, #ffffff);
  font-size: 0.9rem;
}

.cmp-offer {
  margin-bottom: 24px;
}

.cmp-offer-meta {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-offer-option {
  border: 2px solid transparent;
  position: relative;
}
.cmp-offer-option:disabled {
  cursor: default;
  opacity: 0.55;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-offer-option:disabled:hover { opacity: 0.55; }
}

.cmp-offer-option--selected {
  border-color: var(--cm-focus-ring, var(--OrbitLightBlue));
  opacity: 1;
}

.cmp-offer-option--picked {
  border-color: #22c55e;
  opacity: 1 !important;
}

.cmp-offer-picked-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: #22c55e;
}

.cmp-offer-claim-btn {
  margin-top: 10px;
  min-height: 44px;
  padding: 0 20px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  color: var(--cm-banner-text, #ffffff);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.cmp-offer-claim-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-offer-claim-btn:not(:disabled):hover { opacity: 0.9; }
}

.cmp-offer-error {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: #fca5a5;
}

.cmp-captains {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 20px;
}

.cmp-captain-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  color: var(--cm-link-text, #ffffff);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 600;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-captain-link:hover { opacity: 0.85; }
}
.cmp-captain-link:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.cmp-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--cm-link-text, #ffffff);
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-member:hover { background: var(--cm-tile-bg, rgba(255,255,255,0.08)); }
}
.cmp-member:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-member-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
}

.cmp-member-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  font-weight: 600;
}

.cmp-member-points {
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 700;
}

.cmp-poll-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.cmp-poll-option {
  min-height: 44px;
  padding: 0 14px;
  border: 2px solid var(--cm-tile-bg, rgba(255,255,255,0.15));
  border-radius: 6px;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  color: var(--cm-text, #ffffff);
  text-align: left;
  font-size: 0.9rem;
  cursor: pointer;
}
.cmp-poll-option--selected {
  border-color: var(--cm-focus-ring, var(--OrbitLightBlue));
}
.cmp-poll-option:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-poll-vote-btn {
  width: 100%;
  min-height: 44px;
  border: none;
  border-radius: 6px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  color: var(--cm-banner-text, #ffffff);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.cmp-poll-vote-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.cmp-poll-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.cmp-poll-result-row {
  display: grid;
  grid-template-columns: 1fr 34px;
  gap: 2px 8px;
  align-items: center;
}

.cmp-poll-result-label {
  font-size: 0.85rem;
  grid-column: 1 / -1;
}

.cmp-poll-result-bar-track {
  height: 8px;
  border-radius: 999px;
  background: var(--cm-tile-bg, rgba(255,255,255,0.12));
  overflow: hidden;
}

.cmp-poll-result-bar-fill {
  height: 100%;
  background: var(--cm-focus-ring, var(--OrbitLightBlue));
}

.cmp-poll-result-pct {
  font-size: 0.75rem;
  text-align: right;
  opacity: 0.85;
}

.cmp-button-pills {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.cmp-button-pill-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  -webkit-tap-highlight-color: transparent;
}
.cmp-button-pill-link:focus-visible {
  outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue));
  outline-offset: 2px;
}

.cmp-button-pill-img {
  display: block;
  width: auto;
  max-width: 100%;
  height: 44px;
  aspect-ratio: 232 / 62;
  object-fit: contain;
}

@media (max-width: 480px) {
  .cmp-stats { gap: 16px; }
}
</style>
