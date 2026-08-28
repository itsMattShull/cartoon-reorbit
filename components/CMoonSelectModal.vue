<template>
  <Teleport to="body">
    <div v-if="visible" class="cms-overlay">
      <div
        ref="modalRef" class="cms-modal" role="dialog" aria-modal="true"
        aria-labelledby="cms-title" @keydown="onModalKeydown"
      >
        <div class="cms-header">
          <button v-if="preview" type="button" class="cms-preview-close" aria-label="Close preview" @click="closePreview">✕</button>
          <h2 id="cms-title" class="cms-title">Choose your cMoon</h2>
          <p class="cms-sub">
            Pick a faction to represent — this can't be changed once you join. Not ready? Skip for
            now and join anytime later from the cMoons page.
          </p>
          <p v-if="preview" class="cms-preview-badge">Admin preview — this is exactly what new players see. Nothing here is saved.</p>
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
          <button v-if="!preview" type="button" class="cms-skip-btn" :disabled="submitting" @click="skip">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// `preview` lets admin re-use this exact component (same markup, same joinLocked-filtered
// /api/cmoons feed, same CSS) to show what new players see, without any of the real
// self-selection side effects. Visibility is then driven by v-model (modelValue) instead of the
// player flow's own internal eligibility check (checkStatus), and confirm() never calls the real
// mutating select endpoint — it only plays the chosen cMoon's effect (if any), so an admin who
// already belongs to a cMoon can preview repeatedly with zero side effects.
const props = defineProps({
  preview: { type: Boolean, default: false },
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const submitting = ref(false)
const error = ref('')
const cmoons = ref([])
const choice = ref(null)
const imageErrors = ref({})
const modalRef = ref(null)

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#3a4a63'
}

function onImageError(id) {
  imageErrors.value = { ...imageErrors.value, [id]: true }
}

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
    cmoons.value = list?.cmoons || []
    visible.value = true
  } catch {
    // Not logged in, or feature off — silently skip.
  }
}

// Force-open from the "Join a cMoon" button on /newsite/cmoon-nav — for a player who opted out
// (or otherwise has no cMoon) and wants back in. Bypasses canChoose entirely, since being here
// means they're asking on purpose; loads the real (non-preview) cmoons list and reuses the exact
// same confirm()/select flow as the automatic prompt.
//
// Two admin-configurable safeguards apply ONLY to a player who previously opted out (never to a
// first-time chooser, an edge case covered by the final else below): a rejoin cooldown
// (GlobalGameConfig.cMoonOptOutCooldownDays, off cMoonOptedOutAt) and a per-cMoon
// allowOptOutJoin toggle. CMoonNav.vue already re-fetches status and hides this button entirely
// while the cooldown is active, so reaching here mid-cooldown is a rare race (e.g. a stale tab) —
// handled the same "silently skip" way as every other failure mode in this function, since the
// real enforcement is server-side in selectCMoonForUser regardless of what this shows.
const { requested } = useCMoonJoinModal()
async function openManually() {
  error.value = ''
  choice.value = null
  try {
    const [status, list] = await Promise.all([
      $fetch('/api/cmoon/status'),
      $fetch('/api/cmoons').catch(() => ({ cmoons: [] })),
    ])
    if (!status?.cMoonEnabled) return
    const rejoinAt = status.cMoonRejoinAvailableAt ? new Date(status.cMoonRejoinAvailableAt) : null
    if (rejoinAt && new Date() < rejoinAt) return

    const all = list?.cmoons || []
    cmoons.value = status.cMoonOptedOut ? all.filter(c => c.allowOptOutJoin !== false) : all
    visible.value = true
  } catch {
    // Not logged in, or feature off — silently skip, same as checkStatus above.
  }
}
if (!props.preview) {
  watch(requested, (v) => { if (v > 0) openManually() })
}

// Admin preview: same /api/cmoons feed as the real flow (so joinLocked cMoons stay excluded
// exactly like they would for a new player), but skips the eligibility check entirely — an admin
// previewing this doesn't need canChoose:true, that's the whole point.
async function loadPreview() {
  error.value = ''
  choice.value = null
  try {
    const list = await $fetch('/api/cmoons').catch(() => ({ cmoons: [] }))
    cmoons.value = list?.cmoons || []
  } catch {
    cmoons.value = []
  }
}

function closePreview() {
  visible.value = false
  emit('update:modelValue', false)
}

const router = useRouter()
const { play } = useFullscreenEffect()

async function confirm() {
  if (!choice.value || submitting.value) return
  submitting.value = true
  error.value = ''

  if (props.preview) {
    // Never calls the real mutating select endpoint — this is a look, not a join. Mirrors the
    // real flow's ordering (close the picker, then play the effect) rather than navigating
    // anywhere afterward, since there's no real cMoon page to land an admin preview on.
    const picked = cmoons.value.find(c => c.id === choice.value)
    closePreview()
    if (picked?.effectType) play(picked.effectType)
    submitting.value = false
    return
  }

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

async function skip() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/cmoon/opt-out', { method: 'POST' })
    visible.value = false
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Unable to skip right now. Please try again.'
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

if (props.preview) {
  // Preview visibility is fully controlled by the parent via v-model — no auto eligibility
  // check, and no independent internal open/close beyond mirroring the prop.
  watch(() => props.modelValue, async (v) => {
    if (v) await loadPreview()
    visible.value = v
  }, { immediate: true })
} else {
  onMounted(checkStatus)
}

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

/* Cartoon selection is data-driven (any number of cMoons, currently 5), so widening the modal
   (rather than switching Tailwind-style viewport breakpoints) is what lets the auto-fit grid
   below settle into more columns on a wider screen — the grid reflows off the modal's own width,
   so this is the only breakpoint that matters. */
@media (min-width: 700px) {
  .cms-modal { max-width: 720px; }
}

.cms-header {
  position: relative;
  padding: 16px 16px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.cms-preview-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.1rem;
  cursor: pointer;
}
.cms-preview-close:hover,
.cms-preview-close:focus-visible {
  color: #fff;
}

.cms-preview-badge {
  margin: 6px 40px 0 0;
  font-size: 0.68rem;
  font-weight: 700;
  color: #ffd75e;
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
  /* auto-fit (not a fixed column-count split) sizes columns off the modal's real width and
     naturally caps at however many cards fit — no viewport breakpoint to keep in sync with the
     max-width rule above. minmax's floor is tuned so 5 cards fit one row at the ≥700px
     breakpoint's 720px width (5*112 + 4*10 gap = 600px) without going so narrow that 2-3 cards
     get uncomfortably thin on a phone. */
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
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
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.cms-skip-btn {
  width: 100%;
  min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.cms-skip-btn:disabled {
  color: rgba(255, 255, 255, 0.35);
  cursor: not-allowed;
}
@media (hover: hover) and (pointer: fine) {
  .cms-skip-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.45);
    color: #fff;
  }
}

.cms-card:focus-visible,
.cms-confirm-btn:focus-visible,
.cms-skip-btn:focus-visible {
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
  .cms-body { padding: 8px 16px; }
  .cms-footer { padding: 8px 16px 12px; }
}
</style>
