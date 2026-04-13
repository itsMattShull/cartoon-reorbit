<template>
  <div class="mycworld">
    <div class="mcw-nav">
      <GreenButton @click="goToCzone">My cZone</GreenButton>
      <GreenButton @click="$router.push('/newsite/MyCollection')">My Collection</GreenButton>
      <GreenButton @click="$router.push('/newsite/myachievements')">Achievements</GreenButton>
      <GreenButton>Placeholder</GreenButton>
    </div>
    <div class="mcw-content">
      <CzoneContest />
    </div>
  </div>
</template>

<script setup>
const { user } = useAuth()
const router = useRouter()

function goToCzone() {
  if (user.value?.username) {
    router.push(`/newsite/czone/${user.value.username}`)
  }
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
}

.mcw-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
