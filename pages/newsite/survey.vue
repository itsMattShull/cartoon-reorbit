<template>
  <div class="survey-page">

    <!-- ── Already completed ──────────────────────────────────────────────── -->
    <div v-if="alreadyDone" class="survey-card">
      <div class="survey-done-icon">✓</div>
      <h1 class="survey-title">Survey Complete</h1>
      <p class="survey-sub">
        You've already filled out the survey and earned your
        <strong>3,000 points</strong>. Thanks for being part of the community!
      </p>
    </div>

    <!-- ── Success state (just submitted) ────────────────────────────────── -->
    <div v-else-if="submitted" class="survey-card">
      <div class="survey-done-icon">🎉</div>
      <h1 class="survey-title">Thanks!</h1>
      <p class="survey-sub">
        Your answers have been saved and <strong>3,000 points</strong> have been
        added to your account.
      </p>
      <button class="survey-btn" @click="navigateTo('/newsite/home')">
        Back to home
      </button>
    </div>

    <!-- ── Survey form ────────────────────────────────────────────────────── -->
    <div v-else class="survey-card">
      <h1 class="survey-title">Earn 3,000 Points</h1>
      <p class="survey-sub">
        Tell us a little about yourself. Each answer needs at least
        {{ MIN_CHARS }} characters — about 2–3 sentences.
      </p>

      <form @submit.prevent="handleSubmit" class="survey-form" novalidate>

        <!-- Question 1 -->
        <div class="survey-field">
          <label class="survey-label" for="why-join">
            Why do you want to be part of Cartoon ReOrbit?
          </label>
          <textarea
            id="why-join"
            ref="whyRef"
            v-model="form.whyJoin"
            class="survey-textarea"
            rows="5"
            placeholder="Tell us in your own words…"
            :class="{ 'textarea-ok': form.whyJoin.length >= MIN_CHARS, 'textarea-warn': form.whyJoin.length > 0 && form.whyJoin.length < MIN_CHARS }"
          />
          <div class="char-counter" :class="{ 'counter-ok': form.whyJoin.length >= MIN_CHARS }">
            {{ form.whyJoin.length }} / {{ MIN_CHARS }}
            <span v-if="form.whyJoin.length >= MIN_CHARS" class="counter-check">✓</span>
          </div>
        </div>

        <!-- Question 2 -->
        <div class="survey-field">
          <label class="survey-label" for="how-found">
            How did you find Cartoon ReOrbit?
          </label>
          <textarea
            id="how-found"
            ref="howRef"
            v-model="form.howFound"
            class="survey-textarea"
            rows="5"
            placeholder="Tell us in your own words…"
            :class="{ 'textarea-ok': form.howFound.length >= MIN_CHARS, 'textarea-warn': form.howFound.length > 0 && form.howFound.length < MIN_CHARS }"
          />
          <div class="char-counter" :class="{ 'counter-ok': form.howFound.length >= MIN_CHARS }">
            {{ form.howFound.length }} / {{ MIN_CHARS }}
            <span v-if="form.howFound.length >= MIN_CHARS" class="counter-check">✓</span>
          </div>
        </div>

        <!-- Question 3 -->
        <div class="survey-field">
          <label class="survey-label" for="fav-shows">
            What were your favorite cartoons growing up?
          </label>
          <textarea
            id="fav-shows"
            ref="showsRef"
            v-model="form.favoriteShows"
            class="survey-textarea"
            rows="5"
            placeholder="Tell us in your own words…"
            :class="{ 'textarea-ok': form.favoriteShows.length >= MIN_CHARS, 'textarea-warn': form.favoriteShows.length > 0 && form.favoriteShows.length < MIN_CHARS }"
          />
          <div class="char-counter" :class="{ 'counter-ok': form.favoriteShows.length >= MIN_CHARS }">
            {{ form.favoriteShows.length }} / {{ MIN_CHARS }}
            <span v-if="form.favoriteShows.length >= MIN_CHARS" class="counter-check">✓</span>
          </div>
        </div>

        <p v-if="error" class="survey-error">{{ error }}</p>

        <button
          type="submit"
          class="survey-btn"
          :disabled="!canSubmit || saving"
        >
          {{ saving ? 'Submitting…' : 'Submit and Earn 3,000 Points' }}
        </button>

      </form>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { navigateTo } from '#app'

definePageMeta({
  layout:      'newsite-template',
  middleware:  'newsite',
  showAdbar:   true,
  showNav:     true,
  title:       'Community Survey — Earn 3,000 Points',
  description: 'Share your feedback in the Cartoon ReOrbit community survey and earn 3,000 points.'
})

const MIN_CHARS = 250

// ── Auth ─────────────────────────────────────────────────────────────────────
const { user } = useAuth()
const alreadyDone = computed(() => !!user.value?.surveyComplete)

// ── Form state ────────────────────────────────────────────────────────────────
const form = reactive({ whyJoin: '', howFound: '', favoriteShows: '' })
const saving    = ref(false)
const submitted = ref(false)
const error     = ref('')

const canSubmit = computed(() =>
  form.whyJoin.length      >= MIN_CHARS &&
  form.howFound.length     >= MIN_CHARS &&
  form.favoriteShows.length >= MIN_CHARS
)

// ── Textarea refs for behavioral capture ──────────────────────────────────────
const whyRef   = ref(null)
const howRef   = ref(null)
const showsRef = ref(null)

// Stable session ID for this page visit
const sessionId = crypto.randomUUID()

const { attachTo, detachFrom, stopCapture } = useBehavioralCapture(sessionId)

onMounted(async () => {
  await nextTick()
  if (whyRef.value)   attachTo(whyRef.value,   'whyJoin')
  if (howRef.value)   attachTo(howRef.value,    'howFound')
  if (showsRef.value) attachTo(showsRef.value,  'favoriteShows')
})

onUnmounted(() => {
  stopCapture()
})

// ── Submit ─────────────────────────────────────────────────────────────────────
async function handleSubmit() {
  if (!canSubmit.value || saving.value) return
  error.value = ''
  saving.value = true

  // Flush any pending behavioral events before submitting
  stopCapture()

  try {
    await $fetch('/api/survey/submit', {
      method:      'POST',
      body:        { whyJoin: form.whyJoin, howFound: form.howFound, favoriteShows: form.favoriteShows },
      credentials: 'include',
    })
    submitted.value = true
    // Refresh auth state so surveyComplete is updated across the app
    const { fetchSelf } = useAuth()
    await fetchSelf()
  } catch (e) {
    if (e?.status === 409) {
      // Already submitted in another tab / race
      submitted.value = true
    } else {
      error.value = e?.data?.statusMessage || 'Something went wrong. Please try again.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.survey-page {
  display: flex;
  justify-content: center;
  padding: 24px 16px 48px;
  min-height: 100%;
}

.survey-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  padding: 32px 28px;
  width: 100%;
  max-width: 640px;
  align-self: flex-start;
}

.survey-done-icon {
  font-size: 48px;
  margin-bottom: 12px;
  text-align: center;
}

.survey-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #111;
  margin: 0 0 8px;
  text-align: center;
}

.survey-sub {
  font-size: 0.875rem;
  color: #555;
  margin: 0 0 24px;
  text-align: center;
  line-height: 1.5;
}

.survey-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.survey-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.survey-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #222;
}

.survey-textarea {
  width: 100%;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.875rem;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 0.15s;
  box-sizing: border-box;
  font-family: inherit;
}

.survey-textarea:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}

.textarea-warn {
  border-color: #f59e0b !important;
}

.textarea-ok {
  border-color: #10b981 !important;
}

.char-counter {
  font-size: 0.75rem;
  color: #9ca3af;
  text-align: right;
  transition: color 0.15s;
}

.counter-ok {
  color: #10b981;
  font-weight: 600;
}

.counter-check {
  margin-left: 4px;
}

.survey-btn {
  width: 100%;
  padding: 11px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.survey-btn:hover:not(:disabled) {
  background: #4f46e5;
}

.survey-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.survey-error {
  font-size: 0.85rem;
  color: #dc2626;
  text-align: center;
  margin: 0;
}
</style>
