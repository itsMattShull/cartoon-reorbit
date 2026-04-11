<template>
  <Nav />
  <div class="reorbit-theme relative overflow-hidden min-h-screen" style="background: linear-gradient(180deg, var(--reorbit-cyan) -50%, transparent 100%) top/100% 100px no-repeat, linear-gradient(180deg, var(--reorbit-blue), var(--reorbit-navy))">
  <div class="mt-16 md:mt-20 min-h-screen px-4 py-6 text-white">
    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center min-h-64">
      <div class="text-gray-500 text-lg">Loading contest...</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-xl mx-auto text-center text-red-600 mt-16">
      <p class="text-xl font-semibold">Contest not found</p>
      <NuxtLink to="/" class="text-blue-600 hover:underline mt-4 inline-block">Go home</NuxtLink>
    </div>

    <template v-else-if="contest">
      <!-- Header -->
      <div class="max-w-6xl mx-auto mb-8">
        <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
          <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>
          <div class="p-6 text-slate-900 flex gap-6 items-start">
            <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-3 mb-1">
              <h1 class="text-3xl font-bold text-[var(--reorbit-blue)]">{{ contest.name }}</h1>
              <!-- Status badge -->
              <span v-if="contest.distributedAt" class="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                Closed
              </span>
              <span v-else-if="isVotingPhase" class="inline-flex items-center gap-1.5 bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse inline-block"></span>
                Voting Open
              </span>
              <span v-else class="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"></span>
                Active
              </span>
            </div>

            <div class="mt-5 flex flex-wrap gap-8 items-start">
              <!-- Countdown / ended -->
              <div v-if="!contest.distributedAt">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{{ countdownLabel }}</p>
                <div class="flex items-end gap-3">
                  <template v-if="countdown.days > 0">
                    <div class="text-center">
                      <span class="text-3xl font-bold text-[var(--reorbit-blue)]">{{ countdown.days }}</span>
                      <p class="text-xs text-slate-500 mt-0.5">{{ countdown.days === 1 ? 'day' : 'days' }}</p>
                    </div>
                    <span class="text-slate-300 text-2xl pb-4">·</span>
                  </template>
                  <template v-if="countdown.days > 0 || countdown.hours > 0">
                    <div class="text-center">
                      <span class="text-3xl font-bold text-[var(--reorbit-blue)]">{{ countdown.hours }}</span>
                      <p class="text-xs text-slate-500 mt-0.5">{{ countdown.hours === 1 ? 'hr' : 'hrs' }}</p>
                    </div>
                    <span class="text-slate-300 text-2xl pb-4">·</span>
                  </template>
                  <div class="text-center">
                    <span class="text-3xl font-bold text-[var(--reorbit-blue)]">{{ countdown.minutes }}</span>
                    <p class="text-xs text-slate-500 mt-0.5">{{ countdown.minutes === 1 ? 'min' : 'mins' }}</p>
                  </div>
                </div>
              </div>
              <div v-else>
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Result</p>
                <span class="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                  Prizes distributed
                </span>
              </div>

              <!-- Votes remaining (only show when voting is open) -->
              <div v-if="me && !contest.distributedAt && (isVotingPhase || !contest.endVotingDate)">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Votes Remaining</p>
                <p class="text-3xl font-bold text-[var(--reorbit-blue)]">
                  {{ votesRemaining }}
                  <span class="text-base font-normal text-slate-400">/ {{ contest.maxVotesPerUser }}</span>
                </p>
              </div>
            </div>

            <p v-if="!me && !contest.distributedAt" class="mt-4 text-sm text-slate-500">
              <a href="/api/auth/discord" class="text-[var(--reorbit-blue)] hover:underline font-medium">Log in</a> to {{ isVotingPhase ? 'vote' : 'submit or vote' }}.
            </p>
            <!-- Submissions closed banner (voting phase) -->
            <div v-if="!contest.distributedAt && isVotingPhase" class="mt-4 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold px-4 py-2 rounded-lg">
              <span>Submissions Closed</span>
              <span class="text-amber-500">·</span>
              <span class="font-normal text-amber-700">Voting is now open</span>
            </div>
            <!-- Submit button (submission phase only) -->
            <div v-else-if="me && !contest.distributedAt && !hasOwnSubmission && !isVotingPhase" class="mt-5">
              <button
                class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded"
                @click="openSubmitModal"
              >
                Submit Your cZone
              </button>
            </div>
            </div>

            <!-- Prize preview (right side) -->
            <div v-if="winnerFirstCtoonImage" class="flex-shrink-0 flex flex-col items-center gap-2 pt-1">
              <img
                :src="winnerFirstCtoonImage"
                alt="Prize cToon"
                class="h-24 w-auto object-contain drop-shadow-md"
              />
              <button
                class="text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--reorbit-blue)] hover:bg-[var(--reorbit-navy)] text-white transition-colors"
                @click="showPrizesModal = true"
              >
                View Prizes
              </button>
            </div>
            <div v-else-if="hasPrizes" class="flex-shrink-0 flex flex-col items-center justify-center gap-2 pt-1">
              <button
                class="text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--reorbit-blue)] hover:bg-[var(--reorbit-navy)] text-white transition-colors"
                @click="showPrizesModal = true"
              >
                View Prizes
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- No submissions -->
      <div v-if="contest.submissions.length === 0" class="max-w-6xl mx-auto text-center text-gray-500 mt-16">
        No submissions yet.
      </div>

      <!-- Submission grid -->
      <div v-else class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="submission in displayedSubmissions"
          :key="submission.id"
          class="rounded-xl shadow overflow-hidden flex flex-col"
          :class="submission.isWinner
            ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-transparent bg-white'
            : 'bg-white'"
        >
          <!-- Winner banner -->
          <div v-if="submission.isWinner" class="bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-400 px-4 py-2 flex items-center gap-2">
            <span class="text-xl">🏆</span>
            <span class="text-sm font-bold text-amber-900 uppercase tracking-wide">Winner</span>
          </div>

          <div class="relative w-full" style="aspect-ratio: 800/600">
            <img
              :src="submission.imageUrl"
              alt="cZone submission"
              class="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div class="p-4 flex items-center justify-between">
            <!-- Submitter username (closed contests) or own-submission badge -->
            <div class="flex items-center gap-2">
              <template v-if="contest.distributedAt">
                <span class="text-sm font-medium text-slate-700">{{ submission.username }}</span>
              </template>
              <template v-else-if="submission.isOwn">
                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  Your submission
                </span>
              </template>
            </div>

            <!-- Vote count (closed) or vote button (active) -->
            <div class="flex items-center gap-2">
              <template v-if="contest.distributedAt">
                <span class="text-xs text-slate-500 font-medium">
                  {{ submission.voteCount }} {{ submission.voteCount === 1 ? 'vote' : 'votes' }}
                </span>
              </template>
              <template v-else-if="!submission.isOwn && me && (isVotingPhase || !contest.endVotingDate)">
                <button
                  :disabled="submission.hasVoted || votesRemaining <= 0 || votingId === submission.id"
                  class="text-sm px-3 py-1 rounded font-medium transition-colors"
                  :class="!submission.hasVoted && votesRemaining > 0
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
                  @click="vote(submission)"
                >
                  {{ votingId === submission.id ? 'Voting...' : submission.hasVoted ? 'Voted' : 'Vote' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
  </div>

  <!-- Submit cZone Modal -->
  <transition name="fade">
    <div
      v-if="submitModalVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/50 overflow-y-auto p-4"
    >
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <button class="absolute top-3 right-3 text-gray-500 hover:text-black" @click="submitModalVisible = false">✕</button>
        <h2 class="text-xl font-bold mb-4">Submit to Contest</h2>

        <div v-if="submitSuccess" class="text-center py-6">
          <div class="text-green-600 text-4xl mb-3">✓</div>
          <p class="text-lg font-semibold text-green-700">Submitted successfully!</p>
          <p class="text-gray-600 text-sm mt-2">Your cZone has been entered into the contest. Good luck!</p>
          <button class="mt-4 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded" @click="submitModalVisible = false">Close</button>
        </div>

        <template v-else>
          <div v-if="myZonesLoading" class="text-center py-6 text-gray-500">Loading your cZone...</div>
          <div v-else class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Which zone do you want to submit?</label>
              <select v-model="submitZoneIndex" class="w-full border rounded p-2">
                <option v-for="(z, i) in myZones" :key="i" :value="i">Zone {{ i + 1 }}</option>
              </select>
            </div>

            <div v-if="canvasRFPDetected" class="bg-yellow-50 border border-yellow-300 rounded p-3 text-sm text-yellow-800">
              <strong>LibreWolf / Canvas Protection Detected</strong><br>
              Your browser's canvas fingerprinting protection is active, which will cause the snapshot image to have vertical line artifacts. To fix this, you can either:<br>
              <ul class="list-disc list-inside mt-1 space-y-1">
                <li>In LibreWolf, go to <strong>about:preferences#privacy</strong> and disable "Enable Resist Fingerprinting", then retry.</li>
                <li>Or, open <strong>about:config</strong>, search for <code>privacy.resistFingerprinting</code>, and set it to <strong>false</strong>.</li>
              </ul>
              You can re-enable it after submitting.
            </div>

            <div v-if="submitError" class="text-red-600 text-sm">{{ submitError }}</div>

            <div class="flex gap-3 pt-2">
              <button
                :disabled="submitLoading"
                class="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded font-medium disabled:opacity-50"
                @click="submitCZone"
              >{{ submitLoading ? 'Capturing & submitting...' : 'Submit' }}</button>
              <button class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded" @click="submitModalVisible = false">Cancel</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </transition>

  <!-- Prizes Modal -->
  <transition name="fade">
    <div
      v-if="showPrizesModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="showPrizesModal = false"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col" style="max-height: min(90vh, 700px)">
        <!-- Fixed header -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0 rounded-t-xl bg-white">
          <h2 class="text-xl font-bold text-[var(--reorbit-blue)]">Contest Prizes</h2>
          <button class="text-slate-400 hover:text-slate-600 text-xl leading-none" @click="showPrizesModal = false">✕</button>
        </div>
        <!-- Scrollable body -->
        <div class="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <!-- Winner Prizes -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">🏆</span>
              <h3 class="text-base font-bold text-amber-700">Winner Prizes</h3>
            </div>
            <div v-if="contest.winnerPrizes && (contest.winnerPrizes.ctoons.length || contest.winnerPrizes.backgrounds.length || contest.winnerPrizes.points)" class="space-y-3">
              <div v-if="contest.winnerPrizes.ctoons.length" class="flex flex-wrap gap-3">
                <div
                  v-for="ct in contest.winnerPrizes.ctoons"
                  :key="ct.ctoonId"
                  class="flex flex-col items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg p-2 w-20"
                >
                  <img v-if="ct.assetPath" :src="ct.assetPath" :alt="ct.name" class="h-14 w-auto object-contain" />
                  <span class="text-xs text-center text-slate-700 font-medium leading-tight">{{ ct.name }}</span>
                  <span v-if="ct.qty > 1" class="text-xs text-amber-700 font-bold">×{{ ct.qty }}</span>
                </div>
              </div>
              <div v-if="contest.winnerPrizes.points" class="flex items-center gap-2 text-sm text-slate-700">
                <span class="text-base">⭐</span>
                <span><strong>{{ Number(contest.winnerPrizes.points).toLocaleString() }}</strong> points</span>
              </div>
              <div v-if="contest.winnerPrizes.backgrounds.length" class="space-y-1">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Backgrounds</p>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="bg in contest.winnerPrizes.backgrounds"
                    :key="bg.id"
                    class="rounded-lg overflow-hidden border border-slate-200 w-28"
                  >
                    <img v-if="bg.imagePath" :src="bg.imagePath" :alt="bg.label" class="w-full h-16 object-cover" />
                    <div class="px-2 py-1 text-xs text-slate-700 truncate bg-slate-50">{{ bg.label || bg.id }}</div>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">No winner prizes configured.</p>
          </div>

          <hr class="border-slate-200" />

          <!-- Participant Prizes -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">🎁</span>
              <h3 class="text-base font-bold text-[var(--reorbit-blue)]">Participant Prizes</h3>
            </div>
            <div v-if="contest.participantPrizes && (contest.participantPrizes.ctoons.length || contest.participantPrizes.backgrounds.length || contest.participantPrizes.points)" class="space-y-3">
              <div v-if="contest.participantPrizes.ctoons.length" class="flex flex-wrap gap-3">
                <div
                  v-for="ct in contest.participantPrizes.ctoons"
                  :key="ct.ctoonId"
                  class="flex flex-col items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg p-2 w-20"
                >
                  <img v-if="ct.assetPath" :src="ct.assetPath" :alt="ct.name" class="h-14 w-auto object-contain" />
                  <span class="text-xs text-center text-slate-700 font-medium leading-tight">{{ ct.name }}</span>
                  <span v-if="ct.qty > 1" class="text-xs text-[var(--reorbit-blue)] font-bold">×{{ ct.qty }}</span>
                </div>
              </div>
              <div v-if="contest.participantPrizes.points" class="flex items-center gap-2 text-sm text-slate-700">
                <span class="text-base">⭐</span>
                <span><strong>{{ Number(contest.participantPrizes.points).toLocaleString() }}</strong> points</span>
              </div>
              <div v-if="contest.participantPrizes.backgrounds.length" class="space-y-1">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Backgrounds</p>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="bg in contest.participantPrizes.backgrounds"
                    :key="bg.id"
                    class="rounded-lg overflow-hidden border border-slate-200 w-28"
                  >
                    <img v-if="bg.imagePath" :src="bg.imagePath" :alt="bg.label" class="w-full h-16 object-cover" />
                    <div class="px-2 py-1 text-xs text-slate-700 truncate bg-slate-50">{{ bg.label || bg.id }}</div>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">No participant prizes configured.</p>
          </div>
        </div>
        <!-- Fixed footer -->
        <div class="px-6 py-4 border-t border-slate-200 flex-shrink-0 rounded-b-xl bg-white">
          <button
            class="w-full bg-[var(--reorbit-blue)] hover:bg-[var(--reorbit-navy)] text-white py-2 rounded-lg font-medium transition-colors"
            @click="showPrizesModal = false"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </transition>

  <!-- Hidden off-screen canvas used for html2canvas capture -->
  <div
    v-if="submitModalVisible && myZones.length > 0"
    ref="hiddenCanvasRef"
    class="relative overflow-hidden"
    style="position: fixed; left: -9999px; top: 0; width: 800px; height: 600px;"
    :style="hiddenCanvasBgStyle"
  >
    <div class="absolute inset-0">
      <div
        v-for="(item, idx) in submitZoneToons"
        :key="item.id || idx"
        class="absolute"
        :style="item.style"
      >
        <img
          :src="item.assetPath"
          :alt="item.name"
          :style="`width: ${item.width}px; height: ${item.height}px; object-fit: contain; max-width: initial;`"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: 'auth', layout: 'default' })

const route = useRoute()
const contestId = route.params.id

const { data: me } = await useFetch('/api/auth/me').catch(() => ({ data: ref(null) }))

const { data: contest, pending, error, refresh } = await useFetch(`/api/czone-contest/${contestId}`)

const votesRemaining = computed(() => contest.value?.votesRemaining ?? 0)
const hasOwnSubmission = computed(() => contest.value?.submissions?.some(s => s.isOwn) ?? false)

// ── Prizes ────────────────────────────────────────────────────────────────────
const showPrizesModal = ref(false)

const winnerFirstCtoonImage = computed(() => {
  const ctoons = contest.value?.winnerPrizes?.ctoons
  if (!ctoons?.length) return null
  return ctoons[0].assetPath || null
})

const hasPrizes = computed(() => {
  const wp = contest.value?.winnerPrizes
  const pp = contest.value?.participantPrizes
  return (wp?.ctoons?.length || wp?.backgrounds?.length || wp?.points) ||
         (pp?.ctoons?.length || pp?.backgrounds?.length || pp?.points)
})

// ── cZone Submission ──────────────────────────────────────────────────────────
const hiddenCanvasRef = ref(null)
const myZones = ref([])
const myZonesLoading = ref(false)
const submitModalVisible = ref(false)
const submitZoneIndex = ref(0)
const submitLoading = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)
const canvasRFPDetected = ref(false)

function bgUrl(v) {
  if (!v) return ''
  const s = String(v)
  if (/^(https?:)?\/\//.test(s) || s.startsWith('/')) return s
  return `/backgrounds/${s}`
}

const hiddenCanvasBgStyle = computed(() => {
  const zone = myZones.value[submitZoneIndex.value]
  if (!zone) return {}
  const src = bgUrl(zone.background)
  if (!src) return {}
  return {
    backgroundImage: `url('${src}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
})

const submitZoneToons = computed(() => {
  const zone = myZones.value[submitZoneIndex.value]
  if (!zone) return []
  return (zone.toons || []).map(item => ({
    ...item,
    style: `top: ${item.y}px; left: ${item.x}px; width: ${item.width}px; height: ${item.height}px;`
  }))
})

function detectCanvasRFP() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgb(100, 150, 200)'
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    canvasRFPDetected.value = (r !== 100 || g !== 150 || b !== 200)
  } catch {
    canvasRFPDetected.value = false
  }
}

async function openSubmitModal() {
  submitError.value = ''
  submitSuccess.value = false
  submitZoneIndex.value = 0
  submitModalVisible.value = true
  detectCanvasRFP()
  if (myZones.value.length === 0) {
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

async function submitCZone() {
  submitError.value = ''
  submitLoading.value = true

  try {
    const canvasEl = hiddenCanvasRef.value
    if (!canvasEl) throw new Error('Could not find canvas to capture')

    // Preload background image before capture
    const zone = myZones.value[submitZoneIndex.value]
    const bgSrc = bgUrl(zone?.background)
    if (bgSrc) {
      await new Promise(resolve => {
        const img = new Image()
        img.onload = resolve
        img.onerror = resolve
        img.src = bgSrc
      })
    }

    // Wait for all cToon images to finish loading
    const imgs = Array.from(canvasEl.querySelectorAll('img'))
    if (imgs.length > 0) {
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve()
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true })
          img.addEventListener('error', resolve, { once: true })
        })
      }))
    }

    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(canvasEl, {
      useCORS: true,
      allowTaint: true,
      width: 800,
      height: 600,
      scale: 1,
      scrollX: 0,
      scrollY: 0
    })

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Failed to capture zone image')

    const fd = new FormData()
    fd.append('image', blob, 'zone.png')
    fd.append('zoneIndex', String(submitZoneIndex.value))

    await $fetch(`/api/czone-contest/${contestId}/submit`, { method: 'POST', body: fd })

    submitSuccess.value = true
    await refresh()
  } catch (err) {
    submitError.value = err?.data?.statusMessage || err?.message || 'Submission failed'
  } finally {
    submitLoading.value = false
  }
}

// ── Voting phase helpers ───────────────────────────────────────────────────────
const isVotingPhase = computed(() => {
  if (!contest.value?.endVotingDate) return false
  const now = Date.now()
  return now >= new Date(contest.value.endDate).getTime() && now <= new Date(contest.value.endVotingDate).getTime()
})

const isSubmissionPhase = computed(() => {
  if (!contest.value) return false
  const now = Date.now()
  return now >= new Date(contest.value.startDate).getTime() && now <= new Date(contest.value.endDate).getTime()
})

const countdownLabel = computed(() => {
  if (!contest.value) return 'Time Remaining'
  if (contest.value.endVotingDate) {
    if (isVotingPhase.value) return 'Time Left Until Voting Ends'
    return 'Time Left Until Submissions Closed and Voting Opens'
  }
  return 'Time Left Until Submissions Close and Voting Ends'
})

// ── Countdown ─────────────────────────────────────────────────────────────────
const countdown = ref({ days: 0, hours: 0, minutes: 0 })
let countdownTimer = null

function updateContestCountdown() {
  if (!contest.value) return
  // When in voting phase, count down to endVotingDate; otherwise count down to endDate
  const targetDate = isVotingPhase.value && contest.value.endVotingDate
    ? new Date(contest.value.endVotingDate)
    : new Date(contest.value.endDate)
  const diffMs = targetDate - Date.now()
  if (diffMs <= 0) { countdown.value = { days: 0, hours: 0, minutes: 0 }; return }
  const totalMinutes = Math.floor(diffMs / 60000)
  countdown.value = {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60
  }
}

onMounted(() => {
  updateContestCountdown()
  countdownTimer = setInterval(updateContestCountdown, 60000)
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const displayedSubmissions = computed(() => {
  if (!contest.value?.submissions) return []
  // When the contest is closed (prizes distributed), show winner first then sort by votes desc
  if (contest.value.distributedAt) {
    const withWinner = contest.value.submissions.map(s => ({
      ...s,
      isWinner: s.id === contest.value.winnerId
    }))
    return withWinner.sort((a, b) => {
      if (a.isWinner && !b.isWinner) return -1
      if (!a.isWinner && b.isWinner) return 1
      return b.voteCount - a.voteCount
    })
  }
  // Active contest: server already returns submissions in a randomized order.
  // Do NOT re-shuffle on the client — a second shuffle with different random values
  // causes an SSR/hydration mismatch that can display the isOwn badge on the wrong card.
  return contest.value.submissions.map(s => ({ ...s, isWinner: false }))
})

const toastMessage = ref('')
const toastType = ref('error')
const votingId = ref(null)

function showToast(msg, type = 'error') {
  toastType.value = type
  toastMessage.value = msg
  setTimeout(() => { toastMessage.value = '' }, 5000)
}

function formatDate(dt) {
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  })
}

async function vote(submission) {
  if (votesRemaining.value <= 0) {
    showToast(`You have no votes remaining for this contest.`)
    return
  }
  votingId.value = submission.id
  try {
    await $fetch(`/api/czone-contest/${contestId}/submissions/${submission.id}/vote`, { method: 'POST' })
    submission.hasVoted = true
    contest.value.votesUsed++
    contest.value.votesRemaining--
  } catch (err) {
    showToast(err?.data?.statusMessage || 'Failed to vote')
  } finally {
    votingId.value = null
  }
}


</script>

<style>
.reorbit-theme {
  --reorbit-deep: #010A36;
  --reorbit-navy: #002C62;
  --reorbit-blue: #2D5294;
  --reorbit-cyan: #0FDDD6;
  --reorbit-aqua: #16ECE9;
  --reorbit-teal: #19E6AC;
  --reorbit-green-2: #70F873;
  --reorbit-lime: #AFFA2D;
  --reorbit-purple: #9647CF;
  --reorbit-border: rgba(45,82,148,0.25);
  --reorbit-tint: rgba(0,44,98,0.035);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
