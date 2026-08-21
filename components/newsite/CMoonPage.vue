<template>
  <div class="cmp-wrap" :style="paletteStyle">
    <div v-if="loading" class="cmp-status">Loading…</div>
    <div v-else-if="error" class="cmp-status cmp-status--error">{{ error }}</div>
    <template v-else-if="cmoon">
      <div class="cmp-banner">
        <h1 class="cmp-title">{{ cmoon.name }}</h1>
      </div>

      <div class="cmp-body">
        <div class="cmp-image-wrap">
          <img
            v-if="cmoon.pageImagePath"
            :src="cmoon.pageImagePath"
            :alt="`${cmoon.name} cMoon`"
            class="cmp-image"
          />
          <div v-else class="cmp-image-placeholder">No image uploaded yet</div>
        </div>

        <p v-if="cmoon.pageDescription" class="cmp-description">{{ cmoon.pageDescription }}</p>

        <h2 class="cmp-section-title">cToons ({{ cmoon.ctoonCount.toLocaleString() }})</h2>
        <div v-if="!cmoon.ctoons.length" class="cmp-empty">No cToons are displayed under this cMoon yet.</div>
        <div v-else class="cmp-grid">
          <button
            v-for="c in cmoon.ctoons"
            :key="c.id"
            type="button"
            class="cmp-card"
            @click="openInfo(c)"
          >
            <img :src="c.assetPath" :alt="c.name" class="cmp-card-img" loading="lazy" />
            <span class="cmp-card-name">{{ c.name }}</span>
          </button>
        </div>
        <p v-if="cmoon.ctoonsTruncated" class="cmp-truncated-note">
          Showing the first {{ cmoon.ctoons.length.toLocaleString() }} of {{ cmoon.ctoonCount.toLocaleString() }} cToons.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { cMoonPaletteStyle } from '@/utils/cmoonPalette'
import { useCtoonModal } from '@/composables/useCtoonModal'

const route = useRoute()
const { open: openCtoonModal } = useCtoonModal()

const loading = ref(true)
const error = ref('')
const cmoon = ref(null)

const paletteStyle = computed(() => cmoon.value ? cMoonPaletteStyle(cmoon.value.color) : {})

useHead({
  title: computed(() => cmoon.value ? `${cmoon.value.name} · cMoon` : 'cMoon')
})

function openInfo(c) {
  openCtoonModal({ ctoonId: c.id, assetPath: c.assetPath, name: c.name })
}

async function load(id) {
  if (!id) return
  loading.value = true
  error.value = ''
  try {
    cmoon.value = await $fetch(`/api/cmoon/${encodeURIComponent(id)}`)
  } catch (err) {
    cmoon.value = null
    error.value = err?.data?.statusMessage || 'Failed to load this cMoon.'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, (id) => load(id), { immediate: true })
</script>

<style scoped>
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

.cmp-body {
  padding: 16px;
  background: var(--cm-bg, transparent);
  color: var(--cm-text, #ffffff);
  box-sizing: border-box;
}

/* 800x600 (4:3), same resolution as a cZone background. */
.cmp-image-wrap {
  width: 100%;
  max-width: 800px;
  aspect-ratio: 4 / 3;
  margin: 0 auto 16px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
}
@supports not (aspect-ratio: 4 / 3) {
  .cmp-image-wrap { height: 0; padding-bottom: 75%; position: relative; }
  .cmp-image-wrap .cmp-image,
  .cmp-image-wrap .cmp-image-placeholder { position: absolute; inset: 0; }
}

.cmp-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cmp-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
  font-size: 0.9rem;
}

.cmp-description {
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 20px;
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
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

@media (max-width: 768px) {
  .cmp-grid { grid-template-columns: repeat(2, 1fr); }
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
.cmp-card:hover { opacity: 0.85; }
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

.cmp-truncated-note {
  margin-top: 12px;
  font-size: 0.8rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}
</style>
