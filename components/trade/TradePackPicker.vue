<!-- components/trade/TradePackPicker.vue
     Pick sealed packs for one side of a trade, by TYPE and quantity ("2 x Starter Pack") — packs of one type are
     interchangeable, so the server chooses which copies when the offer is created. Nothing here ever sees (or needs) a
     pack's row id, and nothing about a pack beyond its name, art and how many are free to trade.

       <TradePackPicker v-model="offeredPacks" title="Packs to offer" />                       // my own packs
       <TradePackPicker v-model="requestedPacks" :username="them" title="Packs to request" />   // theirs

     modelValue: [{ packId, name, imagePath, quantity }]. Packs aren't valued by the trade estimate, and the section
     says so. Availability counts only packs that are sealed and in neither an auction nor another pending trade. -->
<template>
  <section class="tpp" :aria-label="title">
    <button type="button" class="tpp-head" :aria-expanded="open ? 'true' : 'false'" @click="open = !open">
      <span class="tpp-title">{{ title }}</span>
      <span v-if="selectedTotal" class="tpp-selected">{{ selectedTotal }} selected</span>
      <span class="tpp-caret" :class="{ 'tpp-caret--open': open }" aria-hidden="true">▾</span>
    </button>

    <div v-show="open" class="tpp-body">
      <p v-if="loading" class="tpp-note" role="status">Loading packs…</p>
      <p v-else-if="error" class="tpp-note tpp-note--err" role="alert">
        {{ error }} <button type="button" class="tpp-retry" @click="load">Try again</button>
      </p>
      <p v-else-if="!available.length" class="tpp-note">
        {{ username ? `${username} has no sealed packs available to trade.` : 'You have no sealed packs available to trade.' }}
      </p>

      <ul v-else class="tpp-list">
        <li v-for="g in available" :key="g.packId" class="tpp-row">
          <CtoonImage v-if="g.imagePath" :ctoon="{}" :src="g.imagePath" :alt="g.name" class="tpp-img" loading="lazy" width="40" height="40" />
          <span v-else class="tpp-img tpp-img--empty" aria-hidden="true">🎁</span>
          <span class="tpp-name">
            {{ g.name }}
            <span class="tpp-avail">{{ g.available }} available</span>
          </span>
          <span class="tpp-stepper" role="group" :aria-label="`Quantity of ${g.name}`">
            <button type="button" class="tpp-step" :disabled="qty(g.packId) <= 0" :aria-label="`Fewer ${g.name}`" @click="change(g, -1)">−</button>
            <output class="tpp-qty" aria-live="polite">{{ qty(g.packId) }}</output>
            <button type="button" class="tpp-step" :disabled="qty(g.packId) >= g.available || selectedTotal >= MAX_PACKS_PER_SIDE" :aria-label="`More ${g.name}`" @click="change(g, 1)">+</button>
          </span>
        </li>
      </ul>

      <p v-if="trimmedNote" class="tpp-note tpp-note--warn" role="status">{{ trimmedNote }}</p>
      <p class="tpp-foot">Packs aren’t included in the value estimate. At most {{ MAX_PACKS_PER_SIDE }} per side.</p>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import CtoonImage from '@/components/CtoonImage.vue'
import { MAX_PACKS_PER_SIDE } from '~/server/utils/tradeOfferLimits'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  username: { type: String, default: null }, // null = my own packs
  title: { type: String, default: 'Packs' }
})
const emit = defineEmits(['update:modelValue'])

const open = ref(true)
const loading = ref(true)
const error = ref('')
const available = ref([])        // [{ packId, name, imagePath, available }]
const trimmedNote = ref('')

const selectedTotal = computed(() => props.modelValue.reduce((n, p) => n + p.quantity, 0))
const qty = (packId) => props.modelValue.find(p => p.packId === packId)?.quantity || 0

function set (next) { emit('update:modelValue', next.filter(p => p.quantity > 0)) }

function change (g, delta) {
  const cur = qty(g.packId)
  const q = Math.max(0, Math.min(g.available, cur + delta))
  if (delta > 0 && selectedTotal.value >= MAX_PACKS_PER_SIDE) return
  const others = props.modelValue.filter(p => p.packId !== g.packId)
  set([...others, { packId: g.packId, name: g.name, imagePath: g.imagePath, quantity: q }])
  trimmedNote.value = ''
}

let seq = 0
async function load () {
  const mine = ++seq
  loading.value = true; error.value = ''
  try {
    const q = props.username ? `?username=${encodeURIComponent(props.username)}` : ''
    const res = await $fetch(`/api/trade/user-packs${q}`)
    if (mine !== seq) return
    available.value = res.packs || []
    reconcile()
  } catch (err) {
    if (mine !== seq) return
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Could not load packs.'
  } finally {
    if (mine === seq) loading.value = false
  }
}

// A counter pre-fills quantities from the original offer; some of those packs may have been used since. Clamp to what is
// really available and say so, rather than letting the server reject the whole counter.
function reconcile () {
  let dropped = 0
  const next = []
  for (const p of props.modelValue) {
    const have = available.value.find(a => a.packId === p.packId)?.available || 0
    const q = Math.min(p.quantity, have)
    dropped += p.quantity - q
    if (q > 0) next.push({ ...p, quantity: q })
  }
  if (dropped > 0) {
    trimmedNote.value = `${dropped} pack${dropped === 1 ? ' is' : 's are'} from the original offer no longer available and ${dropped === 1 ? 'was' : 'were'} left out.`
    set(next)
  }
}

onMounted(load)
watch(() => props.username, () => { trimmedNote.value = ''; load() })
</script>

<style scoped>
.tpp { margin: 0 8px 6px; border-radius: 6px; background: rgba(0, 0, 0, 0.25); color: #fff; }
.tpp-head { width: 100%; min-height: 36px; display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: transparent; border: 0; color: inherit; font: inherit; font-size: 0.72rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; text-align: left; }
.tpp-head:focus-visible, .tpp-step:focus-visible, .tpp-retry:focus-visible { outline: 3px solid #fff; outline-offset: -3px; }
.tpp-title { flex: 1; }
.tpp-selected { background: var(--OrbitLightBlue); border-radius: 9px; padding: 0 8px; font-size: 0.66rem; text-transform: none; letter-spacing: 0; }
.tpp-caret { transition: transform 0.15s; }
.tpp-caret--open { transform: rotate(180deg); }
.tpp-body { padding: 0 10px 8px; }
.tpp-note { margin: 4px 0; font-size: 0.78rem; color: rgba(255, 255, 255, 0.8); }
.tpp-note--err { color: #fca5a5; }
.tpp-note--warn { color: #fcd34d; }
.tpp-retry { margin-left: 6px; min-height: 36px; padding: 0 12px; border-radius: 6px; border: 1px solid currentColor; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.tpp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; }
.tpp-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; background: rgba(255, 255, 255, 0.06); border-radius: 6px; }
.tpp-img { flex: 0 0 auto; width: 40px; height: 40px; object-fit: contain; display: inline-flex; align-items: center; justify-content: center; }
.tpp-name { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 0.78rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpp-avail { font-size: 0.66rem; font-weight: normal; color: rgba(255, 255, 255, 0.65); }
.tpp-stepper { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; }
.tpp-step { width: 36px; height: 36px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.35); background: rgba(0, 0, 0, 0.3); color: #fff; font-size: 1.15rem; line-height: 1; cursor: pointer; }
.tpp-step:disabled { opacity: 0.3; cursor: default; }
.tpp-qty { min-width: 28px; text-align: center; font-weight: bold; font-variant-numeric: tabular-nums; }
.tpp-foot { margin: 6px 0 0; font-size: 0.66rem; color: rgba(255, 255, 255, 0.55); }
@media (max-width: 768px) {
  .tpp-head { min-height: 44px; font-size: 0.8rem; }
  .tpp-step { width: 44px; height: 44px; }
  .tpp-row { padding: 6px; }
  .tpp-name { font-size: 0.85rem; }
}
</style>
