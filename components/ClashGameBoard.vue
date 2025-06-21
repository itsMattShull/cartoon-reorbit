<!-- components/ClashGameBoard.vue -->
<template>
  <div class="flex flex-col items-center gap-6">
    <div class="flex w-full justify-center gap-4">
      <div
        v-for="(lane, idx) in lanes"
        :key="idx"
        class="flex flex-col items-center bg-white rounded-lg shadow-lg p-4 w-1/3 transition"
        :class="[
          phase !== 'select'
            ? 'pointer-events-none opacity-70'
            : 'cursor-pointer hover:ring-2 hover:ring-indigo-300',
          isLaneSelected(idx) ? 'ring-4 ring-indigo-500' : '',
          phase === 'reveal' && highlightLane(idx)
        ]"
        @click="phase==='select' && place(idx)"
      >
        <!-- AI’s cards (2×2 grid) -->
        <div
          class="grid grid-cols-2 gap-0.5 mb-3 w-full auto-rows-[9rem]"
        >
          <template v-for="i in 4" :key="i">
            <div class="flex items-center justify-center">
              <ClashCToonCard
                v-if="lane.ai[i-1]"
                :card="lane.ai[i-1]"
                size="small"
              />
              <div v-else class="w-24 h-36"></div>
            </div>
          </template>
        </div>

        <!-- Location + Totals -->
        <div class="flex items-center justify-between w-full bg-gray-100 rounded p-2 mb-3 text-sm">
          <span class="font-bold">AI: {{ sumPower(lane.ai) }}</span>
          <div class="text-center">
            <div class="font-semibold">
              {{ lane.revealed ? lane.name : '???' }}
            </div>
            <div v-if="lane.revealed" class="text-xs text-gray-600">
              {{ lane.desc }}
            </div>
          </div>
          <span class="font-bold">You: {{ sumPower(lane.player) }}</span>
        </div>

        <!-- Player’s cards (2×2 grid + ghosts) -->
        <div
          class="grid grid-cols-2 gap-0.5 w-full auto-rows-[9rem]"
        >
          <template v-for="i in 4" :key="i">
            <div class="flex items-center justify-center">
              <!-- real card -->
              <ClashCToonCard
                v-if="lane.player[i-1]"
                :card="lane.player[i-1]"
                size="small"
              />

              <!-- ghost preview -->
              <ClashCToonCard
                v-else-if="phase==='select' && !confirmed && ghostAtSlot(idx, i-1)"
                :card="ghostAtSlot(idx, i-1)"
                size="small"
                :afford="false"
                class="opacity-50 border-2 border-dashed"
              />

              <!-- invisible placeholder (keeps the slot size fixed) -->
              <div v-else class="w-24 h-36"></div>
            </div>
          </template>
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
  phase:             { type: String, required: true },
  priority:          { type: String, required: true },
  previewPlacements: { type: Array,  default: () => [] },
  selected:          { type: [Object, null], default: null },
  confirmed:         { type: Boolean, required: true }
})
const emit = defineEmits(['place'])

function place(idx) {
  emit('place', idx)
}

function ghostsForLane(laneIdx) {
  return props.previewPlacements
    .filter(p => p.laneIndex === laneIdx)
    .map(p => p.card)
}

function ghostAtSlot(laneIdx, slotIdx) {
  const realCount  = props.lanes[laneIdx].player.length
  const ghosts     = props.previewPlacements.filter(p => p.laneIndex === laneIdx)
  const offset     = slotIdx - realCount
  return offset >= 0 && offset < ghosts.length
    ? ghosts[offset].card
    : null
}

function highlightLane(idx) {
  if (props.phase !== 'reveal') return ''
  const lane = props.lanes[idx]
  const side = props.priority === 'player' ? lane.player : lane.ai
  if (!side.length) return ''
  const newest = side[side.length - 1]
  return newest.revealedThisTurn
    ? 'animate-pulse ring-2 ring-indigo-400'
    : ''
}

const selectedLanes = computed(() =>
  props.previewPlacements.map(p => p.laneIndex)
)
function isLaneSelected(idx) {
  return selectedLanes.value.includes(idx)
}

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
