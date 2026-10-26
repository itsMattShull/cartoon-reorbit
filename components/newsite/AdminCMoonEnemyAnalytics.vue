<template>
  <div class="admin-cmoon-enemy-analytics bg-gray-50">
    <div class="p-2 text-xs">
      <div class="bg-white rounded-lg shadow p-3">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h1 class="text-base font-semibold">cMoon Enemy Analytics</h1>
          <div class="flex gap-1">
            <button
              v-for="d in RANGES"
              :key="d"
              type="button"
              class="px-2 py-0.5 rounded border text-[11px]"
              :class="days === d ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'"
              :disabled="loading"
              @click="setDays(d)"
            >{{ d }}d</button>
          </div>
        </div>
        <p class="text-[11px] text-gray-500 mb-2">
          How often players take an enemy the popup offers them, and how often they finish a solo battle once they start it.
          Individual fights are on the
          <NuxtLink to="/newsite/admin/cMoonBattleLogs" class="text-indigo-600 hover:underline">cMoon Battle Logs</NuxtLink> page.
        </p>

        <p v-if="error" class="text-red-600 mb-2">{{ error }}</p>
        <p v-if="loading && !data" class="text-gray-500">Loading…</p>

        <template v-if="data">
          <p v-if="trackingNote" class="mb-2 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] text-amber-800">
            {{ trackingNote }}
          </p>

          <!-- HEADLINE RATES -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <div class="rounded border border-gray-200 p-2">
              <div class="text-[11px] text-gray-500">Offer → start (solo)</div>
              <div class="text-2xl font-semibold tabular-nums">{{ pct(data.offers.solo.startRate) }}</div>
              <div class="text-[11px] text-gray-500 tabular-nums">
                {{ n(data.offers.solo.accepted) }} fought of {{ n(data.offers.solo.offered) }} offered
              </div>
            </div>
            <div class="rounded border border-gray-200 p-2">
              <div class="text-[11px] text-gray-500">Offer → start (raid boss)</div>
              <div class="text-2xl font-semibold tabular-nums">{{ pct(data.offers.raid.startRate) }}</div>
              <div class="text-[11px] text-gray-500 tabular-nums">
                {{ n(data.offers.raid.accepted) }} raids started of {{ n(data.offers.raid.offered) }} offered
              </div>
            </div>
            <div class="rounded border border-gray-200 p-2">
              <div class="text-[11px] text-gray-500">Start → finish (solo)</div>
              <div class="text-2xl font-semibold tabular-nums">{{ pct(data.solo.completionRate) }}</div>
              <div class="text-[11px] text-gray-500 tabular-nums">
                {{ n(data.solo.completed) }} finished, {{ n(data.solo.abandoned) }} abandoned
              </div>
            </div>
          </div>

          <!-- SOLO OUTCOME BREAKDOWN -->
          <div class="mb-3">
            <div class="text-[11px] font-medium text-gray-700 mb-1">
              Solo battles started: <span class="tabular-nums">{{ n(data.solo.started) }}</span>
            </div>
            <div v-if="data.solo.started" class="flex h-2 w-full overflow-hidden rounded bg-gray-100" role="img" :aria-label="outcomeAria">
              <div v-for="seg in outcomeSegments" :key="seg.key" :class="seg.bar" :style="{ width: seg.width }" :title="`${seg.label}: ${seg.count}`" />
            </div>
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
              <span v-for="seg in outcomeSegments" :key="seg.key" class="inline-flex items-center gap-1">
                <span class="inline-block h-2 w-2 rounded-sm" :class="seg.bar" />{{ seg.label }} <span class="tabular-nums">{{ n(seg.count) }}</span>
              </span>
            </div>
            <p class="mt-1 text-[11px] text-gray-500">
              Finished = win, loss, or sniped (someone else landed the kill mid-fight). Abandoned includes battles with no move for
              {{ data.abandonAfterMinutes }}+ minutes. Battles still being played are left out of the rate.
            </p>
          </div>

          <!-- PER-ENEMY TABLE -->
          <div class="overflow-x-auto">
            <table class="min-w-full border-collapse">
              <thead>
                <tr class="bg-gray-100 text-[11px] text-gray-600">
                  <th class="px-1.5 py-1 text-left">Enemy</th>
                  <th class="px-1.5 py-1 text-right">Offered</th>
                  <th class="px-1.5 py-1 text-right">Started</th>
                  <th class="px-1.5 py-1 text-right">Start %</th>
                  <th class="px-1.5 py-1 text-right" title="Solo battles only">Finished</th>
                  <th class="px-1.5 py-1 text-right" title="Solo battles only">Abandoned</th>
                  <th class="px-1.5 py-1 text-right" title="Solo battles only">Finish %</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in data.enemies" :key="e.enemyMemberId" class="border-t border-gray-100">
                  <td class="px-1.5 py-1">
                    <span v-if="e.isRaidBoss" class="mr-1 rounded bg-purple-100 px-1 text-[10px] font-semibold uppercase text-purple-700">Raid</span>
                    <span v-if="e.factionName" class="text-gray-500">{{ e.factionName }} — </span>{{ e.name }}
                  </td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ n(e.offered) }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ n(e.accepted) }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ pct(e.startRate) }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ e.isRaidBoss ? '—' : n(e.solo.completed) }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ e.isRaidBoss ? '—' : n(e.solo.abandoned) }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ e.isRaidBoss ? '—' : pct(e.solo.completionRate) }}</td>
                </tr>
                <tr v-if="!data.enemies.length">
                  <td colspan="7" class="px-1.5 py-3 text-center text-gray-500">No offers or battles in this range yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-1 text-[11px] text-gray-500">
            "Started" counts offers the player took (Fight! or Start Raid!). Finish columns are solo only — a raid plays out on its own once started.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const RANGES = [7, 30, 90, 365]
const days = ref(30)
const data = ref(null)
const loading = ref(false)
const error = ref('')

const nf = new Intl.NumberFormat('en-US')
function n(v) { return nf.format(v || 0) }
function pct(v) { return v === null || v === undefined ? '—' : `${v}%` }

const trackingNote = computed(() => {
  const d = data.value
  if (!d) return ''
  if (!d.trackingSince) return 'Offer tracking just started — the offer → start rates fill in as players see the popup. Start → finish already covers past battles.'
  if (new Date(d.trackingSince) > new Date(d.since)) {
    const when = new Date(d.trackingSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `Offers have only been tracked since ${when}, so offer → start rates cover less than the full ${d.days} days. Start → finish covers the whole range.`
  }
  return ''
})

const outcomeSegments = computed(() => {
  const s = data.value?.solo
  if (!s) return []
  const total = s.started || 1
  return [
    { key: 'wins', label: 'Won', count: s.wins, bar: 'bg-green-500' },
    { key: 'losses', label: 'Lost', count: s.losses, bar: 'bg-red-500' },
    { key: 'uncredited', label: 'Sniped', count: s.uncredited, bar: 'bg-amber-400' },
    { key: 'abandoned', label: 'Abandoned', count: s.abandoned, bar: 'bg-gray-400' },
    { key: 'inProgress', label: 'In progress', count: s.inProgress, bar: 'bg-indigo-400' },
  ].map(seg => ({ ...seg, width: `${(seg.count / total) * 100}%` }))
})

const outcomeAria = computed(() => outcomeSegments.value.map(s => `${s.label} ${s.count}`).join(', '))

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    data.value = await $fetch('/api/admin/cmoon-enemy-analytics', { query: { days: days.value } })
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to load analytics.'
  } finally {
    loading.value = false
  }
}

function setDays(d) {
  if (days.value === d) return
  days.value = d
  fetchData()
}

onMounted(fetchData)
</script>

<style scoped>
.admin-cmoon-enemy-analytics {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
