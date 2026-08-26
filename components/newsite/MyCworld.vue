<template>
  <div class="mycworld">
    <div class="mcw-nav">
      <GreenButton @click="goToCzone">My cZone</GreenButton>
      <GreenButton @click="$router.push('/newsite/MyCollection')">My Collection</GreenButton>
      <GreenButton @click="$router.push('/newsite/allCtoons')">All cToons</GreenButton>
      <GreenButton @click="$router.push('/newsite/myachievements')">Achievements</GreenButton>
      <GreenButton @click="openWishlist">My Wishlist</GreenButton>
      <GreenButton v-if="cMoonEnabled" @click="router.push('/newsite/cmoon-nav')">cMoons</GreenButton>
    </div>
    <div class="mcw-content">
      <MyWishlist v-if="showWishlist" />
      <CzoneContest v-else />
    </div>
  </div>
</template>

<script setup>
const { user } = useAuth()
const router = useRouter()
const { setSidebarMiddle, clearSidebarMiddle } = useNewsiteLayout()

const showWishlist = ref(false)
const cMoonEnabled = ref(false)

function goToCzone() {
  showWishlist.value = false
  clearSidebarMiddle()
  if (user.value?.username) {
    router.push(`/newsite/czone/${user.value.username}`)
  }
}

function openWishlist() {
  showWishlist.value = true
  setSidebarMiddle('MyWishlistSidebar')
}

onMounted(async () => {
  try {
    const data = await $fetch('/api/cmoons')
    cMoonEnabled.value = !!data?.cMoonEnabled
  } catch {
    cMoonEnabled.value = false
  }
})
</script>

<style scoped>
.mycworld {
  --mcw-nav-height: 36px;

  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 6px;
  box-sizing: border-box;
  gap: 6px;
}

.mcw-nav {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  height: var(--mcw-nav-height);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.mcw-nav::-webkit-scrollbar {
  display: none;
}

.mcw-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
