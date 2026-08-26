<template>
  <div class="cmn-page">
    <div class="cmn-header">
      <button type="button" class="cmn-back" @click="goBack">← Back</button>
      <h1 class="cmn-title">cMoons</h1>
      <p class="cmn-sub">Click on the cMoon you want to visit.</p>
    </div>

    <div v-if="loading" class="cmn-status">Loading…</div>
    <div v-else-if="error" class="cmn-status">{{ error }}</div>
    <div v-else-if="!cmoons.length" class="cmn-status">No cMoons are available yet.</div>

    <!-- auto-fit sizes off the grid's own rendered width (not a viewport media query), so this
         reflows correctly at any container size — including inside `.site-container`'s
         transform:scale() box on desktop, where a viewport-width media query would drift out of
         sync with what's actually rendered (see the `.cmn-page` style comment for the same
         underlying transform:scale() issue). Also naturally handles any cMoon count, from 1 to
         many, with no hardcoded slot layout. -->
    <div v-else class="cmn-grid">
      <NuxtLink
        v-for="c in cmoons" :key="c.id"
        :to="`/newsite/cmoon/${c.id}`"
        class="cmn-tile"
      >
        <span class="cmn-circle">
          <CMoonAvatar :avatar-path="c.avatarPath" :color="c.color" :name="c.name" />
          <span v-if="c.joinLocked" class="cmn-lock" aria-hidden="true">🔒</span>
        </span>
        <span class="cmn-name">
          {{ c.name }}
          <span v-if="c.joinLocked" class="sr-only">(locked — view only)</span>
        </span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
// Recreates the original Cartoon Orbit "click on the world you want to visit" nav screen for
// cMoons. Number of cMoons is admin-controlled and unbounded, so this is a responsive grid (see
// .cmn-grid below) rather than a fixed pixel-coordinate layout — it looks right at 1 cMoon or 20,
// on a 320px phone or a desktop.
const router = useRouter()
const loading = ref(true)
const error = ref('')
const cmoons = ref([])

function goBack() {
  router.push('/newsite/MycWorld')
}

onMounted(async () => {
  try {
    const data = await $fetch('/api/cmoons', { params: { view: 'nav' } })
    cmoons.value = data?.cmoons || []
  } catch {
    error.value = 'Unable to load cMoons right now.'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.cmn-page {
  --cmn-accent: #7ec8ff;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 16px;
  overflow-y: auto;
  /* Dark "console" theme scoped to this component's own box — never `position: fixed` here.
     `.site-container` in layouts/newsite-template.vue applies `transform: scale()` even at
     scale(1), which makes it the containing block for any fixed-position descendant, so a
     fixed-position glow/backdrop would render at the wrong size/place on desktop. Everything
     decorative below is `position: relative`/`absolute` inside this normal-flow box instead. */
  background:
    radial-gradient(ellipse at 50% 0%, rgba(126, 200, 255, 0.12), transparent 60%),
    #061224;
  color: #fff;
  font-family: 'Nunito', sans-serif;
  border-radius: 8px;
}

.cmn-header {
  position: relative;
  text-align: center;
  padding: 4px 0 18px;
}

.cmn-back {
  position: absolute;
  left: 0;
  top: 0;
  min-height: 44px;
  padding: 0 10px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.cmn-back:hover,
.cmn-back:focus-visible {
  color: #fff;
}

.cmn-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.cmn-sub {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
}

.cmn-status {
  padding: 32px 8px;
  text-align: center;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.cmn-grid {
  display: grid;
  /* auto-fit + minmax, same technique as CMoonSelectModal.vue's .cms-options — column count
     falls out of the actual rendered width, no breakpoint bookkeeping needed. */
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 20px 12px;
  justify-items: center;
  padding: 4px 4px 24px;
}

.cmn-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 140px;
  min-height: 44px;
  padding: 8px 4px;
  border-radius: 12px;
  text-decoration: none;
  color: #fff;
  /* Keeps every state (rest/hover/focus) on the same cheap properties — no per-frame box-shadow
     blur growth, which is the jank-prone part of a "glow" effect on low-end mobile GPUs. */
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.cmn-circle {
  position: relative;
  width: 86px;
  height: 86px;
  border-radius: 50%;
  border: 3px solid rgba(126, 200, 255, 0.45);
  background: #0a1830;
  box-shadow: 0 0 0 rgba(126, 200, 255, 0);
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.cmn-name {
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  word-break: break-word;
  line-height: 1.15;
}

.cmn-lock {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #1a2f4d;
  border: 2px solid #061224;
  font-size: 0.8rem;
}

/* Hover highlight only for devices that actually have a real mouse — otherwise touch devices get
   a "sticky hover" that never clears until a second tap elsewhere. */
@media (hover: hover) and (pointer: fine) {
  .cmn-tile:hover .cmn-circle {
    border-color: var(--cmn-accent);
    box-shadow: 0 0 18px 2px rgba(126, 200, 255, 0.55);
  }
  .cmn-tile:hover {
    transform: translateY(-2px);
  }
}

/* Focus gets the same highlight as hover, so keyboard users get an equivalent affordance rather
   than relying on the default outline alone. */
.cmn-tile:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 3px;
  transform: translateY(-2px);
}
.cmn-tile:focus-visible .cmn-circle {
  border-color: var(--cmn-accent);
  box-shadow: 0 0 18px 2px rgba(126, 200, 255, 0.55);
}

.cmn-back:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 2px;
}
</style>
