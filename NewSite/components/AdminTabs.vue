<template>
  <div class="admin-tabs">
    <div class="tab-bar">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="tab"
        :class="{ 'tab-active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="tab-content">
      <template v-for="tab in tabs" :key="tab.id">
        <div v-if="activeTab === tab.id">
          <slot :name="tab.id" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
const tabs = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'users',    label: 'Users' },
  { id: 'globals',  label: 'Globals' },
  { id: 'ctoons',   label: 'cToons' },
  { id: 'games',    label: 'Games' },
  { id: 'content',  label: 'Content' },
  { id: 'tab7',     label: 'Placeholder 7' },
  { id: 'tab8',     label: 'Placeholder 8' },
  { id: 'tab9',     label: 'Placeholder 9' },
  { id: 'logs',     label: 'Logs' },
]

const activeTab = ref('analytics')
</script>

<style scoped>
.admin-tabs {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.tab-bar {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
}

.tab {
  padding: 2px 6px;
  height: 22px;
  background: var(--OrbitDarkBlue);
  color: rgba(255, 255, 255, 0.65);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: bold;
  border: 2px solid #1a5a9a;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset -1px 0 0 rgba(255, 255, 255, 0.4),
    -1px 1px 1px rgba(0, 0, 0, 0.3);
  transition: background 0.15s, color 0.15s;
}

.tab:hover {
  background: var(--OrbitLightBlue);
  color: rgba(255, 255, 255, 0.85);
}

.tab-active {
  background: var(--OrbitLightBlue);
  color: white;
  height: 26px;
}

.tab-content {
  flex: 1;
  background: var(--OrbitLightBlue);
  border-radius: 0;
  overflow: hidden;
  padding: 12px;
}
</style>
