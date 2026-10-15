<!-- components/newsite/admin/legacy/OgGtoonLookEditor.vue -->
<!-- Live preview + controls for an Original gToon's round-card look: color (UFO Color Sweep swatches),
     heatshield rotation, theme, and the one-shot / ambient effects. Shared by the Add and Edit cToon
     admin forms. v-model:color is the game-rules color (Ctoon.gtoonColor); v-model:cardStyle is the
     cosmetic Ctoon.gtoonCardStyle. -->
<template>
  <div class="space-y-3">
    <!-- Live preview -->
    <div class="rounded-md bg-slate-900 p-3 flex flex-col items-center gap-2">
      <div class="w-48">
        <GtoonCard
          v-if="imageUrl"
          ref="cardRef"
          :image-url="imageUrl"
          :value="value"
          :color="color || 'SILVER'"
          :card-style="cardStyle"
          :mode="previewMode"
          :seed="seed"
          :alt="name"
          effects="full"
          :ambient="runAmbient"
        />
        <div v-else class="aspect-square flex items-center justify-center text-center text-[11px] text-slate-300 border border-dashed border-slate-500 rounded-full px-4">
          Upload a cToon image to preview the card
        </div>
      </div>
      <div class="flex items-center gap-2 text-[11px]">
        <button type="button" class="px-2 py-1 rounded border"
          :class="previewMode === 'signal' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
          @click="previewMode = 'signal'">Signal</button>
        <button type="button" class="px-2 py-1 rounded border"
          :class="previewMode === 'noise' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
          @click="previewMode = 'noise'">Noise (face-down)</button>
        <label class="flex items-center gap-1 text-slate-200 ml-2">
          <input type="checkbox" v-model="runAmbient" /> Ambient loops
        </label>
      </div>
    </div>

    <!-- Color -->
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium">Color</label>
      <div class="grid grid-cols-9 gap-1.5 max-w-sm">
        <button
          v-for="c in GTOON_COLOR_ORDER"
          :key="c"
          type="button"
          :title="titleCase(c)"
          class="aspect-square rounded-full border-2 transition"
          :class="color === c ? 'border-gray-900 ring-2 ring-offset-1 ring-indigo-500' : 'border-gray-300 hover:border-gray-600'"
          :style="{ background: GTOON_PALETTE[c].wvring }"
          @click="$emit('update:color', c)"
        />
      </div>
      <p class="text-[11px] text-gray-500">
        {{ color ? titleCase(color) : 'Select a color' }}. Black/Silver are neutral goal colors; every other color is non-neutral for the color-bonus scoring rule. Changing it plays the UFO Color Sweep in the preview.
      </p>
    </div>

    <!-- Card look -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium">Heatshield rotation <span class="font-normal text-gray-500">({{ cardStyle.rotation }}°)</span></label>
        <input type="range" :min="GTOON_ROTATION_LIMITS.min" :max="GTOON_ROTATION_LIMITS.max" step="1"
          :value="cardStyle.rotation" @input="patch({ rotation: Number($event.target.value) })" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium">Card theme</label>
        <div class="flex gap-1">
          <button v-for="t in GTOON_THEMES" :key="t" type="button" class="flex-1 px-2 py-1 rounded border text-[11px]"
            :class="cardStyle.theme === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
            @click="patch({ theme: t })">{{ titleCase(t) }}</button>
        </div>
      </div>
    </div>

    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" :checked="cardStyle.signalNoise" @change="patch({ signalNoise: $event.target.checked })" />
      Play the Noise → Signal flip when this gToon is revealed
    </label>

    <!-- Effects -->
    <div class="space-y-2">
      <div>
        <p class="text-xs font-medium">One-shot effects <span class="font-normal text-gray-500">(play once on reveal, and on click/hover in the deck builder)</span></p>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
          <div v-for="fx in GTOON_ONE_SHOT_FX" :key="fx.key" class="flex items-center justify-between gap-2">
            <label class="flex items-center gap-1 text-[11px]">
              <input type="checkbox" :checked="cardStyle.oneShot.includes(fx.key)" @change="toggle('oneShot', fx.key, $event.target.checked)" />
              {{ fx.label }}
            </label>
            <button type="button" class="text-[10px] px-1.5 py-0.5 rounded border text-indigo-700 border-indigo-300 disabled:opacity-40"
              :disabled="!imageUrl" @click="cardRef?.playOneShot(fx.key)">Test</button>
          </div>
        </div>
      </div>
      <div>
        <p class="text-xs font-medium">Ambient effects <span class="font-normal text-gray-500">(loop while shown in large views)</span></p>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
          <label v-for="fx in GTOON_AMBIENT_FX" :key="fx.key" class="flex items-center gap-1 text-[11px]">
            <input type="checkbox" :checked="cardStyle.ambient.includes(fx.key)" @change="toggle('ambient', fx.key, $event.target.checked)" />
            {{ fx.label }}
          </label>
        </div>
      </div>

      <!-- Per-effect sliders only appear for the effects that use them -->
      <div v-if="usesFlare" class="flex flex-col gap-1">
        <label class="text-[11px] font-medium">Flare duration <span class="font-normal text-gray-500">({{ cardStyle.params.flareMs }} ms)</span></label>
        <input type="range" :min="GTOON_PARAM_LIMITS.flareMs.min" :max="GTOON_PARAM_LIMITS.flareMs.max" :step="GTOON_PARAM_LIMITS.flareMs.step"
          :value="cardStyle.params.flareMs" @input="patchParam({ flareMs: Number($event.target.value) })" />
      </div>
      <div v-if="cardStyle.oneShot.includes('blackHole')" class="flex flex-col gap-1">
        <label class="text-[11px] font-medium">Black hole duration <span class="font-normal text-gray-500">({{ cardStyle.params.blackHoleMs }} ms)</span></label>
        <input type="range" :min="GTOON_PARAM_LIMITS.blackHoleMs.min" :max="GTOON_PARAM_LIMITS.blackHoleMs.max" :step="GTOON_PARAM_LIMITS.blackHoleMs.step"
          :value="cardStyle.params.blackHoleMs" @input="patchParam({ blackHoleMs: Number($event.target.value) })" />
      </div>
      <div v-if="cardStyle.ambient.includes('lightning')" class="flex flex-col gap-1">
        <label class="text-[11px] font-medium">Lightning delay <span class="font-normal text-gray-500">({{ cardStyle.params.lightningDelay }} ms)</span></label>
        <input type="range" :min="GTOON_PARAM_LIMITS.lightningDelay.min" :max="GTOON_PARAM_LIMITS.lightningDelay.max" :step="GTOON_PARAM_LIMITS.lightningDelay.step"
          :value="cardStyle.params.lightningDelay" @input="patchParam({ lightningDelay: Number($event.target.value) })" />
      </div>
      <label v-if="cardStyle.oneShot.includes('pulse')" class="flex items-center gap-1 text-[11px]">
        <input type="checkbox" :checked="cardStyle.params.pulseLoop" @change="patchParam({ pulseLoop: $event.target.checked })" />
        Loop the pulse
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import GtoonCard from '@/components/GtoonCard.vue'
import {
  GTOON_THEMES, GTOON_ONE_SHOT_FX, GTOON_AMBIENT_FX, GTOON_PARAM_LIMITS, GTOON_ROTATION_LIMITS,
  GTOON_PALETTE, GTOON_COLOR_ORDER, sanitizeGtoonCardStyle
} from '@/utils/gtoonCardStyle'

const props = defineProps({
  color: { type: String, default: '' },
  // always a fully-populated style object (parent holds defaultGtoonCardStyle() / a sanitized loaded value)
  cardStyle: { type: Object, required: true },
  imageUrl: { type: String, default: '' },
  value: { type: [Number, String], default: 0 },
  name: { type: String, default: '' },
  seed: { type: String, default: '' }
})
const emit = defineEmits(['update:color', 'update:cardStyle'])

const cardRef = ref(null)
const previewMode = ref('signal')
const runAmbient = ref(true)

const usesFlare = computed(() =>
  ['prismaFlare', 'lensFlare', 'opticalFlare', 'anamorphicFlare'].some(k => props.cardStyle.oneShot.includes(k)))

const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

function patch(partial) {
  emit('update:cardStyle', sanitizeGtoonCardStyle({ ...props.cardStyle, ...partial }))
}
function patchParam(partial) {
  patch({ params: { ...props.cardStyle.params, ...partial } })
}
function toggle(listKey, fxKey, on) {
  const set = new Set(props.cardStyle[listKey])
  on ? set.add(fxKey) : set.delete(fxKey)
  patch({ [listKey]: [...set] })
}
</script>
