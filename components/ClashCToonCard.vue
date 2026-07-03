<template>
  <div
    :class="outerClasses"
    :draggable="afford !== false && !placed"
    @contextmenu.prevent
    @dragstart="dragStart"
    @pointerdown="startPress"
    @pointerup="endPress"
    @pointerleave="cancelPress"
    @pointercancel="cancelPress"
  >
    <!-- placed-this-turn overlay -->
    <div
      v-if="placed"
      class="absolute inset-0 z-10 bg-white/60 flex items-center justify-center rounded pointer-events-none"
    >
      <span class="bg-gray-800 text-white text-[10px] font-bold tracking-wide px-2 py-0.5 rounded -rotate-12 shadow">
        PLAYED
      </span>
    </div>

    <div class="relative w-24 h-24">
      <!-- the toon art -->
      <img
        :src="card.assetPath"
        :alt="card.name"
        class="w-full h-full object-contain"
      />

      <!-- power in the big circle -->
      <div class="absolute" :style="powerStyle">
        <span class="text-white font-bold drop-shadow-lg text-2xl">
          {{ currentPower }}
        </span>
      </div>

      <!-- cost in the small bubble -->
      <div class="absolute" :style="costStyle">
        <span class="text-white font-bold drop-shadow text-[8px]">
          {{ card.cost }}
        </span>
      </div>
    </div>

    <!-- name only when large -->
    <span
      v-if="!isSmall"
      class="font-semibold truncate w-full px-1 mt-1 leading-none text-[11px] text-gray-800"
    >
      {{ card.name }}
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  card:     { type: Object,  required: true },
  selected: { type: Boolean, default: false },
  afford:   { type: Boolean, default: null },    // passed from ClashHand
  placed:   { type: Boolean, default: false },   // already placed on a lane this turn
  size:     { type: String,  default: 'large' }  // 'large' | 'small'
})
const emit = defineEmits(['select','info'])

const currentPower = computed(() => props.card.power)

const isSmall = computed(() => props.size === 'small')
// Long‐press vs short‐press logic:
const PRESS_DURATION = 600  // ms threshold
let pressTimer        = null
let longPressFired    = false

function startPress(evt) {
  if (props.afford === false && !props.placed) return
  evt.preventDefault()
  longPressFired = false

  // start a timer; if it completes, fire “info”
  pressTimer = setTimeout(() => {
    longPressFired = true
    emit('info', props.card)
  }, PRESS_DURATION)
}

function endPress(evt) {
  if (props.afford === false && !props.placed) return
  clearTimeout(pressTimer)

  // if we didn’t already trigger the long-press, it’s a tap → select
  if (!longPressFired && !props.placed) {
    emit('select', props.card)
  }
}

function cancelPress() {
  clearTimeout(pressTimer)
}

// build the container classes
const outerClasses = computed(() => [
  // base layout
  'flex flex-col items-center justify-center select-none transition relative', // transparent if small, white if large
  isSmall.value ? 'bg-transparent' : 'bg-white',
  'w-24 text-xs rounded',

  // only large cards get a border
  !isSmall.value && 'border box-border',

  // small cards are simply scaled down
  // isSmall.value && 'transform scale-75',

  // placed / afford / not afford
  props.placed
    ? 'cursor-not-allowed'
    : (props.afford === false ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'),

  // selected ring
  props.selected && !props.placed && props.afford !== false && 'ring-2 ring-indigo-400',
])

// overlay positions (hard-coded against your 96×96 template)
const DIM = 96
const powerStyle = {
  top:       `${DIM * 0.64}px`,
  left:      `${DIM * 0.657}px`,
  transform: 'translate(-50%, -50%)'
}
const costStyle = {
  top:       `${DIM * 0.473}px`,
  left:      `${DIM * 0.8}px`,
  transform: 'translate(-50%, 0)'
}

function dragStart(evt) {
  if (evt.dataTransfer && props.afford !== false) {
    evt.dataTransfer.setData('ctoon-id', props.card.id)
  }
}

function handleClick() {
  if (props.afford === false) return
  // emit('select', props.card)
  emit('info', props.card)
}
</script>

<style scoped>
/* subtle hover scale for draggable/affordable cards */
.cursor-pointer:hover {
  transform: scale(1.03);
}

/* make the white text pop on the blue bubbles */
.drop-shadow {
  text-shadow: 0 0 2px rgba(0,0,0,0.8);
}
.drop-shadow-lg {
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}

/* disable the iOS “touch callout” on long-press */
:deep(img) {
  -webkit-touch-callout: none;
}
</style>
