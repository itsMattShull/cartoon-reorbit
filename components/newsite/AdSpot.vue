<template>
  <a v-if="isExternal" :href="linkHref" target="_blank" rel="noopener noreferrer" class="adspot">
    <img v-if="currentSrc" :src="currentSrc" alt="Advertisement" />
  </a>
  <NuxtLink v-else :to="linkHref" class="adspot">
    <img v-if="currentSrc" :src="currentSrc" alt="Advertisement" />
  </NuxtLink>
</template>

<script setup>
const currentSrc = ref('')
const currentUrl = ref('')
const siteOrigin = ref('')

const isExternal = computed(() => {
  const url = currentUrl.value
  if (!url) return false
  try {
    return new URL(url).origin !== siteOrigin.value
  } catch {
    return false
  }
})

const linkHref = computed(() => currentUrl.value || '/newsite/home')

let adOrder = []
let adIdx = 0
let timer = null
const gifDurCache = new Map()
const abortCtrl = new AbortController()

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nextAd() {
  if (!adOrder.length) return
  adIdx = (adIdx + 1) % adOrder.length
  const current = adOrder[adIdx]
  currentSrc.value = current?.imagePath || ''
  currentUrl.value = (current?.url || '').trim()
  scheduleNext()
}

function extOf(url) {
  try {
    const u = new URL(url, window.location.origin)
    const m = u.pathname.toLowerCase().match(/\.(gif|png|jpe?g|webp|svg)$/i)
    return m ? m[1] : ''
  } catch {
    const m = (url || '').toLowerCase().match(/\.(gif|png|jpe?g|webp|svg)(?:\?|#|$)/i)
    return m ? m[1] : ''
  }
}

async function getGifDurationMs(url) {
  if (gifDurCache.has(url)) return gifDurCache.get(url)
  const res = await fetch(url, { signal: abortCtrl.signal })
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length < 6 || String.fromCharCode(...bytes.slice(0, 3)) !== 'GIF') {
    gifDurCache.set(url, 6000)
    return 6000
  }
  let i = 6 + 7
  const gctFlag = (bytes[10] & 0x80) !== 0
  if (gctFlag) i += 3 * (2 ** ((bytes[10] & 0x07) + 1))
  let totalHundredths = 0
  let lastDelay = 0
  while (i < bytes.length) {
    const b = bytes[i++]
    if (b === 0x3B) break
    if (b === 0x21) {
      const label = bytes[i++]
      if (label === 0xF9) {
        const blockSize = bytes[i++]
        if (blockSize === 4) {
          lastDelay = (bytes[i + 2] << 8) | bytes[i + 1]
          i += 4
        } else {
          i += blockSize
        }
        i++
      } else {
        let size = bytes[i++]
        while (size && i < bytes.length) { i += size; size = bytes[i++] }
      }
    } else if (b === 0x2C) {
      i += 9
      const packed = bytes[i - 1]
      if ((packed & 0x80) !== 0) i += 3 * (2 ** ((packed & 0x07) + 1))
      i++
      let size = bytes[i++]
      while (size && i < bytes.length) { i += size; size = bytes[i++] }
      totalHundredths += Math.max(lastDelay, 1)
      lastDelay = 0
    } else {
      break
    }
  }
  const ms = Math.max(totalHundredths * 10, 500)
  gifDurCache.set(url, ms)
  return ms
}

async function scheduleNext() {
  clearTimeout(timer)
  const src = currentSrc.value
  if (!src) return
  const shownAt = Date.now()
  try {
    if (extOf(src) === 'gif') {
      const ms = await getGifDurationMs(src)
      const remaining = Math.max(ms - (Date.now() - shownAt), 100)
      timer = setTimeout(nextAd, remaining)
    } else {
      timer = setTimeout(nextAd, 8000)
    }
  } catch {
    timer = setTimeout(nextAd, 8000)
  }
}

async function initAds() {
  try {
    const res = await $fetch('/api/ads', { params: { take: 100 } })
    const items = Array.isArray(res?.items) ? res.items : []
    const ads = items
      .filter(i => i?.imagePath)
      .map(i => ({ imagePath: i.imagePath, url: i?.url || '' }))
    if (!ads.length) return
    adOrder = shuffle(ads)
    adIdx = Math.floor(Math.random() * adOrder.length)
    const current = adOrder[adIdx]
    currentSrc.value = current?.imagePath || ''
    currentUrl.value = (current?.url || '').trim()
    scheduleNext()
  } catch {
    // no ads available
  }
}

onMounted(() => {
  siteOrigin.value = window.location.origin
  initAds()
})
onUnmounted(() => {
  clearTimeout(timer)
  abortCtrl.abort()
})
</script>

<style scoped>
.adspot {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.adspot img {
  display: block;
  width: 100%;
  height: auto;
}
</style>
