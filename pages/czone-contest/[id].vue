<template>
  <Nav />
  <div class="min-h-screen bg-gray-50 px-4 py-6" style="margin-top: 70px">
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
        <h1 class="text-3xl font-bold text-gray-900">{{ contest.name }}</h1>
        <div class="mt-2 text-sm text-gray-600 flex flex-wrap gap-4">
          <span>Ends: <strong>{{ formatDate(contest.endDate) }}</strong></span>
          <span v-if="me">
            Votes remaining: <strong>{{ votesRemaining }}</strong> / {{ contest.maxVotesPerUser }}
          </span>
          <span v-if="contest.distributedAt" class="text-amber-600 font-semibold">Contest ended — prizes distributed</span>
        </div>
        <p v-if="!me" class="mt-2 text-sm text-gray-500">
          <a href="/api/auth/discord" class="text-blue-600 hover:underline">Log in</a> to vote.
        </p>
        <div v-if="me && !contest.distributedAt && !hasOwnSubmission" class="mt-3">
          <button
            class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 rounded"
            @click="openSubmitModal"
          >
            Submit Your cZone
          </button>
        </div>
      </div>

      <!-- No submissions -->
      <div v-if="contest.submissions.length === 0" class="max-w-6xl mx-auto text-center text-gray-500 mt-16">
        No submissions yet.
      </div>

      <!-- Submission grid -->
      <div v-else class="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="submission in shuffledSubmissions"
          :key="submission.id"
          class="bg-white rounded-xl shadow overflow-hidden flex flex-col"
        >
          <div class="relative w-full" style="aspect-ratio: 800/600">
            <img
              :src="submission.imageUrl"
              alt="cZone submission"
              class="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div class="p-4 flex items-center justify-between">
            <span class="text-sm text-gray-600">
              {{ submission.voteCount }} {{ submission.voteCount === 1 ? 'vote' : 'votes' }}
            </span>
            <div class="flex gap-2">
              <!-- Own submission badge -->
              <template v-if="submission.isOwn">
                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  Your submission
                </span>
              </template>

              <!-- Vote / Unvote button -->
              <template v-else-if="me">
                <button
                  v-if="!submission.hasVoted"
                  :disabled="contest.distributedAt || votesRemaining <= 0 || votingId === submission.id"
                  class="text-sm px-3 py-1 rounded font-medium transition-colors"
                  :class="votesRemaining > 0 && !contest.distributedAt
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
                  @click="vote(submission)"
                >
                  {{ votingId === submission.id ? 'Voting...' : 'Vote' }}
                </button>
                <button
                  v-else
                  :disabled="!!contest.distributedAt || votingId === submission.id"
                  class="text-sm px-3 py-1 rounded font-medium transition-colors bg-gray-200 hover:bg-red-100 text-gray-700 hover:text-red-600"
                  @click="unvote(submission)"
                >
                  {{ votingId === submission.id ? 'Removing...' : 'Unvote' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
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
const route = useRoute()
const contestId = route.params.id

const { data: me } = await useFetch('/api/auth/me').catch(() => ({ data: ref(null) }))

const { data: contest, pending, error, refresh } = await useFetch(`/api/czone-contest/${contestId}`)

const votesRemaining = computed(() => contest.value?.votesRemaining ?? 0)
const hasOwnSubmission = computed(() => contest.value?.submissions?.some(s => s.isOwn) ?? false)

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

const shuffledSubmissions = computed(() => {
  if (!contest.value?.submissions) return []
  const arr = [...contest.value.submissions]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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
    submission.voteCount++
    contest.value.votesUsed++
    contest.value.votesRemaining--
  } catch (err) {
    showToast(err?.data?.statusMessage || 'Failed to vote')
  } finally {
    votingId.value = null
  }
}

async function unvote(submission) {
  votingId.value = submission.id
  try {
    await $fetch(`/api/czone-contest/${contestId}/submissions/${submission.id}/vote`, { method: 'DELETE' })
    submission.hasVoted = false
    submission.voteCount--
    contest.value.votesUsed--
    contest.value.votesRemaining++
  } catch (err) {
    showToast(err?.data?.statusMessage || 'Failed to remove vote')
  } finally {
    votingId.value = null
  }
}

</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
