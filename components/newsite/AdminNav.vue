<template>
  <div class="admin-nav">
    <div
      v-for="menu in menus"
      :key="menu.id"
      class="admin-nav-dropdown"
      :ref="el => (dropdownRefs[menu.id] = el)"
    >
      <BlueButton :style="{ height: buttonHeight }" @click.stop="toggle(menu.id)">{{ menu.label }} ▾</BlueButton>
      <div v-if="openDropdown === menu.id" class="admin-nav-menu">
        <template v-for="item in menu.items" :key="item.id">
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="admin-nav-menu-item"
            @click="openDropdown = null"
          >{{ item.label }}</NuxtLink>
          <button
            v-else
            class="admin-nav-menu-item"
            @click="openDropdown = null"
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

const menus = [
  {
    id: 'core',
    label: 'Admin Core',
    items: [
      { id: 'analytics',     label: 'Analytics',    to: '/newsite/admin' },
      { id: 'manageUsers',   label: 'Manage Users', to: '/newsite/admin/manageUsers' },
      { id: 'core-placeholder-2', label: 'Placeholder', to: null },
      { id: 'core-placeholder-3', label: 'Placeholder', to: null },
      { id: 'core-placeholder-4', label: 'Placeholder', to: null },
      { id: 'core-placeholder-5', label: 'Placeholder', to: null },
      { id: 'core-placeholder-6', label: 'Placeholder', to: null },
      { id: 'core-placeholder-7', label: 'Placeholder', to: null },
      { id: 'core-placeholder-8', label: 'Placeholder', to: null }
    ]
  },
  {
    id: 'logs',
    label: 'Admin Logs',
    items: [
      { id: 'vpnQueue',            label: 'VPN Queue',          to: '/newsite/admin/vpn-queue' },
      { id: 'cheatFinder',        label: 'Cheat Finder',       to: '/newsite/admin/cheatFinder' },
      { id: 'deviceFingerprints', label: 'Browser Fingerprints', to: '/newsite/admin/deviceFingerprints' },
      { id: 'authLogs',           label: 'Auth Logs',          to: '/newsite/admin/authLogs' },
      { id: 'tradeLogs',          label: 'Trade Logs',         to: '/newsite/admin/tradeLogs' },
      { id: 'auctionLogs',        label: 'Auction Logs',       to: '/newsite/admin/auctionLogs' },
      { id: 'ctoonOwnerLogs',     label: 'cToon Owner Logs',   to: '/newsite/admin/ctoonOwnerLogs' },
      { id: 'czoneSearchLogs',    label: 'cZone Search Logs',  to: '/newsite/admin/czoneSearchLogs' },
      { id: 'pointLogs',          label: 'Point Logs',         to: '/newsite/admin/pointLogs' },
      { id: 'achievementLogs',    label: 'Achievement Logs',   to: '/newsite/admin/achievementLogs' },
      { id: 'gtoonsClashLogs',    label: 'gToons Clash Logs',  to: '/newsite/admin/gtoonsClashLogs' },
      { id: 'monsterBattleLogs',  label: 'Monster Battle Logs', to: '/newsite/admin/monsterBattleLogs' },
      { id: 'lottoLogs',          label: 'Lotto Logs',         to: '/newsite/admin/lottoLogs' },
      { id: 'winWheelLogs',       label: 'Win Wheel Logs',     to: '/newsite/admin/winWheelLogs' },
      { id: 'scavengerLogs',      label: 'Scavenger Logs',     to: '/newsite/admin/scavengerLogs' },
      { id: 'collectionAnalytics', label: 'Collection Analytics', to: '/newsite/admin/collectionAnalytics' },
      { id: 'setAnalytics', label: 'Set Analytics', to: '/newsite/admin/setAnalytics' }
    ]
  }
]

const openDropdown = ref(null)
const dropdownRefs = {}

function toggle(id) {
  openDropdown.value = openDropdown.value === id ? null : id
}

function onGlobalClick(e) {
  if (!openDropdown.value) return
  const active = dropdownRefs[openDropdown.value]
  if (active && !active.contains(e.target)) openDropdown.value = null
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
