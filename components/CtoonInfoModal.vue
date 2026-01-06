<template>
  <Modal v-if="isOpen" :hide-close-button="true" :close-on-backdrop="true" @close="close">
    <div class="text-white flex flex-col max-h-[80vh]">
      <div class="flex items-start gap-4 pb-4 border-b border-white/10 shrink-0">
        <img
          v-if="ctoon.assetPath"
          :src="ctoon.assetPath"
          :alt="ctoon.name || 'cToon'"
          class="w-20 h-20 object-contain rounded bg-gray-900/40 p-2"
        />
        <div>
          <h3 class="text-2xl font-semibold">{{ ctoon.name || 'cToon' }}</h3>
          <p class="text-sm text-gray-300">cToon details</p>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto py-4 space-y-4">
        <div v-if="loading" class="text-sm text-gray-300">
          Loading details...
        </div>
        <div v-else-if="error" class="text-sm text-red-300">
          Failed to load cToon details.
        </div>
        <div v-else class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div class="rounded bg-gray-700/60 p-3">
              <div class="text-xs uppercase text-gray-300">Highest Mint</div>
              <div class="font-semibold">{{ formatValue(ctoon.highestMint) }}</div>
            </div>
            <div class="rounded bg-gray-700/60 p-3">
              <div class="text-xs uppercase text-gray-300">Rarity</div>
              <div class="font-semibold">{{ formatValue(ctoon.rarity) }}</div>
            </div>
          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300">Set</div>
            <div class="font-semibold">{{ formatValue(ctoon.set) }}</div>
          </div>
          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300">Series</div>
            <div class="font-semibold">{{ formatValue(ctoon.series) }}</div>
          </div>
          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300">cMart Value</div>
            <div class="font-semibold">{{ formatValue(ctoon.price, ' pts') }}</div>
          </div>
          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300">Highest Value</div>
            <div class="font-semibold">{{ formatValue(ctoon.highestSale, ' pts') }}</div>
            <div v-if="ctoon.highestSaleMint != null" class="text-xs text-gray-300">
              Mint #{{ formatValue(ctoon.highestSaleMint) }}
            </div>
          </div>
          <div class="rounded bg-gray-700/60 p-3">
            <div class="text-xs uppercase text-gray-300">Lowest Value</div>
            <div class="font-semibold">{{ formatValue(ctoon.lowestSale, ' pts') }}</div>
            <div v-if="ctoon.lowestSaleMint != null" class="text-xs text-gray-300">
              Mint #{{ formatValue(ctoon.lowestSaleMint) }}
            </div>
          </div>
        </div>

          <div v-if="userCtoon" class="space-y-2">
            <h4 class="text-sm uppercase tracking-wide text-gray-300">Mint #{{ formatValue(userCtoon.mintNumber) }}</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Times Traded</div>
                <div class="font-semibold">{{ formatValue(userCtoon.tradedCount) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Successful Auctions</div>
                <div class="font-semibold">{{ formatValue(userCtoon.successfulAuctions) }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Avg Sale</div>
                <div class="font-semibold">{{ formatValue(userCtoon.avgSale, ' pts') }}</div>
              </div>
              <div class="rounded bg-gray-700/60 p-3">
                <div class="text-xs uppercase text-gray-300">Median Sale</div>
                <div class="font-semibold">{{ formatValue(userCtoon.medianSale, ' pts') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
        <button
          class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          @click="close"
        >
          Close
        </button>
        <div v-if="isCzoneRoute || canSeeHolidayReveal" class="text-right flex flex-col items-end gap-2">
          <div v-if="canSeeHolidayReveal">
            <button
              v-if="canOpenNow"
              class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 text-sm"
              :disabled="openingHoliday"
              @click="openHolidayCtoon"
            >
              {{ openingHoliday ? 'Opening...' : 'Open cToon' }}
            </button>
            <div v-else class="text-xs text-gray-300">
              Reveal available in:
              <span class="font-semibold">{{ revealCountdown }}</span>
            </div>
          </div>
          <AddToWishlist
            v-if="isCzoneRoute && ctoon.id"
            :ctoon-id="ctoon.id"
            class="text-xs"
          />
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import Modal from '@/components/Modal.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import { useCtoonModal } from '@/composables/useCtoonModal'

const {
  isOpen,
  loading,
  error,
  data,
  context,
  close,
  notifyHolidayRedeem
} = useCtoonModal()

const ctoon = computed(() => data.value?.ctoon || {})
const userCtoon = computed(() => data.value?.userCtoon || null)

const holidayEvent = ref(null)
const openingHoliday = ref(false)
const revealCountdown = ref('')
let revealTimer = null

const route = useRoute()
const isCzoneContext = computed(() => context.value?.source === 'czone')
const isCzoneRoute = computed(() => {
  const path = route?.path || ''
  return typeof path === 'string' && path.startsWith('/czone/')
})
const canSeeHolidayReveal = computed(() => {
  return (
    isCzoneContext.value &&
    !!context.value?.isOwner &&
    !!holidayEvent.value &&
    !!userCtoon.value?.id
  )
})
const eventMinRevealAt = computed(() => holidayEvent.value?.minRevealAt || null)
const canOpenNow = computed(() => {
  if (!canSeeHolidayReveal.value) return false
  const mra = eventMinRevealAt.value ? new Date(eventMinRevealAt.value).getTime() : null
  return mra === null || Date.now() >= mra
})

function stopRevealCountdown() {
  if (revealTimer) {
    clearInterval(revealTimer)
    revealTimer = null
  }
}

function startRevealCountdown() {
  stopRevealCountdown()
  if (!canSeeHolidayReveal.value) {
    revealCountdown.value = ''
    return
  }
  const mraStr = eventMinRevealAt.value
  if (!mraStr) {
    revealCountdown.value = 'now'
    return
  }

  const target = new Date(mraStr).getTime()
  const tick = () => {
    const diff = Math.max(0, target - Date.now())
    if (diff <= 0) {
      revealCountdown.value = 'now'
      stopRevealCountdown()
      return
    }
    const s = Math.floor(diff / 1000)
    const days = Math.floor(s / 86400)
    const hours = Math.floor((s % 86400) / 3600)
    const mins = Math.floor((s % 3600) / 60)
    const secs = s % 60
    revealCountdown.value = `${days}d ${hours}h ${mins}m ${secs}s`
  }
  tick()
  revealTimer = setInterval(tick, 1000)
}

watch([isOpen, () => ctoon.value?.id, isCzoneContext], async ([open, ctoonId, isCzone]) => {
  if (!open || !isCzone || !ctoonId) {
    holidayEvent.value = null
    stopRevealCountdown()
    return
  }
  try {
    holidayEvent.value = await $fetch('/api/holiday/event-for-ctoon', {
      query: { ctoonId }
    })
  } catch {
    holidayEvent.value = null
  }
}, { immediate: true })

watch([isOpen, canSeeHolidayReveal, eventMinRevealAt], () => {
  if (isOpen.value && canSeeHolidayReveal.value) startRevealCountdown()
  else stopRevealCountdown()
})

onBeforeUnmount(stopRevealCountdown)

async function openHolidayCtoon() {
  if (!canOpenNow.value || openingHoliday.value) return
  const userCtoonId = userCtoon.value?.id
  if (!userCtoonId) return
  openingHoliday.value = true
  try {
    const res = await $fetch('/api/holiday/redeem', {
      method: 'POST',
      body: { userCtoonId }
    })
    notifyHolidayRedeem({ userCtoonId, reward: res?.reward || null })
    close()
  } catch (err) {
    console.error('Failed to open holiday cToon', err)
  } finally {
    openingHoliday.value = false
  }
}

function formatValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'N/A'
  if (typeof value === 'number') return `${value.toLocaleString()}${suffix}`
  return `${value}${suffix}`
}
</script>
