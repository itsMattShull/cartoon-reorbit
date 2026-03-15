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
      </div>

      <!-- No submissions -->
      <div v-if="contest.submissions.length === 0" class="max-w-6xl mx-auto text-center text-gray-500 mt-16">
        No submissions yet.
      </div>

      <!-- Submission grid -->
      <div v-else class="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="submission in contest.submissions"
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
              <span
                v-if="submission.isOwn"
                class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium"
              >
                Your submission
              </span>

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
</template>

<script setup>
const route = useRoute()
const contestId = route.params.id

const { data: me } = await useFetch('/api/auth/me').catch(() => ({ data: ref(null) }))

const { data: contest, pending, error, refresh } = await useFetch(`/api/czone-contest/${contestId}`)

const votesRemaining = computed(() => contest.value?.votesRemaining ?? 0)

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
