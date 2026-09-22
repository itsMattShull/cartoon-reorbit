<template>
  <!-- Teleported to body for the same reason as CMoonSelectModal/CtoonInfoCard/CMoonRewardModal:
       .site-container carries a `transform: scale()` on desktop, which traps position:fixed
       descendants inside its own clipped box unless they're teleported out. -->
  <Teleport to="body">
    <div v-if="isAdminPreview" class="cmp-admin-preview-banner" role="status">
      <span>Admin preview — this is exactly what a new player sees. Nothing here was saved.</span>
      <NuxtLink to="/newsite/admin/cMoon" class="cmp-admin-preview-exit">Exit preview</NuxtLink>
    </div>
  </Teleport>
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
          :style="bannerStyle"
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

          <div class="cmp-affinity-action-row">
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

            <button
              ref="affinityHelpBtn"
              type="button"
              class="cmp-affinity-help"
              aria-label="View affinity rewards"
              @click="showAffinityInfo = true"
            >View Rewards</button>
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

        <CMoonAffinityLadderModal
          v-if="showAffinityInfo && affinity"
          :cmoon-name="cmoon.name"
          :levels="affinity.levels"
          :affinity-spent="affinity.affinitySpent"
          @close="closeAffinityInfo"
        />

        <!-- Rank Ladder progress: only shown to a member of THIS cMoon, since rank is per-cMoon
             even though the ladder itself (name/threshold/rewards) is universal — see
             prisma/schema.prisma's CMoonRankTier. Independent of the affinity widget above:
             ranks are earned automatically from cMoonPoints, not spent like affinity. -->
        <div v-if="rankProgress && rankProgress.isMember" class="cmp-rank">
          <div class="cmp-rank-head">
            <span class="cmp-affinity-label">Your Rank</span>
            <span class="cmp-rank-head-end">
              <span class="cmp-affinity-level">{{ rankProgress.currentRank ? rankProgress.currentRank.name : 'Unranked' }}</span>
              <button
                ref="rankHelpBtn"
                type="button"
                class="cmp-affinity-help cmp-affinity-help--sm"
                aria-label="View rank rewards"
                @click="showRankInfo = true"
              >Rewards</button>
            </span>
          </div>
          <div class="cmp-affinity-bar-track">
            <div
              v-if="rankProgress.nextTier && rankProgress.pendingPoints"
              class="cmp-affinity-bar-fill cmp-affinity-bar-fill--pending"
              :style="{ width: rankPendingPct + '%' }"
              :title="`+${rankProgress.pendingPoints.toLocaleString()} pts pending today (${rankPendingSummary}) — not earned until today's scoring run`"
            ></div>
            <div class="cmp-affinity-bar-fill" :style="{ width: rankProgressPct + '%' }"></div>
          </div>
          <p class="cmp-affinity-next">
            <span v-if="rankProgress.nextTier">
              {{ rankProgress.cMoonPoints.toLocaleString() }} / {{ rankProgress.nextTier.pointThreshold.toLocaleString() }} pts to {{ rankProgress.nextTier.name }}
            </span>
            <span v-else-if="rankProgress.tiers.length">Max rank reached — {{ rankProgress.cMoonPoints.toLocaleString() }} pts</span>
            <span v-else>{{ rankProgress.cMoonPoints.toLocaleString() }} pts contributed</span>
          </p>
          <p v-if="rankProgress.nextTier && rankProgress.pendingPoints" class="cmp-affinity-pending-note">
            +{{ rankProgress.pendingPoints.toLocaleString() }} pt{{ rankProgress.pendingPoints === 1 ? '' : 's' }} pending today
            (<span>{{ rankPendingSummary }}</span>) — not earned until today's scoring run
          </p>
        </div>

        <CMoonRankLadderModal
          v-if="showRankInfo && rankProgress"
          :cmoon-name="cmoon.name"
          :tiers="rankProgress.tiers"
          :c-moon-points="rankProgress.cMoonPoints"
          @close="closeRankInfo"
        />

        <!-- Unclaimed rank rewards: a player who ranked up but dismissed/missed the claim
             modal at the time can still pick their reward here — same claim endpoint the
             Achievements page uses (POST /api/achievements/:id/claim), just resurfaced on
             their own team's page. Only ever lists rank-tier achievements this member has
             already unlocked FOR THIS cMoon and hasn't claimed yet (see rank-progress.get.js's
             unclaimedRankRewards) — a big point jump can unlock more than one tier at once, so
             every pending one is shown, lowest tier first, not just the most recent. -->
        <div v-if="pendingRankClaims.length" class="cmp-rank-claim">
          <div v-for="a in pendingRankClaims" :key="a.achievementId" class="cmp-rank-claim-item">
            <h2 class="cmp-section-title">You reached {{ a.rankName || a.title }}! Choose your reward:</h2>
            <div class="cmp-claim-options" role="radiogroup" :aria-label="`Reward options for ${a.title}`">
              <button
                v-for="opt in a.claimOptions" :key="opt.id"
                type="button"
                class="cmp-claim-option"
                :class="{ 'cmp-claim-option--selected': rankClaimChoices[a.achievementId] === opt.id }"
                role="radio"
                :aria-checked="rankClaimChoices[a.achievementId] === opt.id"
                @click="rankClaimChoices[a.achievementId] = opt.id"
              >
                <div class="cmp-claim-option-body">
                  <div class="cmp-claim-option-label">{{ opt.label }}</div>
                  <div v-if="opt.ctoons?.length || opt.backgrounds?.length" class="cmp-claim-option-thumbs">
                    <img
                      v-for="(c, i) in opt.ctoons.filter(c => c.imagePath)" :key="'c' + i"
                      :src="c.imagePath" class="cmp-claim-option-thumb" :alt="c.name" :title="`${c.name} × ${c.quantity}`"
                    />
                    <img
                      v-for="(b, i) in opt.backgrounds.filter(b => b.imagePath)" :key="'b' + i"
                      :src="b.imagePath" class="cmp-claim-option-thumb" :alt="b.label" :title="b.label"
                    />
                  </div>
                  <div class="cmp-claim-option-detail">
                    <span v-if="opt.ctoons?.length">{{ opt.ctoons.map(c => `${c.name} × ${c.quantity}`).join(', ') }}</span>
                    <span v-if="opt.backgrounds?.length">{{ opt.ctoons?.length ? ' + ' : '' }}{{ opt.backgrounds.length }} background{{ opt.backgrounds.length !== 1 ? 's' : '' }}</span>
                    <span v-if="opt.points">{{ (opt.ctoons?.length || opt.backgrounds?.length) ? ' + ' : '' }}{{ opt.points.toLocaleString() }} pts</span>
                  </div>
                </div>
                <span class="cmp-claim-option-check" aria-hidden="true">{{ rankClaimChoices[a.achievementId] === opt.id ? '●' : '○' }}</span>
              </button>
            </div>
            <button
              type="button"
              class="cmp-claim-confirm-btn"
              :disabled="!rankClaimChoices[a.achievementId] || rankClaiming[a.achievementId]"
              @click="claimRankReward(a)"
            >{{ rankClaiming[a.achievementId] ? 'Claiming…' : 'Confirm reward' }}</button>
            <p v-if="rankClaimErrors[a.achievementId]" class="cmp-offer-error">{{ rankClaimErrors[a.achievementId] }}</p>
          </div>
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
                class="cmp-featured-card-btn"
                :aria-label="c.name"
                @click="openInfo(c)"
              >
                <ShortCard>
                  <template #header>
                    <img :src="c.assetPath" :alt="c.name" class="cmp-featured-img" loading="lazy" />
                  </template>
                  <template #middle>
                    <span class="cmp-featured-name">{{ c.name }}</span>
                  </template>
                </ShortCard>
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
import { cmoonJoinEffectDescriptor } from '@/utils/cmoonJoinEffectDescriptor'
import { useCtoonModal } from '@/composables/useCtoonModal'
import { useCMoonRewardModal } from '@/composables/useCMoonRewardModal'
import { useFullscreenEffect } from '@/composables/useFullscreenEffect'
import CMoonAffinityLadderModal from '@/components/newsite/CMoonAffinityLadderModal.vue'
import CMoonRankLadderModal from '@/components/newsite/CMoonRankLadderModal.vue'
import ShortCard from '@/components/newsite/ShortCard.vue'

const route = useRoute()
const { open: openCtoonModal } = useCtoonModal()
const { open: openRewardModal } = useCMoonRewardModal()
const { play: playJoinEffect } = useFullscreenEffect()
const { fetchSelf, isAdmin } = useAuth()

// Set only by the admin console's "Preview join modal" flow (CMoonSelectModal.vue, preview
// branch of confirm()) after a real navigation here — purely cosmetic, gated on the
// server-verified isAdmin so a non-admin adding this to the URL by hand sees nothing extra.
const isAdminPreview = computed(() => route.query.adminPreview === '1' && isAdmin.value)

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

const showAffinityInfo = ref(false)
const affinityHelpBtn = ref(null)
function closeAffinityInfo() {
  showAffinityInfo.value = false
  // Return focus to the trigger for keyboard/screen-reader users, same as ESC or the close
  // button dismissing any other modal in this file.
  affinityHelpBtn.value?.focus()
}

const showRankInfo = ref(false)
const rankHelpBtn = ref(null)
function closeRankInfo() {
  showRankInfo.value = false
  rankHelpBtn.value?.focus()
}

const offers = ref([])
const eligible = ref(false)
const offerSelections = reactive({})
const offerClaiming = reactive({})
const offerErrors = reactive({})

// Unclaimed cMoon rank-up rewards (see rank-progress.get.js's unclaimedRankRewards) — keyed by
// achievementId so multiple pending claims (a lump-sum point jump can unlock more than one tier
// at once) each track their own picked option/in-flight state independently.
const pendingRankClaims = computed(() => rankProgress.value?.unclaimedRankRewards || [])
const rankClaimChoices = reactive({})
const rankClaiming = reactive({})
const rankClaimErrors = reactive({})

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

const paletteStyle = computed(() => cmoon.value ? cMoonPaletteStyle({
  color: cmoon.value.color,
  pageBgColor: cmoon.value.pageBgColor,
  accentColor: cmoon.value.accentColor,
  textColor: cmoon.value.textColor,
  cardBgColor: cmoon.value.cardBgColor,
}) : {})

// Older rows saved before pageBannerWidth/Height existed (every banner force-cropped to a fixed
// 1200x100 back then) have no stored dimensions — fall back to that legacy ratio for them only.
const bannerStyle = computed(() => {
  const w = cmoon.value?.pageBannerWidth || 1200
  const h = cmoon.value?.pageBannerHeight || 100
  return { aspectRatio: `${w} / ${h}` }
})

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

// Shared floor/span math for both the confirmed and pending bar segments below — see
// rankProgressPct's original comment (unchanged) for why the floor is found by sortOrder.
const rankFloorAndSpan = computed(() => {
  const rp = rankProgress.value
  if (!rp || !rp.nextTier) return null
  const floor = rp.currentRank ? (rp.tiers.find(t => t.sortOrder === rp.currentRank.sortOrder)?.pointThreshold ?? 0) : 0
  const span = rp.nextTier.pointThreshold - floor
  return span > 0 ? { floor, span } : null
})

const rankProgressPct = computed(() => {
  const rp = rankProgress.value
  if (!rp || !rp.nextTier) return 100
  const fs = rankFloorAndSpan.value
  if (!fs) return 100
  return Math.max(0, Math.min(100, Math.round(((rp.cMoonPoints - fs.floor) / fs.span) * 100)))
})

// "If the daily scoring job ran right now" preview segment — see rank-progress.get.js's
// pendingPoints/pendingBreakdown (never a commitment; the template renders this as a visually
// distinct, separately-labeled sliver so it never reads as already-earned progress). Only
// meaningful short of the next tier — at max rank there's nothing left to preview progress
// toward, so this is 0 there regardless of any pendingPoints the API still reports.
const rankPendingPct = computed(() => {
  const rp = rankProgress.value
  if (!rp || !rp.nextTier || !rp.pendingPoints) return rankProgressPct.value
  const fs = rankFloorAndSpan.value
  if (!fs) return rankProgressPct.value
  return Math.max(0, Math.min(100, Math.round(((rp.cMoonPoints + rp.pendingPoints - fs.floor) / fs.span) * 100)))
})

const rankPendingSummary = computed(() => {
  const rp = rankProgress.value
  if (!rp || !rp.nextTier || !rp.pendingPoints || !rp.pendingBreakdown?.length) return ''
  return rp.pendingBreakdown.map(b => b.label).join(', ')
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

// Claims one pending rank-up reward from THIS cMoon's page — same POST /api/achievements/:id/claim
// endpoint MyAchievements.vue's confirmClaim uses, so the server-side claim rules (one option,
// once ever per universal tier) are identical regardless of which page the player claims from.
async function claimRankReward(a) {
  const optionId = rankClaimChoices[a.achievementId]
  if (!optionId || rankClaiming[a.achievementId]) return
  rankClaiming[a.achievementId] = true
  rankClaimErrors[a.achievementId] = ''
  try {
    const result = await $fetch(`/api/achievements/${a.achievementId}/claim`, {
      method: 'POST',
      body: { optionId },
    })
    // Drop it from the pending list immediately rather than waiting on a full reload — the
    // reveal effect/modal below plays regardless, and a stale second entry for the same
    // achievement must never linger if the player still has other tiers pending.
    if (rankProgress.value) {
      rankProgress.value.unclaimedRankRewards = rankProgress.value.unclaimedRankRewards.filter(
        (x) => x.achievementId !== a.achievementId
      )
    }
    // Effect plays first, reveal follows once it completes — mirrors the cMoon-select and
    // MyAchievements.vue claim flows exactly, so a rank claimed from either page looks the same.
    const reveal = () => {
      const items = [
        ...(result.ctoons || []).map((c) => ({ id: c.name, imagePath: c.imagePath, label: c.name, qty: c.quantity, variant: 'ctoon' })),
        ...(result.backgrounds || []).map((b) => ({ id: b.label, imagePath: b.imagePath, label: b.label || 'Background', variant: 'background' })),
      ]
      openRewardModal({
        kind: 'rank',
        eyebrow: 'cMoon Rank — Promoted!',
        title: a.title,
        items,
        pointsAwarded: result.points || null,
        emptyText: 'This rank is a milestone — no cosmetic reward attached.',
      })
    }
    const descriptor = cmoonJoinEffectDescriptor({ effectType: result?.cMoonEffectType, customJoinEffect: result?.cMoonCustomJoinEffect })
    if (descriptor) playJoinEffect(descriptor, { onComplete: reveal })
    else reveal()
  } catch (err) {
    rankClaimErrors[a.achievementId] = err?.data?.statusMessage || 'Unable to claim reward. Please try again.'
  } finally {
    rankClaiming[a.achievementId] = false
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
.cmp-admin-preview-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px 16px;
  padding-top: max(8px, env(safe-area-inset-top));
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  background: #0a1830;
  border-bottom: 2px solid #ffd75e;
  color: #ffd75e;
  font-family: 'Nunito', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}

.cmp-admin-preview-exit {
  color: #fff;
  text-decoration: underline;
  white-space: nowrap;
}

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

/* aspect-ratio is bound per-cMoon inline (bannerStyle) to the upload's real stored dimensions
   (page-banner-image.post.js downscales but never crops or upscales) — with the box's ratio
   matching the image's exactly, object-fit has nothing to crop under normal circumstances.
   max-height is still a hard clamp for the (now-possible) extreme end of the allowed 2:1-20:1
   upload band: a very wide, short-in-absolute-pixels banner would otherwise render taller than
   is reasonable on a wide desktop viewport. When that clamp actually changes the rendered box's
   ratio away from the image's own, object-fit:contain + a palette-matched background letterboxes
   rather than cropping, so the full banner stays visible either way. */
.cmp-masthead-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: clamp(80px, 24vw, 220px);
  object-fit: contain;
  background: var(--cm-bg, var(--OrbitDarkBlue));
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
  flex-wrap: wrap;
  gap: 6px 8px;
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
  /* Positioned so the rank bar's two fill segments (confirmed + pending) can stack on top of
     each other instead of side by side — harmless for the affinity bar above, which only ever
     renders one fill child. */
  position: relative;
}

.cmp-affinity-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 999px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  transition: width 0.4s ease;
}

/* "If the daily scoring job ran right now" preview (see rank-progress.get.js's pendingPoints) —
   a striped, translucent extension past the confirmed fill. Rendered BEFORE .cmp-affinity-bar-fill
   in the template so the solid confirmed color paints on top of it (both are position:absolute
   with no z-index, so DOM order alone decides paint order) — only the sliver between the two
   widths ever shows the stripe. Never the same color/opacity as the confirmed fill: this must
   read as "not yet real" at a glance, not blend into it. */
.cmp-affinity-bar-fill--pending {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 999px;
  background: repeating-linear-gradient(
    135deg,
    var(--cm-banner, var(--OrbitLightBlue)) 0px,
    var(--cm-banner, var(--OrbitLightBlue)) 4px,
    transparent 4px,
    transparent 8px
  );
  opacity: 0.55;
  transition: width 0.4s ease;
}

.cmp-affinity-pending-note {
  margin: 4px 0 0;
  font-size: 0.7rem;
  font-style: italic;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-affinity-next {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-affinity-action-row {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.cmp-affinity-toggle {
  min-height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  color: var(--cm-banner-text, #ffffff);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}
.cmp-affinity-toggle:hover { opacity: 0.9; }

.cmp-affinity-help {
  flex-shrink: 0;
  padding: 0 14px;
  min-height: 44px;
  border: 1px solid var(--cm-hairline, rgba(255,255,255,0.3));
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--cm-text, #ffffff);
  font-weight: 700;
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: pointer;
}
.cmp-affinity-help:hover,
.cmp-affinity-help:focus-visible {
  background: rgba(255, 255, 255, 0.18);
  outline: none;
}

.cmp-rank-head-end {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Compact variant for sitting inline next to a short heading (Your Rank/level name) rather than
   as a wide sibling of a full-width action button — a small pill (shorter label than the
   full-size button so it doesn't blow out this row's space-between layout next to a rank name),
   with the tap target still padded out toward 44px via a transparent hit-box, same trick as
   EconomyTicker.vue's .ticker-index-help. */
.cmp-affinity-help--sm {
  position: relative;
  width: auto;
  height: auto;
  min-height: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.65rem;
  white-space: nowrap;
}
.cmp-affinity-help--sm::before {
  content: '';
  position: absolute;
  inset: -10px;
}

.cmp-affinity-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
  min-width: 0;
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

/* Previously a fixed classic blue regardless of the surrounding cMoon's colors, on the theory
   that an admin's one auto-derived color was never checked for contrast against featured-card
   content specifically. Now themed like every other panel (--cm-tile-bg to match .cmp-affinity/
   .cmp-rank's raised-panel convention) — admins get a dedicated, contrast-warned cardBgColor
   role (see utils/cmoonPalette.js) precisely so featured cToons can safely pick up the cMoon's
   own look instead of standing apart from it. */
.cmp-featured-panel {
  background: var(--cm-tile-bg, var(--OrbitDarkBlue, #336699));
  color: var(--cm-text, #ffffff);
  border-radius: 10px;
  padding: 14px;
}
.cmp-featured-panel .cmp-empty {
  color: var(--cm-text-muted, rgba(255, 255, 255, 0.75));
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
  /* Themes the real shared ShortCard component (see components/newsite/ShortCard.vue) to match
     this cMoon's palette — set here on an ancestor, never on ShortCard itself, per its own
     --sc-* var contract (enforced by tests/shortCardVarContract.test.js). --cm-tile-bg/--cm-border
     are already contrast-verified against --cm-text by utils/cmoonPalette.js, so the card's own
     name text (which reads --cm-text via .cmp-featured-name below) stays legible regardless of
     which cMoon this is. Width/height/footer overrides keep ShortCard's normal (132x176, footer
     visible) proportions from replacing this grid's original compact ~90-100px square-ish cards —
     without them every featured card would balloon in height and the "2 rows of 6" layout above
     would collapse to far fewer, much taller cards. */
  --sc-bg: var(--cm-tile-bg, rgba(255,255,255,0.08));
  --sc-border-color: var(--cm-border, transparent);
  --sc-border-width: 1px;
  --sc-radius: 6px;
  --sc-width: 100%;
  --sc-height: 132px;
  --sc-middle-height: 28px;
  --sc-footer-min-height: 0px;
  --sc-footer-padding: 0px;
}

.cmp-featured-card-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: inherit;
}
.cmp-featured-card-btn:focus-visible {
  outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue));
  outline-offset: 2px;
  border-radius: 6px;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-featured-card-btn:hover { opacity: 0.85; }
}

.cmp-featured-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.cmp-featured-name {
  font-size: 0.7rem;
  text-align: center;
  color: var(--cm-text, #ffffff);
  overflow-wrap: anywhere;
  line-height: 1.15;
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

.cmp-rank-claim {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 20px;
}

.cmp-rank-claim-item {
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 14px;
}

.cmp-claim-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cmp-claim-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  background: var(--cm-bg, rgba(255,255,255,0.05));
  border: 2px solid var(--cm-border, rgba(255,255,255,0.15));
  border-radius: 8px;
  color: var(--cm-text, #ffffff);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.cmp-claim-option--selected {
  border-color: var(--cm-focus-ring, var(--OrbitLightBlue));
  background: var(--cm-tile-bg, rgba(255,255,255,0.12));
}

.cmp-claim-option-body {
  flex: 1 1 auto;
  min-width: 0;
}

.cmp-claim-option-label {
  font-size: 0.85rem;
  font-weight: 700;
}

.cmp-claim-option-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}

.cmp-claim-option-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  flex: 0 0 auto;
  background: rgba(0,0,0,0.25);
}

.cmp-claim-option-detail {
  font-size: 0.75rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-claim-option-check {
  flex: 0 0 auto;
  font-size: 1rem;
  color: var(--cm-focus-ring, var(--OrbitLightBlue));
}

.cmp-claim-confirm-btn {
  min-height: 44px;
  width: 100%;
  margin-top: 10px;
  padding: 0 20px;
  border: none;
  border-radius: 6px;
  background: var(--cm-success, #16a34a);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.cmp-claim-confirm-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .cmp-claim-confirm-btn:not(:disabled):hover { opacity: 0.9; }
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
