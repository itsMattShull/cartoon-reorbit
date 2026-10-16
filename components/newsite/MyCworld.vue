<template>
  <div class="mycworld">
    <div class="mcw-nav">
      <GreenButton @click="goToCzone">My cZone</GreenButton>
      <GreenButton v-if="cMoonEnabled" @click="router.push('/newsite/cmoon-nav')">cMoons</GreenButton>
      <GreenButton @click="$router.push('/newsite/MyCollection')">My Collection</GreenButton>
      <GreenButton @click="$router.push('/newsite/allCtoons')">All cToons</GreenButton>
      <GreenButton @click="$router.push('/newsite/myachievements')">Achievements</GreenButton>
      <GreenButton @click="openWishlist">My Wishlist</GreenButton>
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

/* flex-wrap (not a single scrolling row) is what actually guarantees no horizontal scroll at any
   sidebar width — six buttons' labels add up to more than a phone-width row can fit even at a
   much smaller size, so the old single-row + overflow-x: auto always needed a scroll to reach
   the last button or two; wrapping onto a second row costs a little extra height (min-height
   instead of a fixed one below) but never needs a sideways scroll. "cMoons" also moved to the
   2nd slot (see the template) so it's reachable at a glance either way. */
.mcw-nav {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: var(--mcw-nav-height);
  flex-shrink: 0;
}

/* Smaller than GreenButton's own default (and its own <=768px shrink) specifically in this row,
   so more of the six fit per line and the wrap above rarely needs more than two rows. Scoped to
   just this nav via :deep() so every other GreenButton usage site-wide (Economy, Cmart,
   Leaderboards, etc.) is unaffected. */
.mcw-nav :deep(.green-button) {
  padding: 3px 7px;
  font-size: 0.62rem;
}

.mcw-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
