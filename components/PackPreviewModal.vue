<!-- components/PackPreviewModal.vue
     "What's inside this pack, and what are the odds?" for a pack you OWN (or are trading / can see in an auction).
     Reads GET /api/packs/:id/preview — not the cMart detail endpoint, which 404s for sold-out and gifted packs.
     A real dialog (role, focus, Esc, scroll lock) that fits a phone: sticky header, scrolling body. -->
<template>
  <Teleport to="body">
    <div class="ppm-backdrop" @click.self="$emit('close')">
      <div ref="dialogEl" class="ppm-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown="onKeydown">
        <header class="ppm-head">
          <h2 :id="titleId" class="ppm-title">{{ name || preview?.name || 'Pack' }}</h2>
          <button ref="closeBtn" type="button" class="ppm-x" aria-label="Close" @click="$emit('close')">✕</button>
        </header>

        <div class="ppm-body">
          <p v-if="loading" class="ppm-note" role="status">Loading…</p>
          <div v-else-if="error" class="ppm-note ppm-note--err" role="alert">
            {{ error }}
            <button type="button" class="ppm-retry" @click="load">Try again</button>
          </div>
          <template v-else-if="preview">
            <p class="ppm-hint">Current odds — they can change as cToons sell out.</p>
            <section v-for="g in groups" :key="g.rarity" class="ppm-group">
              <h3 class="ppm-rarity">{{ g.rarity }}</h3>
              <p class="ppm-prob">{{ g.probability }}% chance to receive {{ g.count }} cToon{{ g.count === 1 ? '' : 's' }}</p>
              <ul class="ppm-grid">
                <li v-for="item in g.items" :key="item.ctoonId" class="ppm-item">
                  <span v-if="item.inCmart === false" class="ppm-badge">Pack Exclusive</span>
                  <CtoonImage v-if="item.assetPath" :ctoon="item" :alt="item.name" class="ppm-img" loading="lazy" width="72" height="72" />
                  <SecondEditionOverlay :ctoon="item" />
                  <p class="ppm-name">{{ item.name }}</p>
                  <p class="ppm-weight">{{ item.weight }}% chance</p>
                </li>
              </ul>
            </section>
            <p v-if="!groups.length" class="ppm-note">This pack has nothing in it right now.</p>
          </template>
        </div>

        <footer class="ppm-foot">
          <button type="button" class="ppm-btn" @click="$emit('close')">Close</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import CtoonImage from '@/components/CtoonImage.vue'

const props = defineProps({
  packId: { type: String, required: true },
  name: { type: String, default: '' }
})
defineEmits(['close'])

const titleId = `ppm-title-${Math.random().toString(36).slice(2, 9)}`
const dialogEl = ref(null)
const closeBtn = ref(null)
const loading = ref(true)
const error = ref('')
const preview = ref(null)
let previouslyFocused = null

const groups = computed(() => {
  const p = preview.value
  if (!p) return []
  const byRarity = {}
  for (const o of p.ctoonOptions || []) (byRarity[o.rarity] ||= []).push(o)
  const cfg = Object.fromEntries((p.rarityConfigs || []).map(r => [r.rarity, r]))
  return Object.entries(byRarity).map(([rarity, items]) => ({
    rarity, items,
    probability: cfg[rarity]?.probabilityPercent ?? 0,
    count: cfg[rarity]?.count ?? 0
  }))
})

async function load () {
  loading.value = true; error.value = ''
  try {
    preview.value = await $fetch(`/api/packs/${props.packId}/preview`)
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Could not load this pack’s contents.'
  } finally {
    loading.value = false
  }
}

function onKeydown (e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeBtn.value?.click(); return }
  if (e.key !== 'Tab') return
  const f = [...dialogEl.value.querySelectorAll('button:not([disabled])')]
  if (!f.length) { e.preventDefault(); return }
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
}

onMounted(() => {
  previouslyFocused = document.activeElement
  document.documentElement.classList.add('pro-scroll-lock')
  nextTick(() => closeBtn.value?.focus())
  load()
})
onBeforeUnmount(() => {
  document.documentElement.classList.remove('pro-scroll-lock')
  if (previouslyFocused?.isConnected) previouslyFocused.focus?.()
})
</script>

<style scoped>
.ppm-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center; padding: 12px; overscroll-behavior: contain; }
.ppm-dialog { display: flex; flex-direction: column; width: 100%; max-width: 680px; max-height: 90vh; max-height: calc(100dvh - 24px); background: #fff; color: #1a2a40; border-radius: 12px; overflow: hidden; outline: none; }
.ppm-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 6px 16px; border-bottom: 1px solid #dbe5f3; }
.ppm-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #1a2a40; }
.ppm-x { flex: 0 0 auto; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; background: none; border: none; border-radius: 8px; font-size: 1.25rem; line-height: 1; color: #445; cursor: pointer; }
.ppm-x:focus-visible, .ppm-btn:focus-visible, .ppm-retry:focus-visible { outline: 3px solid #3399cc; outline-offset: 2px; }
.ppm-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px; }
.ppm-hint { margin: 0 0 8px; font-size: 0.78rem; color: #556; }
.ppm-note { margin: 12px 0; color: #334; }
.ppm-note--err { color: #7a1d1d; background: #fdecec; padding: 12px; border-radius: 8px; }
.ppm-retry { margin-left: 8px; min-height: 44px; padding: 0 14px; border-radius: 8px; border: 2px solid #7a1d1d; background: #fff; color: #7a1d1d; font-weight: 700; cursor: pointer; }
.ppm-group { margin-bottom: 14px; }
.ppm-rarity { margin: 0; font-size: 0.95rem; color: #1a2a40; text-transform: capitalize; }
.ppm-prob { margin: 2px 0 8px; font-size: 0.78rem; color: #445; }
.ppm-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.ppm-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; background: #f5f8ff; border: 1px solid #c7d8f0; border-radius: 8px; }
.ppm-img { width: 72px; height: 72px; object-fit: contain; margin-top: 12px; }
.ppm-badge { position: absolute; top: 4px; left: 4px; background: #7c3aed; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 1px 5px; border-radius: 8px; }
.ppm-name { margin: 0; font-size: 0.72rem; font-weight: 700; text-align: center; color: #1a2a40; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ppm-weight { margin: 0; font-size: 0.68rem; color: #445; }
.ppm-foot { flex: 0 0 auto; padding: 10px 12px; border-top: 1px solid #dbe5f3; }
.ppm-btn { width: 100%; min-height: 44px; border-radius: 8px; border: 2px solid var(--OrbitDarkBlue, #336699); background: var(--OrbitDarkBlue, #336699); color: #fff; font-size: 0.95rem; font-weight: 700; cursor: pointer; }
@media (max-width: 768px) {
  .ppm-backdrop { padding: 8px; }
  .ppm-dialog { max-height: calc(100dvh - 16px); }
  .ppm-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
