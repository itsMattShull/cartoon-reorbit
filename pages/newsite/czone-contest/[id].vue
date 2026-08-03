<template>
  <div class="ccd-wrap">
    <!-- Loading -->
    <div v-if="pending" class="ccd-card">
      <div class="h-6 w-48 rounded bg-white/10 animate-pulse"></div>
      <div class="mt-4 h-4 w-72 rounded bg-white/10 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error || !contest" class="ccd-card">
      <p class="text-sm text-white/60">Contest not found.</p>
      <NuxtLink to="/newsite/MycWorld" class="ccd-link mt-3 inline-block">Back to My cWorld</NuxtLink>
    </div>

    <div v-else class="ccd-inner">
      <!-- Header -->
      <section class="ccd-card">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-2xl font-semibold text-white">{{ contest.name }}</h1>
              <span class="ccd-badge" :class="statusClass">{{ statusLabel }}</span>
            </div>

            <div class="mt-5 flex flex-wrap gap-8 items-start">
              <!-- Countdown / result -->
              <div v-if="!contest.distributedAt">
                <p class="text-xs uppercase tracking-widest text-white/40">{{ countdownLabel }}</p>
                <div class="mt-2 flex items-end gap-3">
                  <template v-if="countdown.days > 0">
                    <div class="text-center">
                      <span class="text-3xl font-bold text-white">{{ countdown.days }}</span>
                      <p class="text-xs text-white/50 mt-0.5">{{ countdown.days === 1 ? 'day' : 'days' }}</p>
                    </div>
                    <span class="text-white/20 text-2xl pb-4">·</span>
                  </template>
                  <template v-if="countdown.days > 0 || countdown.hours > 0">
                    <div class="text-center">
                      <span class="text-3xl font-bold text-white">{{ countdown.hours }}</span>
                      <p class="text-xs text-white/50 mt-0.5">{{ countdown.hours === 1 ? 'hr' : 'hrs' }}</p>
                    </div>
                    <span class="text-white/20 text-2xl pb-4">·</span>
                  </template>
                  <div class="text-center">
                    <span class="text-3xl font-bold text-white">{{ countdown.minutes }}</span>
                    <p class="text-xs text-white/50 mt-0.5">{{ countdown.minutes === 1 ? 'min' : 'mins' }}</p>
                  </div>
                </div>
              </div>
              <div v-else>
                <p class="text-xs uppercase tracking-widest text-white/40">Result</p>
                <span class="ccd-tag-amber mt-2 inline-flex">Prizes distributed</span>
              </div>

              <!-- Votes remaining -->
              <div v-if="me && !contest.distributedAt && (isVotingPhase || !contest.endVotingDate)">
                <p class="text-xs uppercase tracking-widest text-white/40">Votes Remaining</p>
                <p class="mt-2 text-3xl font-bold text-white">
                  {{ contest.votesRemaining }}
                  <span class="text-base font-normal text-white/40">/ {{ contest.maxVotesPerUser }}</span>
                </p>
              </div>
            </div>

            <!-- Submissions closed banner (voting phase) -->
            <div v-if="!contest.distributedAt && isVotingPhase" class="ccd-notice mt-5">
              Submissions closed — voting is open
            </div>
            <!-- Submit button (submission phase only) -->
            <div v-else-if="me && !contest.distributedAt && !hasOwnSubmission && isSubmissionPhase" class="mt-5">
              <OrangeButton @click="openSubmitModal">Submit Your cZone</OrangeButton>
            </div>
            <div v-else-if="me && hasOwnSubmission && !contest.distributedAt" class="mt-5 text-sm font-semibold text-[#4cdb73]">
              ✓ Submitted
            </div>
          </div>

          <!-- Prizes button -->
          <div class="flex-shrink-0">
            <button class="ccd-prize-btn" @click="showPrizesModal = true">Prizes</button>
          </div>
        </div>
      </section>

      <!-- No submissions -->
      <div v-if="!contest.submissions.length" class="ccd-card">
        <p class="text-sm text-white/60">No submissions yet.</p>
      </div>

      <!-- Submission grid -->
      <div v-else class="ccd-grid">
        <div
          v-for="submission in displayedSubmissions"
          :key="submission.id"
          class="ccd-sub-card"
          :class="{ 'ccd-sub-card-winner': submission.isWinner }"
        >
          <div v-if="submission.isWinner" class="ccd-winner-banner">🏆 Winner</div>

          <div class="ccd-sub-img-wrap">
            <img
              :src="submission.imageUrl"
              alt="cZone submission"
              class="ccd-sub-img"
              @click="openLightbox(submission.imageUrl)"
            />
          </div>

          <div class="ccd-sub-foot">
            <template v-if="contest.distributedAt">
              <span class="text-sm font-medium text-white/80">{{ submission.username }}</span>
            </template>
            <template v-else-if="submission.isOwn">
              <span class="ccd-tag-blue">Your submission</span>
            </template>
            <span v-else></span>

            <template v-if="contest.distributedAt">
              <span class="text-xs text-white/50">
                {{ submission.voteCount }} {{ submission.voteCount === 1 ? 'vote' : 'votes' }}
              </span>
            </template>
            <template v-else-if="!submission.isOwn && me && (isVotingPhase || !contest.endVotingDate)">
              <button
                class="ccd-vote-btn"
                :class="{ voted: submission.hasVoted, disabled: !submission.hasVoted && contest.votesRemaining <= 0 }"
                :disabled="submission.hasVoted || contest.votesRemaining <= 0 || votingId === submission.id"
                @click="castVote(submission)"
              >{{ votingId === submission.id ? '…' : submission.hasVoted ? 'Voted' : 'Vote' }}</button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />

    <!-- Prizes modal -->
    <Teleport to="body">
      <div v-if="showPrizesModal && contest" class="ccd-overlay" @click.self="showPrizesModal = false">
        <div class="ccd-modal">
          <div class="ccd-modal-head">
            <span>Contest Prizes</span>
            <button class="ccd-modal-close" @click="showPrizesModal = false">✕</button>
          </div>
          <div class="ccd-modal-body">
            <div class="ccd-prize-section">
              <div class="ccd-prize-section-title">🏆 Winner</div>
              <div v-if="contest.winnerPrizes?.points" class="ccd-prize-points">
                ⭐ {{ contest.winnerPrizes.points.toLocaleString() }} points
              </div>
              <div v-if="contest.winnerPrizes?.ctoons?.length" class="ccd-prize-ctoons">
                <div v-for="(ct, i) in contest.winnerPrizes.ctoons" :key="i" class="ccd-prize-ctoon">
                  <img v-if="ct.assetPath" :src="ct.assetPath" :alt="ct.name" class="ccd-prize-ctoon-img" />
                  <div class="ccd-prize-ctoon-name">{{ ct.name }}</div>
                  <div v-if="ct.qty > 1" class="ccd-prize-ctoon-qty">×{{ ct.qty }}</div>
                </div>
              </div>
              <div v-if="contest.winnerPrizes?.backgrounds?.length" class="ccd-prize-bgs">
                <img v-for="(bg, i) in contest.winnerPrizes.backgrounds" :key="i"
                  v-if="bg.imagePath" :src="bg.imagePath" :alt="bg.label" class="ccd-prize-bg" />
              </div>
              <div v-if="!hasPrize(contest.winnerPrizes)" class="ccd-no-prize">None configured.</div>
            </div>
            <div class="ccd-prize-divider"></div>
            <div class="ccd-prize-section">
              <div class="ccd-prize-section-title">🎁 All Participants</div>
              <div v-if="contest.participantPrizes?.points" class="ccd-prize-points">
                ⭐ {{ contest.participantPrizes.points.toLocaleString() }} points
              </div>
              <div v-if="contest.participantPrizes?.ctoons?.length" class="ccd-prize-ctoons">
                <div v-for="(ct, i) in contest.participantPrizes.ctoons" :key="i" class="ccd-prize-ctoon">
                  <img v-if="ct.assetPath" :src="ct.assetPath" :alt="ct.name" class="ccd-prize-ctoon-img" />
                  <div class="ccd-prize-ctoon-name">{{ ct.name }}</div>
                  <div v-if="ct.qty > 1" class="ccd-prize-ctoon-qty">×{{ ct.qty }}</div>
                </div>
              </div>
              <div v-if="contest.participantPrizes?.backgrounds?.length" class="ccd-prize-bgs">
                <img v-for="(bg, i) in contest.participantPrizes.backgrounds" :key="i"
                  v-if="bg.imagePath" :src="bg.imagePath" :alt="bg.label" class="ccd-prize-bg" />
              </div>
              <div v-if="!hasPrize(contest.participantPrizes)" class="ccd-no-prize">None configured.</div>
            </div>
          </div>
          <div class="ccd-modal-foot">
            <button class="ccd-close-btn" @click="showPrizesModal = false">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Submit modal -->
    <Teleport to="body">
      <div v-if="submitOpen" class="ccd-overlay" @click.self="submitOpen = false">
        <div class="ccd-modal">
          <div class="ccd-modal-head">
            <span>Submit Your cZone</span>
            <button class="ccd-modal-close" @click="submitOpen = false">✕</button>
          </div>
          <div class="ccd-modal-body">
            <div v-if="submitSuccess" class="ccd-submit-success">
              <div class="ccd-success-check">✓</div>
              <div>Submitted! Good luck!</div>
            </div>
            <template v-else>
              <div v-if="myZonesLoading" class="text-sm text-white/60">Loading your cZone…</div>
              <div v-else class="ccd-submit-form">
                <label class="ccd-field-label">Which zone?</label>
                <select class="ccd-select" v-model="submitZoneIndex">
                  <option v-for="(z, i) in myZones" :key="i" :value="i">Zone {{ i + 1 }}</option>
                </select>
                <div v-if="submitError" class="ccd-submit-error">{{ submitError }}</div>
              </div>
            </template>
          </div>
          <div class="ccd-modal-foot">
            <template v-if="!submitSuccess">
              <OrangeButton :disabled="submitLoading || myZonesLoading" @click="doSubmit">
                {{ submitLoading ? 'Submitting…' : 'Submit' }}
              </OrangeButton>
              <button class="ccd-close-btn" @click="submitOpen = false">Cancel</button>
            </template>
            <button v-else class="ccd-close-btn" @click="submitOpen = false">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Image lightbox -->
    <Teleport to="body">
      <div v-if="lightboxImage" class="ccd-lightbox" @click.self="closeLightbox">
        <button class="ccd-lightbox-close" @click="closeLightbox" aria-label="Close">✕</button>
        <img :src="lightboxImage" class="ccd-lightbox-img" alt="cZone submission enlarged" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'cZone Contest',
  description: 'View cZone Contest submissions, vote for your favorites, and see the prizes on Cartoon ReOrbit.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const { user } = useAuth()
const me = user

const route = useRoute()
const rawId = route.params.id
const contestId = typeof rawId === 'string' ? rawId : (Array.isArray(rawId) ? rawId[0] : '')

// ── Contest detail ────────────────────────────────────────────
const contest = ref(null)
const pending = ref(true)
const error = ref(null)

async function loadContest() {
  pending.value = true
  error.value = null
  try {
    contest.value = await $fetch(`/api/czone-contest/${contestId}`)
  } catch (e) {
    error.value = e
  } finally {
    pending.value = false
  }
}

await loadContest()

// ── Phase helpers ─────────────────────────────────────────────
const isVotingPhase = computed(() => {
  if (!contest.value?.endVotingDate) return false
  const now = Date.now()
  return now > new Date(contest.value.endDate).getTime() &&
         now <= new Date(contest.value.endVotingDate).getTime()
})

const isSubmissionPhase = computed(() => {
  if (!contest.value) return false
  const now = Date.now()
  return now >= new Date(contest.value.startDate).getTime() &&
         now <= new Date(contest.value.endDate).getTime()
})

const hasOwnSubmission = computed(() => contest.value?.submissions?.some(s => s.isOwn) ?? false)

const statusLabel = computed(() => {
  if (!contest.value) return ''
  if (contest.value.distributedAt) return 'Closed'
  if (isVotingPhase.value) return 'Voting Open'
  return 'Active'
})

const statusClass = computed(() => {
  if (!contest.value) return ''
  if (contest.value.distributedAt) return 'ccd-badge-closed'
  if (isVotingPhase.value) return 'ccd-badge-voting'
  return 'ccd-badge-active'
})

const countdownLabel = computed(() => {
  if (!contest.value) return 'Time Remaining'
  if (contest.value.endVotingDate) {
    if (isVotingPhase.value) return 'Voting ends'
    return 'Submissions close'
  }
  return 'Ends'
})

// ── Countdown ─────────────────────────────────────────────────
const countdown = ref({ days: 0, hours: 0, minutes: 0 })
let countdownTimer = null

function updateCountdown() {
  if (!contest.value || contest.value.distributedAt) return
  const target = isVotingPhase.value && contest.value.endVotingDate
    ? new Date(contest.value.endVotingDate)
    : new Date(contest.value.endDate)
  const diff = target - Date.now()
  if (diff <= 0) { countdown.value = { days: 0, hours: 0, minutes: 0 }; return }
  const totalMin = Math.floor(diff / 60000)
  countdown.value = {
    days:    Math.floor(totalMin / 1440),
    hours:   Math.floor((totalMin % 1440) / 60),
    minutes: totalMin % 60
  }
}

onMounted(() => {
  updateCountdown()
  countdownTimer = setInterval(updateCountdown, 60000)
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

// ── Submissions display ───────────────────────────────────────
const displayedSubmissions = computed(() => {
  if (!contest.value?.submissions) return []
  if (contest.value.distributedAt) {
    return contest.value.submissions
      .map(s => ({ ...s, isWinner: s.id === contest.value.winnerId }))
      .sort((a, b) => {
        if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1
        return b.voteCount - a.voteCount
      })
  }
  return contest.value.submissions.map(s => ({ ...s, isWinner: false }))
})

// ── Toast ─────────────────────────────────────────────────────
const toastMessage = ref('')
const toastType = ref('error')

function showToast(msg, type = 'error') {
  toastType.value = type
  toastMessage.value = msg
  setTimeout(() => { toastMessage.value = '' }, 5000)
}

// ── Voting ────────────────────────────────────────────────────
const votingId = ref(null)

async function castVote(submission) {
  if (!contest.value || contest.value.votesRemaining <= 0) return
  votingId.value = submission.id
  try {
    await $fetch(`/api/czone-contest/${contest.value.id}/submissions/${submission.id}/vote`, { method: 'POST' })
    submission.hasVoted = true
    contest.value.votesRemaining--
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Failed to vote')
  } finally {
    votingId.value = null
  }
}

// ── Prizes modal ──────────────────────────────────────────────
const showPrizesModal = ref(false)
function hasPrize(p) { return p?.points || p?.ctoons?.length || p?.backgrounds?.length }

// ── Submit modal ──────────────────────────────────────────────
const submitOpen      = ref(false)
const myZones         = ref([])
const myZonesLoading  = ref(false)
const submitZoneIndex = ref(0)
const submitLoading   = ref(false)
const submitError     = ref('')
const submitSuccess   = ref(false)

function bgUrl(v) {
  if (!v) return ''
  const s = String(v)
  if (/^(https?:)?\/\//.test(s) || s.startsWith('/')) return s
  return `/backgrounds/${s}`
}

async function openSubmitModal() {
  submitError.value = ''
  submitSuccess.value = false
  submitZoneIndex.value = 0
  submitOpen.value = true
  if (!myZones.value.length) {
    myZonesLoading.value = true
    try {
      const res = await $fetch(`/api/czone/${me.value.username}`)
      myZones.value = res.cZone?.zones ?? []
    } catch {
      submitError.value = 'Failed to load your cZone.'
    } finally {
      myZonesLoading.value = false
    }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

async function doSubmit() {
  submitError.value = ''
  submitLoading.value = true
  try {
    const zone = myZones.value[submitZoneIndex.value]

    const canvas = document.createElement('canvas')
    canvas.width  = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#003466'
    ctx.fillRect(0, 0, 800, 600)

    const bgSrc = bgUrl(zone?.background)
    if (bgSrc) {
      try {
        const bgImg = await loadImage(bgSrc)
        const scale = Math.max(800 / bgImg.naturalWidth, 600 / bgImg.naturalHeight)
        const w = bgImg.naturalWidth  * scale
        const h = bgImg.naturalHeight * scale
        ctx.drawImage(bgImg, (800 - w) / 2, (600 - h) / 2, w, h)
      } catch { /* background failed — keep dark fill */ }
    }

    for (const toon of (zone?.toons || [])) {
      try {
        const img = await loadImage(toon.assetPath)
        const w = (toon.width  || img.naturalWidth)  * (toon.sizeScale || 1)
        const h = (toon.height || img.naturalHeight) * (toon.sizeScale || 1)
        ctx.drawImage(img, toon.x, toon.y, w, h)
      } catch { /* skip toons that fail to load */ }
    }

    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('Failed to capture')

    const fd = new FormData()
    fd.append('image', blob, 'zone.png')
    fd.append('zoneIndex', String(submitZoneIndex.value))
    await $fetch(`/api/czone-contest/${contest.value.id}/submit`, { method: 'POST', body: fd })

    submitSuccess.value = true
    await loadContest()
  } catch (err) {
    submitError.value = err?.data?.statusMessage || err?.message || 'Submission failed'
  } finally {
    submitLoading.value = false
  }
}

// ── Image lightbox ────────────────────────────────────────────
const lightboxImage = ref(null)
function openLightbox(url) { lightboxImage.value = url }
function closeLightbox() { lightboxImage.value = null }
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.ccd-wrap {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}

.ccd-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ccd-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
}

.ccd-link { color: var(--OrbitLightBlue); text-decoration: underline; font-size: 0.85rem; }

.ccd-badge {
  font-size: 0.62rem; font-weight: bold; padding: 2px 10px;
  border-radius: 10px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
}
.ccd-badge-active { background: rgba(46,160,67,0.2); color: #4cdb73; border: 1px solid rgba(46,160,67,0.4); }
.ccd-badge-voting { background: rgba(124,45,138,0.2); color: #cc7ae0; border: 1px solid rgba(124,45,138,0.4); }
.ccd-badge-closed { background: rgba(160,46,46,0.2); color: #e07a7a; border: 1px solid rgba(160,46,46,0.4); }

.ccd-notice {
  display: inline-block;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #fbbf24;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 10px;
}

.ccd-prize-btn {
  font-size: 0.75rem; font-weight: bold; padding: 6px 16px;
  background: rgba(244,164,0,0.15); border: 1px solid rgba(244,164,0,0.4);
  color: #f4a800; border-radius: 10px; cursor: pointer; white-space: nowrap;
}
.ccd-prize-btn:hover { background: rgba(244,164,0,0.28); }

.ccd-tag-amber {
  background: rgba(251, 191, 36, 0.15); color: #fbbf24;
  border-radius: 9999px; padding: 3px 10px; font-size: 0.75rem; font-weight: 600;
}
.ccd-tag-blue {
  background: rgba(51, 153, 204, 0.2); color: var(--OrbitLightBlue, #3399cc);
  border-radius: 9999px; padding: 2px 8px; font-size: 0.7rem; font-weight: 600;
}

/* ── Submission grid ── */
.ccd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.ccd-sub-card {
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  overflow: hidden;
}
.ccd-sub-card-winner { border-color: #f4a800; }

.ccd-winner-banner {
  background: linear-gradient(90deg, #c88000, #f4a800, #c88000);
  text-align: center;
  font-size: 0.72rem;
  font-weight: bold;
  color: #1a0800;
  padding: 4px;
}

.ccd-sub-img-wrap { aspect-ratio: 800/600; width: 100%; overflow: hidden; position: relative; }
.ccd-sub-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }

.ccd-sub-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  gap: 8px;
}

.ccd-vote-btn {
  font-size: 0.7rem; font-weight: bold; padding: 4px 12px;
  border-radius: 6px; border: none; cursor: pointer;
  background: #2ea843; color: #fff;
}
.ccd-vote-btn.voted    { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.45); cursor: default; }
.ccd-vote-btn.disabled { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.3); cursor: default; }
.ccd-vote-btn:not(.voted):not(.disabled):hover { filter: brightness(1.15); }
</style>

<style>
/* ── Shared modal styles (global for Teleport) ── */
.ccd-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.ccd-modal {
  background: var(--OrbitDarkBlue, #003466);
  border: 2px solid var(--OrbitLightBlue, #1a5a9a);
  border-radius: 8px;
  width: 100%; max-width: 480px; max-height: 85vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.ccd-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
  font-size: 0.85rem; font-weight: bold; color: #fff; flex-shrink: 0;
}
.ccd-modal-close {
  background: none; border: none; color: rgba(255,255,255,0.5);
  font-size: 0.9rem; cursor: pointer; line-height: 1; padding: 0;
}
.ccd-modal-close:hover { color: #fff; }
.ccd-modal-body {
  flex: 1; overflow-y: auto; scrollbar-width: thin; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 12px;
}
.ccd-modal-foot {
  padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.1);
  display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0;
}
.ccd-close-btn {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; font-size: 0.75rem; padding: 5px 14px;
  border-radius: 4px; cursor: pointer;
}
.ccd-close-btn:hover { background: rgba(255,255,255,0.18); }

/* Prize sections */
.ccd-prize-section { display: flex; flex-direction: column; gap: 8px; }
.ccd-prize-section-title { font-size: 0.75rem; font-weight: bold; color: #fff; }
.ccd-prize-divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); }
.ccd-prize-points { font-size: 0.75rem; color: #f4a800; }
.ccd-prize-ctoons { display: flex; flex-wrap: wrap; gap: 6px; }
.ccd-prize-ctoon  { display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.25); border-radius: 4px; padding: 6px; width: 72px; }
.ccd-prize-ctoon-img  { width: 52px; height: 52px; object-fit: contain; image-rendering: pixelated; }
.ccd-prize-ctoon-name { font-size: 0.58rem; color: #fff; text-align: center; margin-top: 3px; line-height: 1.2; }
.ccd-prize-ctoon-qty  { font-size: 0.58rem; color: rgba(255,255,255,0.5); }
.ccd-prize-bgs { display: flex; flex-wrap: wrap; gap: 6px; }
.ccd-prize-bg  { width: 110px; aspect-ratio: 4/3; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); }
.ccd-no-prize  { font-size: 0.68rem; color: rgba(255,255,255,0.35); font-style: italic; }

/* Submit form */
.ccd-submit-success { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 0; color: #4cdb73; font-size: 0.85rem; font-weight: bold; }
.ccd-success-check  { font-size: 2rem; }
.ccd-submit-form    { display: flex; flex-direction: column; gap: 8px; }
.ccd-field-label    { font-size: 0.72rem; color: rgba(255,255,255,0.7); }
.ccd-select {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; font-size: 0.75rem; padding: 4px 8px;
  border-radius: 4px; outline: none;
}
.ccd-select option { background: #1a3a58; }
.ccd-submit-error { font-size: 0.68rem; color: #e07a7a; }

/* Image lightbox */
.ccd-lightbox {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 1100;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.ccd-lightbox-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  cursor: default;
}
.ccd-lightbox-close {
  position: fixed;
  top: 12px; right: 16px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.25);
  color: #fff;
  font-size: 1.1rem;
  width: 36px; height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.ccd-lightbox-close:hover { background: rgba(255,255,255,0.22); }
@media (max-width: 600px) {
  .ccd-lightbox { padding: 12px; }
  .ccd-lightbox-close { top: 8px; right: 8px; width: 32px; height: 32px; font-size: 1rem; }
}
</style>
