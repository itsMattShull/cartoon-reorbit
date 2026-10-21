<template>
  <div class="bg-white text-gray-900 border rounded-lg shadow-sm">
    <div class="px-4 py-3 border-b">
      <h3 class="font-semibold text-gray-900">
        {{ title }}
        <span v-if="subtitle" class="ml-1 text-xs font-normal text-gray-500">{{ subtitle }}</span>
      </h3>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="p-4 space-y-3">
      <div v-for="i in 10" :key="i" class="flex items-center justify-between">
        <div class="flex items-center space-x-3 w-2/3">
          <div class="w-6 h-6 rounded bg-gray-200 animate-pulse"></div>
          <div class="h-4 w-40 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div class="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
      </div>
    </div>

    <!-- Rows -->
    <ul v-else class="divide-y">
      <li
        v-for="(row, idx) in rows"
        :key="row.username + ':' + idx"
        class="px-4 py-3 flex items-center justify-between"
      >
        <div class="flex items-center space-x-3">
          <span class="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-gray-700 bg-gray-100 rounded">
            {{ idx + 1 }}
          </span>
          <NuxtLink
            class="text-indigo-600 hover:underline font-medium truncate max-w-[12rem] sm:max-w-none"
            :to="`/czone/${encodeURIComponent(row.username)}`"
          >
            {{ row.username }}
          </NuxtLink>
        </div>
        <div class="text-sm tabular-nums font-semibold text-gray-900">
          <template v-if="valueType === 'percent'">
            {{ formatPercent(row.value) }}
            <span v-if="showRecord && hasRecord(row)" class="text-gray-500 font-normal">({{ record(row) }})</span>
            <span v-else-if="hasFrac(row)" class="text-gray-500 font-normal">
              ({{ formatInt(row.num) }}/{{ formatInt(row.den) }})
            </span>
          </template>
          <template v-else>
            {{ formatInt(row.value) }} <span v-if="suffix" class="text-gray-500 font-normal">{{ suffix }}</span>
            <span v-if="showRecord && hasRecord(row)" class="text-gray-500 font-normal">({{ record(row) }})</span>
          </template>
          <div v-if="showWinMethod && hasWinMethod(row)" class="text-[11px] font-normal text-gray-500 text-right">
            {{ row.winsByColor }} by color · {{ row.winsByPoints }} by points
          </div>
        </div>
      </li>
      <li v-if="!rows?.length" class="px-4 py-6 text-gray-500 text-sm text-center">
        {{ emptyText }}
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  valueType: { type: String, default: 'count' }, // 'count' | 'percent'
  suffix: { type: String, default: '' },         // ← optional
  // Show each row's Wins-Losses-Ties (rows carry numeric wins / losses / ties) next to its value.
  showRecord: { type: Boolean, default: false },
  // Under the value, how the wins were decided (rows carry numeric winsByColor / winsByPoints).
  showWinMethod: { type: Boolean, default: false },
  // Small print beside the title, e.g. what the figures in brackets mean.
  subtitle: { type: String, default: '' },
  emptyText: { type: String, default: 'No data for this timeframe.' }
})

const hasFrac = (row) =>
  row && typeof row.num === 'number' && typeof row.den === 'number' && row.den > 0

const hasRecord = (row) => row && ['wins', 'losses', 'ties'].every(k => typeof row[k] === 'number')
const hasWinMethod = (row) => row && typeof row.winsByColor === 'number' && typeof row.winsByPoints === 'number' && (row.winsByColor + row.winsByPoints) > 0
const record = (row) => `${row.wins}-${row.losses}-${row.ties}`
const formatInt = (v) => new Intl.NumberFormat().format(Math.round(Number(v || 0)))
const formatPercent = (v) => `${Number(v || 0).toFixed(1)}%`
</script>
