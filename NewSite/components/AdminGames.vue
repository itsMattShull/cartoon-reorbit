<template>
  <div class="ag-games">
    <div class="ag-games-tabbar">
      <button
        v-for="t in tabs" :key="t.id"
        class="ag-games-tab"
        :class="{ 'ag-games-tab-active': active === t.id }"
        @click="active = t.id"
      >{{ t.label }}</button>
    </div>
    <div class="ag-games-content">
      <AdminGameWinball  v-if="active === 'winball'"  />
      <AdminGameLotto    v-if="active === 'lotto'"    />
      <AdminGameWinwheel v-if="active === 'winwheel'" />
      <AdminGameGtoons   v-if="active === 'gtoons'"   />
    </div>
  </div>
</template>

<script setup>
const tabs = [
  { id: 'winball',  label: 'Winball'  },
  { id: 'lotto',    label: 'Lotto'    },
  { id: 'winwheel', label: 'Winwheel' },
  { id: 'gtoons',   label: 'gToons'   },
]
const active = ref('winball')
</script>

<style scoped>
.ag-games {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.ag-games-tabbar {
  display: flex;
  gap: 3px;
  padding: 0 0 0 2px;
  flex-shrink: 0;
  border-bottom: 2px solid rgba(0,0,0,0.3);
  margin-bottom: 10px;
}

.ag-games-tab {
  padding: 4px 14px;
  font-size: 0.75rem;
  font-weight: bold;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.12);
  border-bottom: none;
  border-radius: 5px 5px 0 0;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.ag-games-tab:hover { background: rgba(0,0,0,0.35); color: rgba(255,255,255,0.8); }
.ag-games-tab-active { background: rgba(0,0,0,0.4); color: #fff; border-color: rgba(255,255,255,0.25); }

.ag-games-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
