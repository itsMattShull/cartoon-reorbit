<template>
  <div class="bg-white border rounded-lg shadow-sm">
    <div class="px-4 py-3 border-b">
      <h3 class="font-semibold text-gray-900">{{ title }}</h3>
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
            <span v-if="hasFrac(row)" class="text-gray-500 font-normal">
              ({{ formatInt(row.num) }}/{{ formatInt(row.den) }})
            </span>
          </template>
          <template v-else>
            {{ formatInt(row.value) }}
          </template>
        </div>
      </li>
      <li v-if="!rows?.length" class="px-4 py-6 text-gray-500 text-sm text-center">
        No data for this timeframe.
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  rows: { type: Array, default: () => [] },       // [{ username, value, num?, den? }]
  loading: { type: Boolean, default: false },
  valueType: { type: String, default: 'count' }   // 'count' | 'percent'
})

const hasFrac = (row) =>
  row && typeof row.num === 'number' && typeof row.den === 'number' && row.den > 0

const formatInt = (v) => new Intl.NumberFormat().format(Math.round(Number(v || 0)))
const formatPercent = (v) => `${Number(v || 0).toFixed(1)}%`
</script>
