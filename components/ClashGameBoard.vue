<template>
  <div class="flex flex-col items-center gap-6">
    <!-- All 3 lanes, side by side -->
    <div class="flex gap-4 w-full justify-center">
      <div
        v-for="(lane, idx) in lanes"
        :key="idx"
        class="flex flex-col items-center bg-white rounded-lg shadow-lg p-4 w-1/3 transition"
        :class="[
          phase !== 'select'
            ? 'opacity-70 pointer-events-none'
            : 'cursor-pointer hover:ring-2 hover:ring-indigo-300',
          isLaneSelected(idx) ? 'ring-4 ring-indigo-500' : '',
          phase === 'reveal' && highlightLane(idx)
        ]"
        @click="phase === 'select' && place(idx)"
      >
        <!-- AI’s cards (2×2 grid) -->
        <div class="grid grid-cols-2 grid-rows-2 gap-2 mb-3">
          <ClashCToonCard
            v-for="c in lane.ai"
            :key="c.id"
            :card="c"
            :selected="false"
            :afford="null"
            size="small"
          />
        </div>

        <!-- Location + Totals -->
        <div class="flex items-center justify-between w-full bg-gray-100 rounded p-2 mb-3">
          <span class="font-bold text-sm">AI: {{ sumPower(lane.ai) }}</span>
          <div class="text-center">
            <div class="font-semibold text-sm">
              {{ lane.revealed ? lane.name : '???' }}
            </div>
            <div v-if="lane.revealed" class="text-xs text-gray-600 mt-1">
              {{ lane.desc }}
            </div>
          </div>
          <span class="font-bold text-sm">You: {{ sumPower(lane.player) }}</span>
        </div>

        <!-- Player’s cards (2×2 grid) -->
        <div class="grid grid-cols-2 grid-rows-2 gap-2">
          <!-- ghost preview if any -->
          <template v-if="ghostInLane(idx)">
            <img
              :src="ghostInLane(idx).assetPath"
              class="w-full h-20 object-contain border-2 border-dashed rounded opacity-50"
            />
          </template>
          <ClashCToonCard
            v-for="c in lane.player"
            :key="c.id"
            :card="c"
            :selected="false"
            :afford="null"
            size="small"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ClashCToonCard from '@/components/ClashCToonCard.vue'

const props = defineProps({
  lanes:             { type: Array,  required: true },
  phase:             { type: String, required: true },   // select | reveal | setup | gameEnd
  priority:          { type: String, required: true },   // player | ai
  previewPlacements: { type: Array,  default: () => [] },// [{cardId,laneIndex}]
  selected:          { type: [Object, null], default: null }
})
const emit = defineEmits(['place'])

/** Place handler **/
function place(idx) {
  emit('place', idx)
}

/** Which lanes have ghost previews? **/
function ghostInLane(laneIdx) {
  const sel = props.selected
  return props.previewPlacements.find(p => p.laneIndex === laneIdx && sel && p.cardId === sel.id)
}

/** Highlight ring for selection **/
const selectedLanes = computed(() =>
  props.previewPlacements.map(p => p.laneIndex)
)
function isLaneSelected(idx) {
  return selectedLanes.value.includes(idx)
}

/** Pulse animation on reveal **/
function highlightLane(idx) {
  if (props.phase !== 'reveal') return ''
  const lane = props.lanes[idx]
  const firstSide = props.priority === 'player' ? lane.player : lane.ai
  if (!firstSide.length) return ''
  const newest = firstSide[firstSide.length - 1]
  return newest.revealedThisTurn
    ? 'animate-pulse ring-2 ring-indigo-400'
    : ''
}

/** Sum up a side’s power for display **/
function sumPower(cards) {
  return cards.reduce((sum, c) => sum + (c.power || 0), 0)
}
</script>

<style scoped>
@keyframes pulseBorder {
  0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,.8); }
  50%     { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
}
.animate-pulse { animation: pulseBorder 1s infinite; }
</style>
