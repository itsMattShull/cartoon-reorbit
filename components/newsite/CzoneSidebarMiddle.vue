<template>
  <CzoneEdit
    v-if="cz.buildMode"
    @save="czoneActions.save()"
    @clear="czoneActions.clearZone()"
  />
  <MiddleSidebarImages v-else />
</template>

<script setup>
const cz = useNewSiteCzoneState()
const czoneActions = useCzoneActions()
</script>
