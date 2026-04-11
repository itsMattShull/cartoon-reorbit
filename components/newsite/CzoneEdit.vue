<template>
  <div class="czew">

    <!-- ── Tabs ── -->
    <div class="czew-tabs">
      <button
        v-for="tab in TABS" :key="tab.id"
        class="czew-tab" :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <!-- ── cToons panel ── -->
    <div v-show="activeTab === 'ctoons'" class="czew-panel">
      <div class="czew-filters">
        <div class="czew-search">
          <span class="czew-search-icon">&#9906;</span>
          <input type="text" v-model="search" placeholder="Search…" />
        </div>
        <div class="czew-rarity-grid">
          <button
            v-for="r in RARITIES" :key="r.value"
            class="czew-rb" :class="[r.cls, { active: activeRarities.includes(r.value) }]"
            @click="toggleRarity(r.value)"
          >{{ r.label }}</button>
        </div>
        <select class="czew-select" v-model="selectedSeries">
          <option value="">All Series</option>
          <option v-for="s in seriesList" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="czew-grid">
        <div v-if="cz.loadingCollection" class="czew-empty" style="grid-column:1/-1">Loading…</div>
        <template v-else>
          <div
            v-for="c in filteredCollection" :key="c.id"
            class="czew-toon-wrap"
            :class="{ 'in-zone': currentZoneToonIds.has(c.id) }"
            @mousedown.prevent="!currentZoneToonIds.has(c.id) && startDrag(c, $event)"
          >
            <img :src="c.assetPath" :alt="c.name" :title="c.name" draggable="false" class="czew-toon" />
            <div v-if="currentZoneToonIds.has(c.id)" class="czew-toon-overlay" />
          </div>
          <div v-if="!filteredCollection.length" class="czew-empty" style="grid-column:1/-1">No cToons found.</div>
        </template>
      </div>
    </div>

    <!-- ── Background panel ── -->
    <div v-show="activeTab === 'bg'" class="czew-panel">
      <div class="czew-bg-grid">
        <img
          v-for="bg in cz.backgrounds" :key="bg.id"
          :src="`/backgrounds/${bg.filename}`"
          :alt="bg.filename"
          class="czew-bg-item"
          :class="{ 'czew-bg-active': currentZoneBg === bg.filename }"
          @click="selectBg(bg.filename)"
        />
        <div v-if="!cz.backgrounds.length" class="czew-empty" style="grid-column:1/-1">No backgrounds available.</div>
      </div>
    </div>

    <!-- ── Actions ── -->
    <div class="czew-actions">
      <button class="czew-btn czew-save" :disabled="cz.saving" @click="$emit('save')">
        {{ cz.saving ? 'Saving…' : 'Save' }}
      </button>
      <button class="czew-btn czew-clear" @click="$emit('clear')">Remove All</button>
    </div>

  </div>
</template>

<script setup>
defineEmits(['save', 'clear'])

const cz = useNewSiteCzoneState()

const TABS = [
  { id: 'ctoons', label: 'cToons' },
  { id: 'bg',     label: 'Background' },
]

const RARITIES = [
  { value: 'common',       label: 'C',  cls: 'czew-rb-common'       },
  { value: 'uncommon',     label: 'U',  cls: 'czew-rb-uncommon'     },
  { value: 'rare',         label: 'R',  cls: 'czew-rb-rare'         },
  { value: 'very rare',    label: 'VR', cls: 'czew-rb-very-rare'    },
  { value: 'crazy rare',   label: 'CR', cls: 'czew-rb-crazy-rare'   },
  { value: 'prize only',   label: 'PO', cls: 'czew-rb-prize-only'   },
  { value: 'code only',    label: 'CO', cls: 'czew-rb-code-only'    },
  { value: 'auction only', label: 'AO', cls: 'czew-rb-auction-only' },
]

const activeTab       = ref('ctoons')
const search          = ref('')
const activeRarities  = ref([])
const selectedSeries  = ref('')

const currentZoneBg = computed(() => cz.value.zones[cz.value.activeZone]?.background ?? '')

const currentZoneToonIds = computed(() =>
  new Set((cz.value.zones[cz.value.activeZone]?.toons ?? []).map(t => t.id))
)

const seriesList = computed(() =>
  [...new Set(cz.value.collection.map(c => c.series).filter(Boolean))].sort()
)

const filteredCollection = computed(() => {
  const q = search.value.toLowerCase()
  const rs = activeRarities.value
  const s  = selectedSeries.value
  return cz.value.collection.filter(c => {
    if (q  && !(c.name   || '').toLowerCase().includes(q))    return false
    if (rs.length && !rs.includes((c.rarity || '').toLowerCase())) return false
    if (s  && c.series !== s)                                  return false
    return true
  })
})

function toggleRarity(val) {
  const idx = activeRarities.value.indexOf(val)
  if (idx === -1) activeRarities.value.push(val)
  else            activeRarities.value.splice(idx, 1)
}

function startDrag(ctoon, e) {
  cz.value.activeDrag = { ctoon }
  cz.value.ghostX     = e.clientX
  cz.value.ghostY     = e.clientY
}

function selectBg(filename) {
  cz.value.zones[cz.value.activeZone].background = filename
}
</script>

<style scoped>
.czew {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 4px;
  box-sizing: border-box;
  gap: 4px;
}

/* ── Tabs ── */
.czew-tabs {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.czew-tab {
  flex: 1;
  padding: 3px 4px;
  border-radius: 4px 4px 0 0;
  border: 1px solid rgba(255,255,255,0.12);
  border-bottom: none;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.45);
  font-size: 0.62rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  text-align: center;
}
.czew-tab.active { background: rgba(0,0,0,0.35); color: #fff; border-color: rgba(255,255,255,0.22); }

/* ── Panel ── */
.czew-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 4px;
}

/* ── Filters ── */
.czew-filters { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }

.czew-search {
  display: flex;
  align-items: center;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 3px 8px;
  gap: 4px;
}
.czew-search-icon { font-size: 0.7rem; color: rgba(255,255,255,0.4); }
.czew-search input {
  background: none; border: none; outline: none;
  color: #fff; font-size: 0.72rem; width: 100%; padding: 0;
}
.czew-search input::placeholder { color: rgba(255,255,255,0.35); }

.czew-rarity-grid { display: flex; flex-wrap: wrap; gap: 3px; }

.czew-rb {
  border: none; border-radius: 4px; padding: 2px 5px;
  font-size: 0.6rem; font-weight: bold; cursor: pointer;
  opacity: 0.4; transition: opacity 0.15s; white-space: nowrap;
}
.czew-rb.active { opacity: 1; }
.czew-rb:hover  { opacity: 0.85; }

.czew-rb-common       { background: #6b7280; color: #fff; }
.czew-rb-uncommon     { background: #e5e7eb; color: #111; }
.czew-rb-rare         { background: #16a34a; color: #fff; }
.czew-rb-very-rare    { background: #2563eb; color: #fff; }
.czew-rb-crazy-rare   { background: #7c3aed; color: #fff; }
.czew-rb-prize-only   { background: #111;    color: #e5e7eb; }
.czew-rb-code-only    { background: #ea580c; color: #fff; }
.czew-rb-auction-only { background: #eab308; color: #111; }

.czew-select {
  width: 100%;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: #fff; font-size: 0.72rem;
  padding: 3px 6px; outline: none; cursor: pointer;
}
.czew-select option { background: #1a3a58; }

/* ── cToon grid ── */
.czew-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
  flex: 1;
  min-height: 0;
  align-content: start;
}

.czew-toon-wrap {
  position: relative;
  width: 100%;
  cursor: grab;
  user-select: none;
}
.czew-toon-wrap.in-zone { cursor: default; }
.czew-toon-wrap:not(.in-zone):hover .czew-toon { background: rgba(0,0,0,0.4); }

.czew-toon {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: rgba(0,0,0,0.25);
  border-radius: 4px;
  padding: 3px;
  image-rendering: pixelated;
  box-sizing: border-box;
}

.czew-toon-overlay {
  position: absolute;
  inset: 0;
  background: rgba(90, 90, 90, 0.6);
  border-radius: 4px;
  pointer-events: none;
}

/* ── Background grid ── */
.czew-bg-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
  flex: 1;
  min-height: 0;
  align-content: start;
}

.czew-bg-item {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  background: rgba(0,0,0,0.25);
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  display: block;
  box-sizing: border-box;
}
.czew-bg-item:hover  { border-color: rgba(255,165,0,0.5); }
.czew-bg-active      { border-color: #f47b00 !important; }

/* ── Empty ── */
.czew-empty {
  font-size: 0.7rem; color: rgba(255,255,255,0.4);
  font-style: italic; padding: 6px 2px;
}

/* ── Actions ── */
.czew-actions { display: flex; gap: 4px; flex-shrink: 0; }

.czew-btn {
  flex: 1; padding: 4px;
  border-radius: 4px; border: none;
  font-size: 0.7rem; font-weight: bold;
  color: #fff; cursor: pointer;
}
.czew-btn:disabled { opacity: 0.5; cursor: default; }
.czew-save  { background: #2e7d32; }
.czew-save:hover:not(:disabled)  { filter: brightness(1.1); }
.czew-clear { background: #b03a2e; }
.czew-clear:hover { filter: brightness(1.1); }
</style>
