<template>
  <Teleport to="body">
    <div class="lbm-overlay" @mousedown.self="$emit('close')">
      <div class="lbm-modal">

        <div class="lbm-header">
          <span class="lbm-title">{{ title }}</span>
          <button class="lbm-close" @click="$emit('close')">✕</button>
        </div>

        <div class="lbm-body">
          <ul class="lbm-list">
            <template v-if="pending">
              <li v-for="i in 12" :key="i" class="lbm-row">
                <div class="lbm-skel lbm-skel-rank" />
                <div class="lbm-skel lbm-skel-avatar" />
                <div class="lbm-skel lbm-skel-username" />
                <div class="lbm-skel lbm-skel-value" />
              </li>
            </template>
            <template v-else>
              <li
                v-for="row in rows"
                :key="row.username"
                class="lbm-row"
                :class="{ 'lbm-row--self': row.isSelf }"
              >
                <span class="lbm-rank">{{ row.rank }}</span>
                <img class="lbm-avatar" :src="`/avatars/${row.avatar || 'default.png'}`" alt="" />
                <NuxtLink :to="`/newsite/czone/${row.username}`" class="lbm-username">{{ row.username }}</NuxtLink>
                <span class="lbm-value">{{ formatValue(row) }}</span>
              </li>
              <li v-if="!rows.length" class="lbm-empty">No data yet</li>
            </template>
          </ul>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  title: { type: String, required: true },
  endpoint: { type: String, required: true },
  params: { type: Object, default: () => ({}) },
  formatValue: {
    type: Function,
    default: row => Number(row.points ?? row.count ?? row.score ?? 0).toLocaleString()
  }
})
defineEmits(['close'])

const rows = ref([])
const pending = ref(true)

onMounted(async () => {
  try {
    const data = await $fetch(props.endpoint, { query: { full: 1, ...props.params } })
    rows.value = Array.isArray(data) ? data : []
  } catch {
    rows.value = []
  } finally {
    pending.value = false
  }
})
</script>

<style scoped>
.lbm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.lbm-modal {
  position: relative;
  width: 380px;
  max-width: 100%;
  max-height: 85vh;
  background: var(--OrbitDarkBlue, #001230);
  border: 2px solid var(--OrbitLightBlue, #4a90e2);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.lbm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--OrbitLightBlue, #4a90e2);
  flex-shrink: 0;
}

.lbm-title {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.lbm-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.lbm-close:hover { color: #fff; }

.lbm-body {
  overflow-y: auto;
  flex: 1;
}

.lbm-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.lbm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.8rem;
}
.lbm-row:last-child { border-bottom: none; }

.lbm-row--self {
  background: rgba(126, 200, 240, 0.16);
  border-left: 2px solid #7ec8f0;
}

.lbm-rank {
  width: 24px;
  flex-shrink: 0;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
}

.lbm-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.lbm-username {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7ec8f0;
  text-decoration: none;
  font-weight: 600;
}
.lbm-username:hover { color: #b3e0ff; text-decoration: underline; }

.lbm-value {
  flex-shrink: 0;
  font-weight: 700;
  color: #fff;
  font-size: 0.8rem;
}

.lbm-empty {
  padding: 16px 12px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

@keyframes lbm-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}

.lbm-skel {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.06) 25%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.06) 75%
  );
  background-size: 200% 100%;
  animation: lbm-shimmer 1.4s ease-in-out infinite;
}

.lbm-skel-rank { width: 16px; height: 10px; flex-shrink: 0; }
.lbm-skel-avatar { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; }
.lbm-skel-username { height: 12px; flex: 1; min-width: 0; }
.lbm-skel-value { width: 46px; height: 12px; flex-shrink: 0; }
</style>
