<template>
  <NuxtLink v-if="!hasPromoUrl" to="/newsite/home" class="orbit-spot">
    <img v-if="currentSrc" :src="currentSrc" alt="" />
  </NuxtLink>
  <a v-else :href="currentUrl" target="_blank" rel="noopener noreferrer" class="orbit-spot">
    <img v-if="currentSrc" :src="currentSrc" alt="" />
  </a>
</template>

<script setup>
const currentSrc = ref('')
const currentUrl = ref('')

const hasPromoUrl = computed(() => !!currentUrl.value)

let promoOrder = []
let promoIdx = 0
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

function nextPromo() {
  if (!promoOrder.length) return
  promoIdx = (promoIdx + 1) % promoOrder.length
  const current = promoOrder[promoIdx]
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
      timer = setTimeout(nextPromo, remaining)
    } else {
      timer = setTimeout(nextPromo, 8000)
    }
  } catch {
    timer = setTimeout(nextPromo, 8000)
  }
}

async function initPromos() {
  try {
    const res = await $fetch('/api/promotions', { params: { take: 100 } })
    const items = Array.isArray(res?.items) ? res.items : []
    const promos = items
      .filter(i => i?.imagePath)
      .map(i => ({ imagePath: i.imagePath, url: i?.url || '' }))
    if (!promos.length) return
    promoOrder = shuffle(promos)
    promoIdx = Math.floor(Math.random() * promoOrder.length)
    const current = promoOrder[promoIdx]
    currentSrc.value = current?.imagePath || ''
    currentUrl.value = (current?.url || '').trim()
    scheduleNext()
  } catch {
    // no promos available
  }
}

onMounted(() => {
  initPromos()
})
onUnmounted(() => {
  clearTimeout(timer)
  abortCtrl.abort()
})
</script>

<style scoped>
.orbit-spot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.orbit-spot img {
  display: block;
  width: 100%;
  height: auto;
}
</style>
