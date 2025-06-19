<template>
  <div class="flex flex-col gap-4">
    <!-- Render 3 lanes -->
    <div
      v-for="(lane, i) in lanes"
      :key="i"
      class="bg-white rounded shadow relative overflow-hidden"
      :class="[
        phase !== 'select' && 'pointer-events-none opacity-70',
        phase === 'reveal' && highlightLane(i)
      ]"
      @click="handleLaneClick(i)"
    >
      <!-- Lane header: reveal when lane.revealed -->
      <div
        class="h-10 flex items-center justify-center font-semibold text-sm bg-gray-800 text-white"
      >
        {{ lane.revealed ? lane.name : '??? Unknown Location' }}
      </div>

      <!-- Card grid (player bottom, AI top) -->
      <div class="p-2 grid grid-cols-2 gap-2">
        <!-- AI cards -->
        <div class="flex gap-1 justify-center">
          <img
            v-for="c in lane.ai"
            :key="c.id"
            :src="c.assetPath"
            class="h-14 w-14 object-contain border"
            :alt="c.name"
          />
        </div>

        <!-- Player cards + ghost -->
        <div class="flex gap-1 justify-center">
          <!-- Ghost preview (if any) -->
          <template v-if="ghostInLane(i)">
            <img
              :src="ghostInLane(i).assetPath"
              class="h-14 w-14 object-contain border border-dashed opacity-50"
            />
          </template>

          <img
            v-for="c in lane.player"
            :key="c.id"
            :src="c.assetPath"
            class="h-14 w-14 object-contain border"
            :alt="c.name"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/* ------------------------------------------------------------
   GameBoard – lanes visual + click handler for Select phase
------------------------------------------------------------ */
import { computed } from 'vue'

/* 1️⃣  Declare props and keep a `props` reference */
const props = defineProps({
  lanes:             { type: Array,  required: true },
  phase:             { type: String, required: true },   // select | reveal | setup | gameEnd
  priority:          { type: String, required: true },   // player | ai
  previewPlacements: { type: Array,  default: () => [] },// [{cardId,laneIndex}]
  selected:          { type: [Object, null], default: null }
})

/* 2️⃣  Emit */
const emit = defineEmits(['place'])

/* ---------- helpers ---------- */
function handleLaneClick (idx) {
  emit('place', idx)
}

/* “ghost” = the card you’re preview-placing in this lane (if any) */
function ghostInLane (laneIdx) {
  const sel = props.selected
  return props.previewPlacements.find(
    (p) => p.laneIndex === laneIdx && sel && p.cardId === sel.id
  )
}

/* pulse highlight during the reveal phase */
function highlightLane (idx) {
  if (props.phase !== 'reveal') return ''
  const lane = props.lanes[idx]
  const firstSide = props.priority === 'player' ? lane.player : lane.ai
  if (!firstSide.length) return ''
  const newest = firstSide[firstSide.length - 1]
  return newest.revealedThisTurn ? 'animate-pulse ring-2 ring-indigo-400' : ''
}
</script>


<style scoped>
/* minimal pulse animation if you don't use Tailwind animate util */
@keyframes pulseBorder {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,.8); }
  50%      { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
}
.animate-pulse { animation: pulseBorder 1s infinite; }
</style>
