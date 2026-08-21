<template>
  <select
    :value="modelValue || ''"
    class="w-full border rounded p-2 bg-white"
    style="font-size:16px"
    @change="$emit('update:modelValue', $event.target.value || null)"
  >
    <option value="">— None —</option>
    <option v-for="c in cmoons" :key="c.id" :value="c.id">{{ c.name }}</option>
  </select>
</template>

<script setup>
// Shared across all four admin cToon create/edit forms (old standalone pages
// + the new admin-console legacy copies) so the cMoon list is fetched and
// rendered in exactly one place instead of being hand-copied four times.
// Reads the admin-gated list (not the public /api/cmoons, which returns an
// empty list whenever the cMoon faction system's feature flag is off — this
// display/catalog feature is independent of that flag).
defineProps({
  modelValue: { type: String, default: null }
})
defineEmits(['update:modelValue'])

const cmoons = ref([])

onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/cmoons')
    cmoons.value = res?.cmoons || []
  } catch {
    cmoons.value = []
  }
})
</script>
