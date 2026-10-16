<template>
  <div ref="containerEl" class="ruffle-player-wrap">
    <div v-if="status === 'loading'" class="ruffle-player-status">Loading…</div>
    <div v-else-if="status === 'error'" class="ruffle-player-status ruffle-player-status-error">
      Couldn't load this Flash content.
    </div>
  </div>
</template>

<script setup>
// Thin wrapper around the self-hosted Ruffle web build (see public/vendor/ruffle/README.md) —
// the ONE place both SWF cToons (components/newsite/MyCzone.vue) and uploaded Flash games
// (pages/newsite/flash-games/[id].vue) go through, so there's a single Ruffle bootstrap/teardown
// implementation rather than two copies drifting apart. Every prop here maps directly onto
// Ruffle's own documented self-hosting API (ruffle.rs/#/finding-ruffle) — this file has no
// opinions of its own about Flash beyond wiring that API up.
const props = defineProps({
  src: { type: String, required: true },
})

const containerEl = ref(null)
const status = ref('loading') // 'loading' | 'ready' | 'error'
let playerEl = null

// Loaded once per page, shared by every RufflePlayer instance on it — Ruffle's own loader script
// is idempotent to call multiple times (window.RufflePlayer is set once), but there's no reason
// to insert more than one <script> tag for it.
let ruffleScriptPromise = null
function loadRuffleScript() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.RufflePlayer?.newest) return Promise.resolve()
  if (ruffleScriptPromise) return ruffleScriptPromise
  ruffleScriptPromise = new Promise((resolve, reject) => {
    window.RufflePlayer = window.RufflePlayer || {}
    // Must be set before ruffle.js runs — it reads this during its own init to know where to
    // fetch the matching wasm/core chunk from, rather than defaulting to Ruffle's own CDN.
    window.RufflePlayer.config = { ...window.RufflePlayer.config, publicPath: '/vendor/ruffle/' }
    const script = document.createElement('script')
    script.src = '/vendor/ruffle/ruffle.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Ruffle'))
    document.head.appendChild(script)
  })
  return ruffleScriptPromise
}

function destroyPlayer() {
  if (playerEl) {
    try { playerEl.remove() } catch {}
    playerEl = null
  }
}

async function mountPlayer() {
  if (typeof window === 'undefined' || !containerEl.value) return
  status.value = 'loading'
  destroyPlayer()
  try {
    await loadRuffleScript()
    const ruffle = window.RufflePlayer.newest()
    playerEl = ruffle.createPlayer()
    playerEl.style.width = '100%'
    playerEl.style.height = '100%'
    containerEl.value.appendChild(playerEl)
    await playerEl.load(props.src)
    status.value = 'ready'
  } catch (err) {
    console.error('[RufflePlayer] failed to load', props.src, err)
    status.value = 'error'
  }
}

onMounted(mountPlayer)
onBeforeUnmount(destroyPlayer)
watch(() => props.src, mountPlayer)
</script>

<style scoped>
.ruffle-player-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.ruffle-player-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  padding: 4px;
  background: rgba(0, 0, 0, 0.2);
}
.ruffle-player-status-error { color: #f87171; }
</style>
