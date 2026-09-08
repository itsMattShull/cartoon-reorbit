<template>
  <div class="cert-art">
    <div
      v-for="(pos, i) in circlePositions"
      :key="i"
      class="cert-circle"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    >
      <img :src="images[i].assetPath" :alt="images[i].name" />
    </div>

    <div class="cert-content">
      <h1 class="cert-heading">Thank You!</h1>
      <p class="cert-name">{{ username }}</p>
      <p class="cert-member-since">
        Cartoon ReOrbit Member Since<br />
        <span class="cert-date">{{ memberSinceLabel }}</span>
      </p>
      <img class="cert-logo" src="/images/logo-reorbit-blocks.png" alt="Cartoon ReOrbit" />

      <p class="cert-disclaimer">
        Cartoon ReOrbit is an independent, fan-made project — not affiliated with, endorsed by, or sponsored by any intellectual property holder.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  username: { type: String, required: true },
  memberSinceLabel: { type: String, required: true },
  borderImages: { type: Array, default: () => [] }
})

// Design canvas is a fixed logical size (also hardcoded as CERT_WIDTH/CERT_HEIGHT
// in CertificateModal.vue, which scales this element for on-screen preview) —
// the DOM here is always laid out at this resolution so an html2canvas capture
// is crisp regardless of viewport.
const CERT_WIDTH = 1100
const CERT_HEIGHT = 850

// .cert-art below is border-box with this border width. Absolutely positioned
// children (the circles) are placed relative to its padding box — i.e. already
// inset by the border — so the perimeter walk below must lay them out against
// CONTENT_WIDTH/CONTENT_HEIGHT, not the outer CERT_WIDTH/CERT_HEIGHT, or the
// bottom/right circles drift past the padding box and get clipped by `overflow: hidden`.
const BORDER_WIDTH = 10
const CONTENT_WIDTH = CERT_WIDTH - BORDER_WIDTH * 2
const CONTENT_HEIGHT = CERT_HEIGHT - BORDER_WIDTH * 2

const CIRCLE_COUNT = 18
const CIRCLE_SIZE = 64
const INSET = 40 // distance of circle centers from the certificate's inner (content-box) edge
const FALLBACK_IMAGE = { assetPath: '/images/logo-reorbit.png', name: 'Cartoon ReOrbit' }

const images = computed(() => {
  const source = props.borderImages
  if (!source.length) return Array.from({ length: CIRCLE_COUNT }, () => FALLBACK_IMAGE)
  return Array.from({ length: CIRCLE_COUNT }, (_, i) => source[i % source.length])
})

// Walks clockwise around a rectangle's perimeter starting at top-left; t is a
// fraction in [0, 1). Used to lay the border thumbnails evenly around the
// certificate regardless of how many are supplied.
function perimeterPoint(t, w, h) {
  const perimeter = 2 * (w + h)
  let d = t * perimeter
  if (d < w) return { x: d, y: 0 }
  d -= w
  if (d < h) return { x: w, y: d }
  d -= h
  if (d < w) return { x: w - d, y: h }
  d -= w
  return { x: 0, y: h - d }
}

const circlePositions = computed(() => {
  const w = CONTENT_WIDTH - INSET * 2
  const h = CONTENT_HEIGHT - INSET * 2
  return Array.from({ length: CIRCLE_COUNT }, (_, i) => {
    const p = perimeterPoint(i / CIRCLE_COUNT, w, h)
    return { x: p.x + INSET - CIRCLE_SIZE / 2, y: p.y + INSET - CIRCLE_SIZE / 2 }
  })
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');

.cert-art {
  position: relative;
  width: 1100px;
  height: 850px;
  box-sizing: border-box;
  background: linear-gradient(135deg, #eef6ff 0%, #ffffff 55%, #eef6ff 100%);
  border: 10px solid var(--OrbitDarkBlue, #336699);
  border-radius: 12px;
  box-shadow: 0 0 0 4px #ffffff inset, 0 0 0 6px var(--OrbitLightBlue, #3399cc) inset;
  overflow: hidden;
  font-family: 'Nunito', sans-serif;
}

.cert-circle {
  position: absolute;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: #ffffff;
  border: 3px solid #ffffff;
  box-shadow: 0 0 0 2px var(--OrbitDarkBlue, #336699);
}

.cert-circle img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.cert-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 150px;
}

.cert-heading {
  font-family: 'Dancing Script', 'Segoe Script', cursive;
  font-size: 64px;
  font-weight: 700;
  color: var(--OrbitDarkBlue, #336699);
  margin: 0 0 18px;
}

.cert-name {
  font-family: 'Dancing Script', 'Segoe Script', cursive;
  font-size: 46px;
  font-weight: 700;
  color: #1a1a2e;
  border-bottom: 2px solid #ccc;
  padding: 0 24px 8px;
  margin: 0 0 22px;
  max-width: 100%;
  word-break: break-word;
}

.cert-member-since {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #444;
  margin: 0 0 18px;
}

.cert-date {
  font-size: 22px;
  color: var(--OrbitDarkBlue, #336699);
  text-transform: none;
  letter-spacing: normal;
}

.cert-logo {
  width: 220px;
  height: auto;
  margin-top: 14px;
  border-radius: 6px;
  box-shadow: 0 0 0 3px #ffffff, 0 0 0 4px #ddd;
}

.cert-disclaimer {
  text-align: center;
  font-size: 11px;
  color: #888;
  margin: 26px 0 0;
  max-width: 480px;
}
</style>
