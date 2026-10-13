<!-- components/oggtoons/OgGtoonInfoModal.vue -->
<!-- The printed ("default") properties of an Original gToon. Opened by right-clicking (desktop) or long-pressing
     (mobile / tablet) a card, via composables/useOgGtoonInfo. Mount it once per screen. -->
<template>
  <Modal v-if="isOpen" :hide-close-button="true" :close-on-backdrop="true" :overflow-visible="true" @close="close">
    <div class="text-white relative" role="dialog" aria-modal="true" :aria-label="`${shown.name} properties`">
      <div class="flex items-start gap-4">
        <div class="w-32 flex-shrink-0">
          <GtoonCard
            v-if="shown.assetPath"
            :image-url="shown.assetPath"
            :value="shown.value"
            :color="shown.color"
            :card-style="shown.cardStyle"
            :seed="String(shown.ctoonId || shown.name)"
            :alt="shown.name"
            effects="full"
          />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="text-xl font-semibold leading-tight break-words">{{ shown.name }}</h3>
          <p class="text-xs text-gray-300">Original gToon</p>
          <span v-if="detail?.power?.isSlam" class="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-black px-1.5 py-0.5 rounded">Slam gToon</span>
        </div>
      </div>

      <dl class="mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt class="text-gray-400">Value</dt>
        <dd class="font-semibold">{{ shown.value }}</dd>

        <dt class="text-gray-400">Color</dt>
        <dd class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-full border border-white/40" :style="{ background: colorHex }"></span>
          {{ ogTitleCase(shown.color) }}
          <span class="text-[11px] text-gray-400">{{ neutral ? '(neutral)' : '' }}</span>
        </dd>

        <template v-if="detail">
          <dt class="text-gray-400">Type</dt>
          <dd>{{ detail.types.length ? detail.types.map(ogTitleCase).join(', ') : '—' }}</dd>

          <dt class="text-gray-400">Group</dt>
          <dd>{{ detail.group ? (OG_GROUP_LABELS[detail.group] || detail.group) : '—' }}</dd>

          <dt class="text-gray-400">Power</dt>
          <dd>
            <template v-if="detail.power.isSlam">{{ detail.power.description || 'Custom power (see the Game Log for how it plays out).' }}</template>
            <template v-else>No power</template>
          </dd>

          <template v-if="detail.characters.length">
            <dt class="text-gray-400">Characters</dt>
            <dd>{{ detail.characters.join(', ') }}</dd>
          </template>
        </template>
      </dl>

      <p v-if="loading && !detail" class="mt-3 text-xs text-gray-400 animate-pulse">Loading properties…</p>
      <p v-else-if="error" class="mt-3 text-xs text-red-300">{{ error }}</p>
      <p class="mt-3 text-[11px] text-gray-400">Printed properties. During a match a card's value and color can change from powers.</p>

      <div class="mt-4 flex justify-end">
        <button type="button" class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-sm" @click="close">Close</button>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import Modal from '@/components/Modal.vue'
import GtoonCard from '@/components/GtoonCard.vue'
import { useOgGtoonInfo } from '@/composables/useOgGtoonInfo'
import { OG_GROUP_LABELS, ogTitleCase } from '@/utils/ogGtoonLabels'
import { GTOON_PALETTE } from '@/utils/gtoonCardStyle'

const { isOpen, base, detail, loading, error, close } = useOgGtoonInfo()

// The server's printed values win as soon as they arrive; until then show what the card already told us.
const shown = computed(() => ({
  ctoonId: detail.value?.id ?? base.value?.ctoonId ?? null,
  name: detail.value?.name ?? base.value?.name ?? 'gToon',
  assetPath: detail.value?.assetPath ?? base.value?.assetPath ?? '',
  color: detail.value?.gtoonColor ?? base.value?.color ?? 'SILVER',
  value: detail.value?.gtoonValue ?? base.value?.value ?? 0,
  cardStyle: detail.value?.gtoonCardStyle ?? base.value?.cardStyle ?? null
}))
const colorHex = computed(() => GTOON_PALETTE[shown.value.color]?.wvring || '#c0c0c0')
const neutral = computed(() => shown.value.color === 'BLACK' || shown.value.color === 'SILVER')

function onKey(e) { if (e.key === 'Escape' && isOpen.value) close() }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
