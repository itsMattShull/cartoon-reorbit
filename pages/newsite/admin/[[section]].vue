<template>
  <div class="newsite-admin">
    <div class="newsite-admin-nav">
      <AdminNav />
    </div>
    <div class="newsite-admin-body">
      <AdminAnalytics v-if="!section" />
      <AdminManageUsers v-else-if="section === 'manageUsers'" />
      <AdminCheatFinder v-else-if="section === 'cheatFinder'" />
      <AdminDeviceFingerprintLogs v-else-if="section === 'deviceFingerprints'" />
      <AdminAuthLogs v-else-if="section === 'authLogs'" />
      <AdminTradeLogs v-else-if="section === 'tradeLogs'" />
      <AdminAuctionLogs v-else-if="section === 'auctionLogs'" />
      <AdminCtoonOwnerLogs v-else-if="section === 'ctoonOwnerLogs'" />
      <AdminCzoneSearchLogs v-else-if="section === 'czoneSearchLogs'" />
      <AdminPointLogs v-else-if="section === 'pointLogs'" />
      <AdminAchievementLogs v-else-if="section === 'achievementLogs'" />
      <AdminGtoonsClashLogs v-else-if="section === 'gtoonsClashLogs'" />
      <AdminMonsterBattleLogs v-else-if="section === 'monsterBattleLogs'" />
      <AdminLottoLogs v-else-if="section === 'lottoLogs'" />
      <AdminWinWheelLogs v-else-if="section === 'winWheelLogs'" />
      <AdminScavengerLogs v-else-if="section === 'scavengerLogs'" />
      <AdminVpnQueue v-else-if="section === 'vpn-queue'" />
      <AdminCtoonCollectionAnalytics v-else-if="section === 'collectionAnalytics'" />
      <AdminPackAnalytics v-else-if="section === 'packAnalytics'" />
      <div v-else class="newsite-admin-placeholder">
        <h1 class="newsite-admin-title">Unknown section</h1>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: ['newsite', 'admin'],
  showAdbar: true,
  showNav: true,
  showSidebar: false,
})
useHead({ htmlAttrs: { class: 'newsite-admin-page' } })

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const route = useRoute()
const section = computed(() => route.params.section || null)
</script>

<style>
html.newsite-admin-page {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

html.newsite-admin-page body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.newsite-admin {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.newsite-admin-nav {
  flex-shrink: 0;
  width: 100%;
  min-height: var(--topbar-nav-height);
  background: var(--OrbitLightBlue);
  border-radius: var(--topbar-nav-left-radius);
  overflow: visible;
  position: relative;
  z-index: 20;
}

.newsite-admin-body {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}

.newsite-admin-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
}

.newsite-admin-title {
  font-size: 2rem;
  font-weight: bold;
  color: #fff;
  margin: 0;
}
</style>
