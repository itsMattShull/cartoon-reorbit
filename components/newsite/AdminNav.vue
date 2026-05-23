<template>
  <div class="admin-nav">
    <div class="admin-nav-dropdown" ref="dropdownRef">
      <BlueButton :style="{ height: buttonHeight }" @click.stop="toggleOpen">Admin Core ▾</BlueButton>
      <div v-if="open" class="admin-nav-menu">
        <template v-for="item in items" :key="item.id">
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="admin-nav-menu-item"
            @click="open = false"
          >{{ item.label }}</NuxtLink>
          <button
            v-else
            class="admin-nav-menu-item"
            @click="open = false"
          >{{ item.label }}</button>
        </template>
      </div>
    </div>

    <NuxtLink to="/admin" class="admin-nav-old-admin">
      <BlueButton :style="{ height: buttonHeight }">Old Admin</BlueButton>
    </NuxtLink>
  </div>
</template>

<script setup>
const props = defineProps({
  buttonHeight: {
    type: String,
    default: '22px'
  },
  isMobile: {
    type: Boolean,
    default: false
  }
})

const items = [
  { id: 'analytics',   label: 'Analytics',    to: '/newsite/admin' },
  { id: 'manageUsers', label: 'Manage Users', to: '/newsite/admin/manageUsers' },
  { id: 'placeholder-1', label: 'Placeholder', to: null },
  { id: 'placeholder-2', label: 'Placeholder', to: null },
  { id: 'placeholder-3', label: 'Placeholder', to: null },
  { id: 'placeholder-4', label: 'Placeholder', to: null },
  { id: 'placeholder-5', label: 'Placeholder', to: null },
  { id: 'placeholder-6', label: 'Placeholder', to: null },
  { id: 'placeholder-7', label: 'Placeholder', to: null },
  { id: 'placeholder-8', label: 'Placeholder', to: null }
]

const open = ref(false)
const dropdownRef = ref(null)

function toggleOpen() {
  open.value = !open.value
}

function onGlobalClick(e) {
  if (!open.value) return
  const root = dropdownRef.value
  if (root && !root.contains(e.target)) open.value = false
}

onMounted(() => {
  if (process.client) window.addEventListener('click', onGlobalClick)
})
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', onGlobalClick)
})
</script>

<style scoped>
.admin-nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 0 6px;
  box-sizing: border-box;
  overflow: visible;
}

.admin-nav-dropdown {
  position: relative;
}

.admin-nav-old-admin {
  margin-left: auto;
  text-decoration: none;
}

.admin-nav-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--OrbitDarkBlue);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px;
  min-width: 180px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-nav-menu-item {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  color: #fff;
  text-align: left;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: none;
}

.admin-nav-menu-item:hover {
  background: var(--OrbitLightBlue);
}

@media (max-width: 768px) {
  .admin-nav {
    flex-wrap: wrap;
    height: auto;
    padding: 4px 6px;
  }
}
</style>
