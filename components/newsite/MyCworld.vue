<template>
  <div class="mycworld">
    <div class="mcw-nav">
      <GreenButton @click="goToCzone">My cZone</GreenButton>
      <GreenButton @click="$router.push('/newsite/MyCollection')">My Collection</GreenButton>
      <GreenButton @click="$router.push('/newsite/allCtoons')">All cToons</GreenButton>
      <GreenButton @click="$router.push('/newsite/myachievements')">Achievements</GreenButton>
      <GreenButton :active="activePane === 'wishlist'" @click="openWishlist">My Wishlist</GreenButton>
      <GreenButton :active="activePane === 'cmail'" @click="openCmail">
        cMail
        <!-- Inline pill rather than an absolutely-positioned corner badge:
             GreenButton is position:static, and .mcw-nav's overflow would clip
             anything overhanging the button. -->
        <span v-if="unreadBadge" class="mcw-badge" aria-hidden="true">{{ unreadBadge }}</span>
        <span v-if="unread" class="mcw-sr-only">, {{ unread }} unread</span>
      </GreenButton>
    </div>
    <div class="mcw-content">
      <MyCmail v-if="activePane === 'cmail'" />
      <MyWishlist v-else-if="activePane === 'wishlist'" />
      <CzoneContest v-else />
    </div>
  </div>
</template>

<script setup>
const { user } = useAuth()
const router = useRouter()
const { setSidebarMiddle, clearSidebarMiddle } = useNewsiteLayout()
const { state, refreshUnread } = useCzoneMail()

// A three-way switch, not a boolean — the pane also drives the :active state on
// each button so a player can see which module they are in.
const activePane = ref('contest')

const unread = computed(() => state.value.unread)
const unreadBadge = computed(() => {
  const n = unread.value
  if (!n) return ''
  return n > 9 ? '9+' : String(n)
})

onMounted(() => {
  if (user.value?.username) refreshUnread()
})
watch(() => user.value?.username, (u) => { if (u) refreshUnread() })

function goToCzone() {
  activePane.value = 'contest'
  clearSidebarMiddle()
  if (user.value?.username) {
    router.push(`/newsite/czone/${user.value.username}`)
  }
}

function openWishlist() {
  activePane.value = 'wishlist'
  setSidebarMiddle('MyWishlistSidebar')
}

function openCmail() {
  activePane.value = 'cmail'
  // cMail has nothing worth filtering — its two controls (unread-only and
  // mark-all-read) live in the module's own sticky header, which stays visible
  // on a phone where the sidebar is collapsed by default.
  clearSidebarMiddle()
  refreshUnread()
}
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

/* The buttons already overflowed 360px before cMail was added, and the
   scrollbar is hidden — so anything past the fourth button was unreachable with
   no affordance that it existed. Wrapping is what the other newsite button rows
   do (NavRight, Cmart). */
@media (max-width: 768px) {
  .mcw-nav {
    flex-wrap: wrap;
    height: auto;
  }
}

.mcw-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 999px;
  background: #fff;
  color: #003466;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  text-shadow: none;
}

.mcw-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.mcw-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
