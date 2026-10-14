<!-- components/OgGtoonGameLog.vue -->
<!-- Renders the server's ordered game log (see "Game log" in server/utils/ogGtoonMatchCore.js):
     a title per event, optionally split into labelled sections. Purely presentational. -->
<template>
  <div class="space-y-2">
    <p v-if="!entries.length" class="text-gray-400">Nothing has happened yet.</p>
    <div
      v-for="e in entries"
      :key="e.seq"
      class="border-l-2 pl-2"
      :class="BORDER[e.kind] || 'border-white/20'"
    >
      <p class="font-semibold text-gray-100">
        <span v-if="e.round" class="text-gray-400 font-normal">R{{ e.round }} · </span>{{ e.title }}
      </p>
      <div v-for="(sec, i) in e.sections" :key="i" class="mt-0.5">
        <p v-if="sec.label" class="text-[10px] uppercase tracking-wide" :class="LABEL[sec.label] || 'text-gray-400'">{{ sec.label }}</p>
        <p v-for="(line, j) in sec.lines" :key="j" class="text-gray-300 leading-snug">{{ line }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ entries: { type: Array, default: () => [] } })

const BORDER = {
  start: 'border-indigo-400', phase: 'border-white/20', commit: 'border-white/10',
  reveal: 'border-emerald-400', discard: 'border-sky-400', swap: 'border-sky-400',
  timeout: 'border-red-400', preview: 'border-amber-400', scoring: 'border-amber-300', end: 'border-red-400'
}
const LABEL = {
  'Knocked out': 'text-red-300', 'Powers cancelled': 'text-amber-300', 'No longer applying': 'text-orange-300',
  'What changed': 'text-sky-300', 'Powers in effect': 'text-emerald-300', Result: 'text-amber-200'
}
</script>
