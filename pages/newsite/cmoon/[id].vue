<template>
  <div class="cmp-wrap">
    <div v-if="pending" class="cmp-card">
      <div class="cmp-skel cmp-skel-title"></div>
      <div class="cmp-skel cmp-skel-line"></div>
    </div>

    <div v-else-if="error || !cmoon" class="cmp-card">
      <p class="cmp-empty">cMoon not found.</p>
      <NuxtLink to="/newsite/MycWorld" class="cmp-link">Back to My cWorld</NuxtLink>
    </div>

    <div v-else class="cmp-inner">
      <section class="cmp-card cmp-banner" :style="bannerStyle">
        <span class="cmp-swatch" :style="{ background: safeColor(cmoon.color) }"></span>
        <div class="cmp-banner-body">
          <h1 class="cmp-name">{{ cmoon.name }}</h1>
          <p class="cmp-sub">{{ cmoon.memberCount }} member{{ cmoon.memberCount === 1 ? '' : 's' }}</p>
        </div>
      </section>

      <section class="cmp-card cmp-stats">
        <div class="cmp-stat">
          <span class="cmp-stat-label">Team Rank</span>
          <span class="cmp-stat-value">#{{ cmoon.rank }}</span>
        </div>
        <div class="cmp-stat">
          <span class="cmp-stat-label">Team Score</span>
          <span class="cmp-stat-value">{{ cmoon.teamScore.toLocaleString() }}</span>
        </div>
      </section>

      <section v-if="cmoon.captains.length" class="cmp-card">
        <h2 class="cmp-heading">Captains</h2>
        <p class="cmp-captains">{{ cmoon.captains.join(', ') }}</p>
      </section>

      <section v-if="cmoon.prizeCtoons.length" class="cmp-card">
        <h2 class="cmp-heading">Prize cToons</h2>
        <div class="cmp-prizes">
          <div v-for="(p, i) in cmoon.prizeCtoons" :key="i" class="cmp-prize">
            <img v-if="p.assetPath" :src="p.assetPath" :alt="p.name" class="cmp-prize-img" loading="lazy" />
            <span class="cmp-prize-name">{{ p.name }} × {{ p.quantity }}</span>
          </div>
        </div>
      </section>

      <section class="cmp-card cmp-members-card">
        <h2 class="cmp-heading">Top Members</h2>
        <div class="cmp-members">
          <NuxtLink
            v-for="m in cmoon.topMembers" :key="m.username"
            :to="`/newsite/czone/${m.username}`"
            class="cmp-member"
          >
            <img :src="`/avatars/${m.avatar || 'default.png'}`" class="cmp-member-avatar" alt="" />
            <span class="cmp-member-name">{{ m.username }}</span>
            <span class="cmp-member-points">{{ m.points.toLocaleString() }} pts</span>
          </NuxtLink>
          <div v-if="!cmoon.topMembers.length" class="cmp-empty">No members yet.</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { cMoonPillStyle, isSafeCMoonColor } from '~/utils/cmoonColor'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'cMoon',
  description: 'View a cMoon\'s team leaderboard rank, score, and top members on Cartoon ReOrbit.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const route = useRoute()
const rawId = route.params.id
const cmoonId = typeof rawId === 'string' ? rawId : (Array.isArray(rawId) ? rawId[0] : '')

const cmoon = ref(null)
const pending = ref(true)
const error = ref(null)

async function load() {
  pending.value = true
  error.value = null
  try {
    cmoon.value = await $fetch(`/api/cmoon/${cmoonId}`)
  } catch (e) {
    error.value = e
  } finally {
    pending.value = false
  }
}

function safeColor(color) {
  return isSafeCMoonColor(color) ? color : '#3a4a63'
}

const bannerStyle = computed(() => cmoon.value ? cMoonPillStyle(cmoon.value.color) : {})

onMounted(load)
</script>

<style scoped>
.cmp-wrap {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cmp-card {
  background: rgba(10, 25, 55, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 16px;
  color: #fff;
}

.cmp-skel {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  animation: cmp-pulse 1.2s ease-in-out infinite;
}
.cmp-skel-title { height: 24px; width: 60%; margin-bottom: 10px; }
.cmp-skel-line { height: 14px; width: 40%; }
@keyframes cmp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.cmp-empty {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
}
.cmp-link {
  display: inline-block;
  margin-top: 8px;
  color: #7ec8f0;
  font-size: 0.85rem;
}

.cmp-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.cmp-swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex: 0 0 auto;
  border: 2px solid rgba(255, 255, 255, 0.3);
}
.cmp-banner-body {
  min-width: 0;
  flex: 1 1 auto;
}
.cmp-name {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmp-sub {
  margin: 2px 0 0;
  font-size: 0.75rem;
  opacity: 0.8;
}

.cmp-stats {
  display: flex;
  gap: 20px;
}
.cmp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cmp-stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.5);
}
.cmp-stat-value {
  font-size: 1.2rem;
  font-weight: 800;
}

.cmp-heading {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.7);
}

.cmp-captains {
  margin: 0;
  font-size: 0.85rem;
}

.cmp-prizes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.cmp-prize {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 72px;
}
.cmp-prize-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
}
.cmp-prize-name {
  font-size: 0.65rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.cmp-members-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.cmp-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}

.cmp-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
  text-decoration: none;
  color: #fff;
  min-width: 0;
}
.cmp-member:hover { background: rgba(255, 255, 255, 0.06); }

.cmp-member-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.cmp-member-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 600;
  color: #7ec8f0;
}

.cmp-member-points {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
}

@media (max-width: 480px) {
  .cmp-stats { gap: 14px; }
}
</style>
