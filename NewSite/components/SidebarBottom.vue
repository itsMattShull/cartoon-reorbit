<template>
  <div class="sb">
    <img v-if="currentSrc" :src="currentSrc" class="sb-img" alt="" />
  </div>
</template>

<script setup>
// Module-level state — persists across page navigations
let files = []
let idx = 0
let timer = null
let mountCount = 0
const gifDurCache = new Map()

const currentSrc = useState('sidebar-bottom-src', () => '')

function extOf(filename) {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase()
}

async function getGifDurationMs(url) {
  if (gifDurCache.has(url)) return gifDurCache.get(url)
  try {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    if (bytes.length < 6 || String.fromCharCode(...bytes.slice(0, 3)) !== 'GIF') {
      gifDurCache.set(url, 5000)
      return 5000
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
  } catch {
    gifDurCache.set(url, 5000)
    return 5000
  }
}

async function scheduleNext() {
  clearTimeout(timer)
  const src = currentSrc.value
  if (!src) return
  const ext = extOf(src)
  let delay = 5000
  if (ext === '.gif') {
    delay = await getGifDurationMs(src)
  }
  timer = setTimeout(advance, delay)
}

function advance() {
  if (!files.length) return
  idx = (idx + 1) % files.length
  currentSrc.value = `/api/uploads/sidebar_bottom/${files[idx]}`
  scheduleNext()
}

async function init() {
  try {
    const { files: list } = await $fetch('/api/sidebar-bottom')
    if (!list?.length) return
    files = list
    idx = Math.floor(Math.random() * files.length)
    currentSrc.value = `/api/uploads/sidebar_bottom/${files[idx]}`
    scheduleNext()
  } catch {
    // no files available
  }
}

onMounted(() => {
  mountCount++
  if (files.length) {
    scheduleNext()
  } else {
    init()
  }
})

onUnmounted(() => {
  mountCount--
  if (mountCount === 0) clearTimeout(timer)
})
</script>

<style scoped>
.sb {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.sb-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
