<template>
  <Teleport to="body">
    <div v-if="visible" class="cms-overlay">
      <div
        ref="modalRef" class="cms-modal" role="dialog" aria-modal="true"
        aria-labelledby="cms-title" @keydown="onModalKeydown"
      >
        <div class="cms-header">
          <h2 id="cms-title" class="cms-title">Choose your cMoon</h2>
          <p class="cms-sub">
            Pick a faction to represent. This can't be changed later, so choose carefully.
          </p>
          <p v-if="deadlineText" class="cms-deadline">Choose by {{ deadlineText }} or you'll be auto-assigned.</p>
        </div>

        <div class="cms-body">
          <div class="cms-options" role="radiogroup" aria-labelledby="cms-title">
            <button
              v-for="(c, idx) in cmoons" :key="c.id"
              type="button"
              class="cms-card"
              :class="{ 'cms-card-selected': choice === c.id, 'cms-card-dim': !!choice && choice !== c.id }"
              role="radio"
              :aria-checked="choice === c.id"
              @click="choice = c.id"
              @keydown="onCardKeydown($event, idx)"
            >
              <span class="cms-poster" :style="{ backgroundColor: safeColor(c.color) }">
                <img
                  v-if="c.imagePath && !imageErrors[c.id]"
                  :src="c.imagePath" alt="" width="600" height="900" loading="eager"
                  @error="onImageError(c.id)"
                />
                <span v-if="choice === c.id" class="cms-badge" aria-hidden="true">✓ Selected</span>
              </span>
              <span class="cms-card-name">{{ c.name }}</span>
              <span class="cms-card-count">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
            </button>
          </div>
          <div v-if="!cmoons.length" class="cms-empty">No cMoons are available yet.</div>
        </div>

        <div v-if="error" class="cms-error" role="alert">{{ error }}</div>

        <div class="cms-footer">
          <button class="cms-confirm-btn" :disabled="!choice || submitting" @click="confirm">
            {{ submitting ? 'Joining…' : 'Confirm cMoon' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const visible = ref(false)
const submitting = ref(false)
const error = ref('')
const cmoons = ref([])
const choice = ref(null)
const deadline = ref(null)
const imageErrors = ref({})
const modalRef = ref(null)

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#3a4a63'
}

function onImageError(id) {
  imageErrors.value = { ...imageErrors.value, [id]: true }
}

const deadlineText = computed(() => {
  if (!deadline.value) return ''
  const d = new Date(deadline.value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
})

async function checkStatus() {
  try {
    // /api/cmoons is public and briefly cached, so fetching it alongside the eligibility check
    // is free — this avoids waiting on it only after status comes back, which used to add a
    // second full round trip before the modal had anything to show.
    const [status, list] = await Promise.all([
      $fetch('/api/cmoon/status'),
      $fetch('/api/cmoons').catch(() => ({ cmoons: [] })),
    ])
    if (!status?.cMoonEnabled || !status.canChoose) return
    deadline.value = status.deadline || null
    cmoons.value = list?.cmoons || []
    visible.value = true
  } catch {
    // Not logged in, or feature off — silently skip.
  }
}

const router = useRouter()
const { play } = useFullscreenEffect()

async function confirm() {
  if (!choice.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const chosenId = choice.value
    await $fetch('/api/cmoon/select', { method: 'POST', body: { cMoonId: chosenId } })
    visible.value = false
    const picked = cmoons.value.find(c => c.id === chosenId)
    const goToCMoon = () => router.push(`/newsite/cmoon/${chosenId}`)
    if (picked?.effectType) play(picked.effectType, { onComplete: goToCMoon })
    else goToCMoon()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Unable to join that cMoon. Please try again.'
  } finally {
    submitting.value = false
  }
}

function focusCardAt(index) {
  const cards = modalRef.value?.querySelectorAll('.cms-card')
  if (!cards?.length) return
  const i = ((index % cards.length) + cards.length) % cards.length
  cards[i].focus()
}

// Arrow-key navigation matches native <input type="radio"> group behavior; Tab/Shift+Tab is
// handled separately below since a non-dismissible modal has no close button to trap focus around.
function onCardKeydown(e, idx) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusCardAt(idx + 1) }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusCardAt(idx - 1) }
}

function onModalKeydown(e) {
  if (e.key !== 'Tab' || !modalRef.value) return
  const focusables = Array.from(modalRef.value.querySelectorAll('button:not(:disabled)'))
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus()
  }
}

watch(visible, async (v) => {
  if (typeof document === 'undefined') return
  // Locking `documentElement` rather than `body`: the newsite layout sets an explicit
  // `overflow-y: scroll` on `<html>` (see app.vue), which breaks body→viewport overflow
  // propagation and let the page keep scrolling behind this "must choose" modal.
  document.documentElement.style.overflow = v ? 'hidden' : ''
  if (v) {
    await nextTick()
    modalRef.value?.querySelector('.cms-card')?.focus()
  }
})

onMounted(checkStatus)
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.documentElement.style.overflow = ''
})
</script>

<style scoped>
.cms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  overscroll-behavior: contain;
}

.cms-modal {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  max-height: 85dvh;
  background: #0a1830;
  border: 2px solid #1a5a9a;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

/* Only 4 cMoons ever exist, so widening the modal (rather than switching Tailwind-style
   viewport breakpoints) is what lets the auto-fit grid below settle into 4 columns instead of 2
   — the grid reflows off the modal's own width, so this is the only breakpoint that matters. */
@media (min-width: 700px) {
  .cms-modal { max-width: 640px; }
}

.cms-header {
  padding: 16px 16px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.cms-title {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 800;
}

.cms-sub {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.cms-deadline {
  margin: 6px 0 0;
  font-size: 0.7rem;
  color: #ffd75e;
  font-weight: 600;
}

.cms-empty {
  padding: 20px 16px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.cms-body {
  padding: 12px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* CSS-only "scroll shadow": two gradients scroll with the content and mask themselves out
     against the two fixed radial shadows behind them, so a hint only shows on the edge that
     still has more to scroll — needed because this grid can run two rows deep on a short phone
     screen with no other affordance that more cMoons are below the fold. */
  background:
    linear-gradient(#0a1830 30%, rgba(10, 24, 48, 0)),
    linear-gradient(rgba(10, 24, 48, 0), #0a1830 70%) 0 100%,
    radial-gradient(farthest-side at 50% 0, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0)),
    radial-gradient(farthest-side at 50% 100%, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0)) 0 100%;
  background-repeat: no-repeat;
  background-color: #0a1830;
  background-size: 100% 24px, 100% 24px, 100% 10px, 100% 10px;
  background-attachment: local, local, scroll, scroll;
}

.cms-options {
  display: grid;
  /* auto-fit (not a fixed 2/4-column split) sizes columns off the modal's real width and
     naturally caps at however many of the (at most 4) cards fit — no viewport breakpoint to
     keep in sync with the max-width rule above. */
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}

.cms-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
}

.cms-card-selected {
  border-color: #ffd75e;
  background: rgba(255, 215, 94, 0.12);
}

/* Dims non-selected cards once a choice is made — the ring alone reads poorly once cards carry
   full-bleed admin-uploaded art instead of a flat color. */
.cms-card-dim {
  opacity: 0.55;
}

@media (hover: hover) and (pointer: fine) {
  .cms-card:hover {
    border-color: rgba(255, 215, 94, 0.45);
  }
}

.cms-poster {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

/* aspect-ratio fallback for older engines: without it, width:100% + no height collapses the
   box to zero height before the image finishes loading. */
@supports not (aspect-ratio: 1 / 1) {
  .cms-poster { height: 0; padding-top: 150%; }
  .cms-poster img { position: absolute; inset: 0; }
}

.cms-poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cms-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: #256e45;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  /* Never rely on the selected border alone against busy, unpredictable admin-uploaded art —
     shape (checkmark) + a solid-background text label both read regardless of the art underneath. */
}

.cms-card-name {
  font-weight: 700;
  font-size: 0.85rem;
  word-break: break-word;
}

.cms-card-count {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
}

.cms-error {
  padding: 0 16px;
  font-size: 0.72rem;
  color: #ff8a8a;
}

.cms-footer {
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cms-confirm-btn {
  width: 100%;
  min-height: 46px;
  border: none;
  border-radius: 8px;
  /* #2e8b57 gave white text only 4.25:1; this clears the 4.5:1 minimum. */
  background: #256e45;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.cms-confirm-btn:disabled {
  background: rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.62);
  cursor: not-allowed;
}

.cms-card:focus-visible,
.cms-confirm-btn:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 2px;
}

/* Short viewports (landscape phones, small-screen split view): the header/footer chrome around
   a 2-row poster grid can otherwise eat most of the available height before any cards show. */
@media (max-height: 700px) {
  .cms-header { padding: 10px 16px 6px; }
  .cms-sub {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }
  .cms-deadline { margin-top: 2px; }
  .cms-body { padding: 8px 16px; }
  .cms-footer { padding: 8px 16px 12px; }
}
</style>
