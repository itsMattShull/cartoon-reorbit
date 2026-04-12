<template>
  <div class="cc">

    <!-- ── Header ── -->
    <div class="cc-header">cZone Contest</div>

    <!-- ── Loading / empty ── -->
    <div v-if="loadingList" class="cc-empty">Loading…</div>
    <div v-else-if="!contests.length" class="cc-empty">No active contests right now.</div>

    <!-- ── Contest list ── -->
    <template v-else>
      <!-- Contest selector (only shown when multiple active) -->
      <div v-if="contests.length > 1" class="cc-selector">
        <button
          v-for="c in contests" :key="c.id"
          class="cc-sel-btn" :class="{ active: activeId === c.id }"
          @click="selectContest(c.id)"
        >{{ c.name }}</button>
      </div>

      <!-- ── Contest detail ── -->
      <template v-if="contest">

        <!-- Info bar -->
        <div class="cc-info-bar">
          <div class="cc-info-left">
            <span class="cc-name">{{ contest.name }}</span>
            <span class="cc-badge" :class="statusClass">{{ statusLabel }}</span>
          </div>
          <div class="cc-info-right">
            <div v-if="!contest.distributedAt" class="cc-countdown">
              <span class="cc-countdown-label">{{ countdownLabel }}:</span>
              <span class="cc-countdown-val">
                <template v-if="countdown.days">{{ countdown.days }}d </template>
                <template v-if="countdown.days || countdown.hours">{{ countdown.hours }}h </template>
                {{ countdown.minutes }}m
              </span>
            </div>
            <span v-if="me && !contest.distributedAt" class="cc-votes">
              {{ contest.votesRemaining }} / {{ contest.maxVotesPerUser }} votes left
            </span>
            <button class="cc-prize-btn" @click="showPrizes = true">Prizes</button>
          </div>
        </div>

        <!-- Submit / status row -->
        <div class="cc-action-bar">
          <template v-if="contest.distributedAt">
            <span class="cc-closed-label">Prizes distributed</span>
          </template>
          <template v-else-if="isVotingPhase">
            <span class="cc-voting-notice">Submissions closed — voting is open</span>
          </template>
          <template v-else-if="me && !hasOwnSubmission && isSubmissionPhase">
            <OrangeButton @click="openSubmit">Submit Your cZone</OrangeButton>
          </template>
          <template v-else-if="me && hasOwnSubmission">
            <span class="cc-submitted-label">✓ Submitted</span>
          </template>
          <template v-else-if="!me && !contest.distributedAt">
            <span class="cc-login-notice">Log in to submit or vote</span>
          </template>
        </div>

        <!-- Submission grid -->
        <div class="cc-grid-wrap">
          <div v-if="loadingDetail" class="cc-empty">Loading submissions…</div>
          <div v-else-if="!contest.submissions.length" class="cc-empty">No submissions yet.</div>
          <div v-else class="cc-grid">
            <div
              v-for="s in displayedSubmissions" :key="s.id"
              class="cc-card" :class="{ 'cc-card-winner': s.isWinner }"
            >
              <div v-if="s.isWinner" class="cc-winner-banner">🏆 Winner</div>
              <div class="cc-card-img-wrap">
                <img :src="s.imageUrl" class="cc-card-img" alt="cZone submission" />
              </div>
              <div class="cc-card-foot">
                <span v-if="contest.distributedAt" class="cc-card-user">{{ s.username }}</span>
                <span v-else-if="s.isOwn" class="cc-own-badge">Your submission</span>
                <span v-else></span>

                <template v-if="contest.distributedAt">
                  <span class="cc-vote-count">{{ s.voteCount }} vote{{ s.voteCount !== 1 ? 's' : '' }}</span>
                </template>
                <template v-else-if="!s.isOwn && me && (isVotingPhase || !contest.endVotingDate) && !contest.distributedAt">
                  <button
                    class="cc-vote-btn"
                    :class="{ voted: s.hasVoted, disabled: !s.hasVoted && contest.votesRemaining <= 0 }"
                    :disabled="s.hasVoted || contest.votesRemaining <= 0 || votingId === s.id"
                    @click="castVote(s)"
                  >{{ votingId === s.id ? '…' : s.hasVoted ? 'Voted' : 'Vote' }}</button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ── Prizes modal ── -->
    <Teleport to="body">
      <div v-if="showPrizes && contest" class="cc-overlay" @click.self="showPrizes = false">
        <div class="cc-modal">
          <div class="cc-modal-head">
            <span>Contest Prizes</span>
            <button class="cc-modal-close" @click="showPrizes = false">✕</button>
          </div>
          <div class="cc-modal-body">
            <!-- Winner -->
            <div class="cc-prize-section">
              <div class="cc-prize-section-title">🏆 Winner</div>
              <div v-if="contest.winnerPrizes?.points" class="cc-prize-points">
                ⭐ {{ contest.winnerPrizes.points.toLocaleString() }} points
              </div>
              <div v-if="contest.winnerPrizes?.ctoons?.length" class="cc-prize-ctoons">
                <div v-for="(ct, i) in contest.winnerPrizes.ctoons" :key="i" class="cc-prize-ctoon">
                  <img v-if="ct.assetPath" :src="ct.assetPath" :alt="ct.name" class="cc-prize-ctoon-img" />
                  <div class="cc-prize-ctoon-name">{{ ct.name }}</div>
                  <div v-if="ct.qty > 1" class="cc-prize-ctoon-qty">×{{ ct.qty }}</div>
                </div>
              </div>
              <div v-if="contest.winnerPrizes?.backgrounds?.length" class="cc-prize-bgs">
                <img v-for="(bg, i) in contest.winnerPrizes.backgrounds" :key="i"
                  v-if="bg.imagePath" :src="bg.imagePath" :alt="bg.label" class="cc-prize-bg" />
              </div>
              <div v-if="!hasPrize(contest.winnerPrizes)" class="cc-no-prize">None configured.</div>
            </div>
            <div class="cc-prize-divider"></div>
            <!-- Participant -->
            <div class="cc-prize-section">
              <div class="cc-prize-section-title">🎁 All Participants</div>
              <div v-if="contest.participantPrizes?.points" class="cc-prize-points">
                ⭐ {{ contest.participantPrizes.points.toLocaleString() }} points
              </div>
              <div v-if="contest.participantPrizes?.ctoons?.length" class="cc-prize-ctoons">
                <div v-for="(ct, i) in contest.participantPrizes.ctoons" :key="i" class="cc-prize-ctoon">
                  <img v-if="ct.assetPath" :src="ct.assetPath" :alt="ct.name" class="cc-prize-ctoon-img" />
                  <div class="cc-prize-ctoon-name">{{ ct.name }}</div>
                  <div v-if="ct.qty > 1" class="cc-prize-ctoon-qty">×{{ ct.qty }}</div>
                </div>
              </div>
              <div v-if="contest.participantPrizes?.backgrounds?.length" class="cc-prize-bgs">
                <img v-for="(bg, i) in contest.participantPrizes.backgrounds" :key="i"
                  v-if="bg.imagePath" :src="bg.imagePath" :alt="bg.label" class="cc-prize-bg" />
              </div>
              <div v-if="!hasPrize(contest.participantPrizes)" class="cc-no-prize">None configured.</div>
            </div>
          </div>
          <div class="cc-modal-foot">
            <button class="cc-close-btn" @click="showPrizes = false">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Submit modal ── -->
    <Teleport to="body">
      <div v-if="submitOpen" class="cc-overlay" @click.self="submitOpen = false">
        <div class="cc-modal">
          <div class="cc-modal-head">
            <span>Submit Your cZone</span>
            <button class="cc-modal-close" @click="submitOpen = false">✕</button>
          </div>
          <div class="cc-modal-body">
            <div v-if="submitSuccess" class="cc-submit-success">
              <div class="cc-success-check">✓</div>
              <div>Submitted! Good luck!</div>
            </div>
            <template v-else>
              <div v-if="myZonesLoading" class="cc-empty">Loading your cZone…</div>
              <div v-else class="cc-submit-form">
                <label class="cc-field-label">Which zone?</label>
                <select class="cc-select" v-model="submitZoneIndex">
                  <option v-for="(z, i) in myZones" :key="i" :value="i">Zone {{ i + 1 }}</option>
                </select>
                <div v-if="canvasRFP" class="cc-rfp-warning">
                  Canvas fingerprint protection detected. This may cause artifacts in the snapshot.
                </div>
                <div v-if="submitError" class="cc-submit-error">{{ submitError }}</div>
              </div>
            </template>
          </div>
          <div class="cc-modal-foot">
            <template v-if="!submitSuccess">
              <OrangeButton :disabled="submitLoading || myZonesLoading" @click="doSubmit">
                {{ submitLoading ? 'Submitting…' : 'Submit' }}
              </OrangeButton>
              <button class="cc-close-btn" @click="submitOpen = false">Cancel</button>
            </template>
            <button v-else class="cc-close-btn" @click="submitOpen = false">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Off-screen capture canvas -->
    <div
      v-if="submitOpen && myZones.length"
      ref="captureRef"
      style="position:fixed; left:-9999px; top:0; width:800px; height:600px; overflow:hidden;"
      :style="captureBgStyle"
    >
      <div
        v-for="(item, i) in captureZoneToons" :key="i"
        style="position:absolute;"
        :style="{ top: item.y + 'px', left: item.x + 'px' }"
      >
        <img :src="item.assetPath" :alt="item.name" :style="{ width: item.width + 'px', height: item.height + 'px', objectFit: 'contain' }" />
      </div>
    </div>

  </div>
</template>

<script setup>
const { user } = useAuth()
const me = user

// ── Contest list ──────────────────────────────────────────────
const contests    = ref([])
const loadingList = ref(false)
const activeId    = ref(null)

onMounted(loadContests)

async function loadContests() {
  loadingList.value = true
  try {
    contests.value = await $fetch('/api/czone-contest')
    if (contests.value.length) selectContest(contests.value[0].id)
  } catch (e) {
    console.error('CzoneContest: load failed', e)
  } finally {
    loadingList.value = false
  }
}

// ── Contest detail ────────────────────────────────────────────
const contest      = ref(null)
const loadingDetail = ref(false)

async function selectContest(id) {
  activeId.value = id
  loadingDetail.value = true
  contest.value = null
  try {
    contest.value = await $fetch(`/api/czone-contest/${id}`)
  } catch (e) {
    console.error('CzoneContest: detail failed', e)
  } finally {
    loadingDetail.value = false
  }
}

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

const statusLabel = computed(() => {
  if (!contest.value) return ''
  if (contest.value.distributedAt) return 'Closed'
  if (isVotingPhase.value) return 'Voting Open'
  return 'Active'
})

const statusClass = computed(() => {
  if (!contest.value) return ''
  if (contest.value.distributedAt) return 'cc-badge-closed'
  if (isVotingPhase.value) return 'cc-badge-voting'
  return 'cc-badge-active'
})

const countdownLabel = computed(() => {
  if (!contest.value) return ''
  if (isVotingPhase.value) return 'Voting ends'
  if (contest.value.endVotingDate) return 'Submissions close'
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

watch(contest, () => {
  updateCountdown()
  clearInterval(countdownTimer)
  if (contest.value && !contest.value.distributedAt)
    countdownTimer = setInterval(updateCountdown, 60000)
})

onUnmounted(() => clearInterval(countdownTimer))

// ── Submissions display ───────────────────────────────────────
const hasOwnSubmission = computed(() => contest.value?.submissions?.some(s => s.isOwn) ?? false)

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
    console.error('CzoneContest: vote failed', e?.data?.statusMessage || e)
  } finally {
    votingId.value = null
  }
}

// ── Prizes modal ──────────────────────────────────────────────
const showPrizes = ref(false)
function hasPrize(p) { return p?.points || p?.ctoons?.length || p?.backgrounds?.length }

// ── Submit modal ──────────────────────────────────────────────
const captureRef      = ref(null)
const submitOpen      = ref(false)
const myZones         = ref([])
const myZonesLoading  = ref(false)
const submitZoneIndex = ref(0)
const submitLoading   = ref(false)
const submitError     = ref('')
const submitSuccess   = ref(false)
const canvasRFP       = ref(false)

const captureBgStyle = computed(() => {
  const zone = myZones.value[submitZoneIndex.value]
  const bg = zone?.background
  if (!bg) return {}
  return {
    backgroundImage: `url('/backgrounds/${bg}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const captureZoneToons = computed(() => (myZones.value[submitZoneIndex.value]?.toons || []))

function detectRFP() {
  try {
    const c = document.createElement('canvas')
    c.width = 1; c.height = 1
    const ctx = c.getContext('2d')
    ctx.fillStyle = 'rgb(100,150,200)'
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    canvasRFP.value = (r !== 100 || g !== 150 || b !== 200)
  } catch { canvasRFP.value = false }
}

async function openSubmit() {
  submitError.value = ''
  submitSuccess.value = false
  submitZoneIndex.value = 0
  submitOpen.value = true
  detectRFP()
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

async function doSubmit() {
  submitError.value = ''
  submitLoading.value = true
  try {
    const el = captureRef.value
    if (!el) throw new Error('Canvas not ready')

    // Preload background
    const zone = myZones.value[submitZoneIndex.value]
    if (zone?.background) {
      await new Promise(resolve => {
        const img = new Image()
        img.onload = img.onerror = resolve
        img.src = `/backgrounds/${zone.background}`
      })
    }

    // Wait for toon images
    const imgs = Array.from(el.querySelectorAll('img'))
    await Promise.all(imgs.map(img =>
      img.complete && img.naturalHeight
        ? Promise.resolve()
        : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }) })
    ))

    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(el, { useCORS: true, allowTaint: true, width: 800, height: 600, scale: 1 })
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('Failed to capture')

    const fd = new FormData()
    fd.append('image', blob, 'zone.png')
    fd.append('zoneIndex', String(submitZoneIndex.value))
    await $fetch(`/api/czone-contest/${contest.value.id}/submit`, { method: 'POST', body: fd })

    submitSuccess.value = true
    await selectContest(contest.value.id)
  } catch (err) {
    submitError.value = err?.data?.statusMessage || err?.message || 'Submission failed'
  } finally {
    submitLoading.value = false
  }
}
</script>

<style scoped>
.cc {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.cc-header {
  flex-shrink: 0;
  background: var(--OrbitLightBlue);
  border-bottom: 2px solid var(--OrbitDarkBlue);
  text-align: center;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  height: 26px;
  line-height: 24px;
  letter-spacing: 0.04em;
}

.cc-empty {
  padding: 12px;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
  font-style: italic;
  text-align: center;
}

/* ── Selector ── */
.cc-selector {
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.cc-sel-btn {
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: rgba(255,255,255,0.6);
  font-size: 0.65rem;
  padding: 2px 8px;
  cursor: pointer;
}
.cc-sel-btn.active { background: var(--OrbitLightBlue); color: #fff; border-color: transparent; }

/* ── Info bar ── */
.cc-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 5px 8px;
  background: rgba(0,0,0,0.15);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  gap: 8px;
  flex-wrap: wrap;
}
.cc-info-left  { display: flex; align-items: center; gap: 6px; min-width: 0; }
.cc-info-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.cc-name { font-size: 0.78rem; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cc-badge {
  font-size: 0.58rem; font-weight: bold; padding: 1px 6px;
  border-radius: 10px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
}
.cc-badge-active { background: rgba(46,160,67,0.25); color: #4cdb73; border: 1px solid rgba(46,160,67,0.4); }
.cc-badge-voting { background: rgba(124,45,138,0.25); color: #cc7ae0; border: 1px solid rgba(124,45,138,0.4); }
.cc-badge-closed { background: rgba(160,46,46,0.25); color: #e07a7a; border: 1px solid rgba(160,46,46,0.4); }

.cc-countdown { font-size: 0.65rem; color: rgba(255,255,255,0.5); }
.cc-countdown-val { color: #fff; font-weight: bold; margin-left: 2px; }
.cc-votes { font-size: 0.65rem; color: rgba(255,255,255,0.6); white-space: nowrap; }
.cc-prize-btn {
  font-size: 0.62rem; font-weight: bold; padding: 2px 8px;
  background: rgba(244,164,0,0.2); border: 1px solid rgba(244,164,0,0.4);
  color: #f4a800; border-radius: 10px; cursor: pointer; white-space: nowrap;
}
.cc-prize-btn:hover { background: rgba(244,164,0,0.35); }

/* ── Action bar ── */
.cc-action-bar {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  min-height: 32px;
  gap: 8px;
}
.cc-closed-label    { font-size: 0.68rem; color: #f4a800; font-weight: bold; }
.cc-voting-notice   { font-size: 0.68rem; color: rgba(255,255,255,0.55); font-style: italic; }
.cc-submitted-label { font-size: 0.68rem; color: #4cdb73; font-weight: bold; }
.cc-login-notice    { font-size: 0.68rem; color: rgba(255,255,255,0.4); font-style: italic; }

/* ── Submission grid ── */
.cc-grid-wrap {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 8px;
}

.cc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  align-content: start;
}

.cc-card {
  background: var(--OrbitDarkBlue);
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  overflow: hidden;
}
.cc-card-winner { border-color: #f4a800; }

.cc-winner-banner {
  background: linear-gradient(90deg, #c88000, #f4a800, #c88000);
  text-align: center;
  font-size: 0.68rem;
  font-weight: bold;
  color: #1a0800;
  padding: 3px;
}

.cc-card-img-wrap { aspect-ratio: 800/600; width: 100%; overflow: hidden; }
.cc-card-img { width: 100%; height: 100%; object-fit: cover; display: block; }

.cc-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 7px;
  gap: 6px;
}
.cc-card-user   { font-size: 0.65rem; color: rgba(255,255,255,0.65); }
.cc-own-badge   { font-size: 0.6rem; background: rgba(37,99,235,0.3); color: #7eb3ff; border-radius: 8px; padding: 1px 6px; }
.cc-vote-count  { font-size: 0.62rem; color: rgba(255,255,255,0.45); }

.cc-vote-btn {
  font-size: 0.65rem; font-weight: bold; padding: 2px 10px;
  border-radius: 4px; border: none; cursor: pointer;
  background: #2ea843; color: #fff;
}
.cc-vote-btn.voted    { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.45); cursor: default; }
.cc-vote-btn.disabled { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.3); cursor: default; }
.cc-vote-btn:not(.voted):not(.disabled):hover { filter: brightness(1.15); }
</style>

<style>
/* ── Shared modal styles (global for Teleport) ── */
.cc-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.cc-modal {
  background: var(--OrbitDarkBlue, #003466);
  border: 2px solid var(--OrbitLightBlue, #1a5a9a);
  border-radius: 8px;
  width: 100%; max-width: 480px; max-height: 85vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.cc-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
  font-size: 0.85rem; font-weight: bold; color: #fff; flex-shrink: 0;
}
.cc-modal-close {
  background: none; border: none; color: rgba(255,255,255,0.5);
  font-size: 0.9rem; cursor: pointer; line-height: 1; padding: 0;
}
.cc-modal-close:hover { color: #fff; }
.cc-modal-body {
  flex: 1; overflow-y: auto; scrollbar-width: thin; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 12px;
}
.cc-modal-foot {
  padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.1);
  display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0;
}
.cc-close-btn {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; font-size: 0.75rem; padding: 5px 14px;
  border-radius: 4px; cursor: pointer;
}
.cc-close-btn:hover { background: rgba(255,255,255,0.18); }

/* Prize sections */
.cc-prize-section { display: flex; flex-direction: column; gap: 8px; }
.cc-prize-section-title { font-size: 0.75rem; font-weight: bold; color: #fff; }
.cc-prize-divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); }
.cc-prize-points { font-size: 0.75rem; color: #f4a800; }
.cc-prize-ctoons { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-prize-ctoon  { display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.25); border-radius: 4px; padding: 6px; width: 72px; }
.cc-prize-ctoon-img  { width: 52px; height: 52px; object-fit: contain; image-rendering: pixelated; }
.cc-prize-ctoon-name { font-size: 0.58rem; color: #fff; text-align: center; margin-top: 3px; line-height: 1.2; }
.cc-prize-ctoon-qty  { font-size: 0.58rem; color: rgba(255,255,255,0.5); }
.cc-prize-bgs { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-prize-bg  { width: 110px; aspect-ratio: 4/3; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); }
.cc-no-prize  { font-size: 0.68rem; color: rgba(255,255,255,0.35); font-style: italic; }

/* Submit form */
.cc-submit-success { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 0; color: #4cdb73; font-size: 0.85rem; font-weight: bold; }
.cc-success-check  { font-size: 2rem; }
.cc-submit-form    { display: flex; flex-direction: column; gap: 8px; }
.cc-field-label    { font-size: 0.72rem; color: rgba(255,255,255,0.7); }
.cc-select {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; font-size: 0.75rem; padding: 4px 8px;
  border-radius: 4px; outline: none;
}
.cc-select option { background: #1a3a58; }
.cc-rfp-warning  { font-size: 0.65rem; color: #f4a800; background: rgba(244,164,0,0.1); border: 1px solid rgba(244,164,0,0.3); border-radius: 4px; padding: 6px 8px; line-height: 1.4; }
.cc-submit-error { font-size: 0.68rem; color: #e07a7a; }
</style>
