<template>
  <!-- Mobile: a bar with a hamburger; the list itself is a teleported drawer. -->
  <div class="admin-rail-bar">
    <button class="admin-rail-toggle" type="button" @click="emitOpen(true)">
      <span class="admin-rail-burger" aria-hidden="true">☰</span>
      <span>{{ activeLabel }}</span>
    </button>
  </div>

  <!-- Desktop: a persistent rail. Every group is visible at once, the current
       section is highlighted, and the filter narrows the tree in place. -->
  <nav class="admin-rail" :aria-label="'Admin sections'">
    <div class="admin-rail-search">
      <input
        v-model="filter"
        type="search"
        class="admin-rail-input"
        placeholder="Filter tools…"
        aria-label="Filter admin tools"
      />
    </div>
    <div class="admin-rail-scroll">
      <p v-if="!visibleGroups.length" class="admin-rail-empty">No tools match “{{ filter }}”.</p>
      <div v-for="group in visibleGroups" :key="group.id" class="admin-rail-group">
        <p class="admin-rail-group-label">{{ group.label }}</p>
        <NuxtLink
          v-for="item in group.items"
          :key="item.key"
          :to="`/newsite/admin/${item.key}`"
          class="admin-rail-item"
          :class="{ 'admin-rail-item-active': item.key === activeKey, 'admin-rail-item-destructive': item.destructive }"
          @click="emitOpen(false)"
        >{{ item.label }}</NuxtLink>
      </div>

      <!-- Fallback to the original /admin/* pages while the console is being
           verified. These leave the console and load under the legacy layout. -->
      <div v-if="oldAdminGroups.length" class="admin-rail-old">
        <button
          type="button"
          class="admin-rail-old-toggle"
          :aria-expanded="oldAdminOpen ? 'true' : 'false'"
          @click="oldAdminOpen = !oldAdminOpen"
        >
          <span>Old Admin</span>
          <span class="admin-rail-old-caret">{{ oldAdminOpen ? '−' : '+' }}</span>
        </button>
        <div v-show="oldAdminOpen">
          <p class="admin-rail-old-note">Original pages, kept as a fallback. Opens outside the console.</p>
          <div v-for="group in oldAdminGroups" :key="group.id" class="admin-rail-group">
            <p class="admin-rail-group-label">{{ group.label }}</p>
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="admin-rail-item admin-rail-item-old"
              @click="emitOpen(false)"
            >{{ item.label }}</NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <!-- Mobile drawer. Teleported to <body> so it is never trapped by an
       ancestor's transform or `overflow: hidden`. -->
  <Teleport to="body">
    <div v-if="open" class="admin-drawer-root">
      <div class="admin-drawer-scrim" @click="emitOpen(false)"></div>
      <nav class="admin-drawer" aria-label="Admin sections">
        <div class="admin-drawer-head">
          <input
            v-model="filter"
            type="search"
            class="admin-rail-input"
            placeholder="Filter tools…"
            aria-label="Filter admin tools"
          />
          <button class="admin-drawer-close" type="button" aria-label="Close" @click="emitOpen(false)">✕</button>
        </div>
        <div class="admin-drawer-scroll">
          <p v-if="!visibleGroups.length" class="admin-rail-empty">No tools match “{{ filter }}”.</p>
          <div v-for="group in visibleGroups" :key="group.id" class="admin-rail-group">
            <p class="admin-rail-group-label">{{ group.label }}</p>
            <NuxtLink
              v-for="item in group.items"
              :key="item.key"
              :to="`/newsite/admin/${item.key}`"
              class="admin-rail-item"
              :class="{ 'admin-rail-item-active': item.key === activeKey, 'admin-rail-item-destructive': item.destructive }"
              @click="emitOpen(false)"
            >{{ item.label }}</NuxtLink>
          </div>

      <!-- Fallback to the original /admin/* pages while the console is being
           verified. These leave the console and load under the legacy layout. -->
      <div v-if="oldAdminGroups.length" class="admin-rail-old">
        <button
          type="button"
          class="admin-rail-old-toggle"
          :aria-expanded="oldAdminOpen ? 'true' : 'false'"
          @click="oldAdminOpen = !oldAdminOpen"
        >
          <span>Old Admin</span>
          <span class="admin-rail-old-caret">{{ oldAdminOpen ? '−' : '+' }}</span>
        </button>
        <div v-show="oldAdminOpen">
          <p class="admin-rail-old-note">Original pages, kept as a fallback. Opens outside the console.</p>
          <div v-for="group in oldAdminGroups" :key="group.id" class="admin-rail-group">
            <p class="admin-rail-group-label">{{ group.label }}</p>
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="admin-rail-item admin-rail-item-old"
              @click="emitOpen(false)"
            >{{ item.label }}</NuxtLink>
          </div>
        </div>
      </div>
        </div>
      </nav>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  sections: { type: Array, default: () => [] },
  activeKey: { type: String, default: null },
  open: { type: Boolean, default: false },
  oldAdminGroups: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:open'])

const filter = ref('')
// Collapsed by default: it is a fallback, not the primary way in.
const oldAdminOpen = ref(false)

function emitOpen (value) {
  emit('update:open', value)
}

const visibleGroups = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return props.sections
  return props.sections
    .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q)) }))
    .filter(g => g.items.length)
})

const activeLabel = computed(() => {
  for (const g of props.sections) {
    const hit = g.items.find(i => i.key === props.activeKey)
    if (hit) return hit.label
  }
  return 'Admin'
})

// The drawer is a full-screen overlay; let the drawer scroll, not the page
// behind it. Without this, scrolling past the end of the drawer on iOS scrolls
// the admin page away underneath it.
watch(() => props.open, (isOpen) => {
  if (!import.meta.client) return
  document.body.style.overflow = isOpen ? 'hidden' : ''
})
</script>

<style scoped>
.admin-rail {
  display: flex;
  flex-direction: column;
  background: var(--OrbitDarkBlue);
  border-right: 1px solid rgba(255, 255, 255, 0.15);
  box-sizing: border-box;
}

.admin-rail-bar { display: none; }

.admin-rail-search {
  padding: 8px;
  flex-shrink: 0;
}

.admin-rail-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  padding: 6px 8px;
  /* 16px on touch: iOS Safari zooms the page whenever a focused input is
     smaller, and never zooms back out. */
  font-size: 0.8rem;
}

.admin-rail-input::placeholder { color: rgba(255, 255, 255, 0.55); }

.admin-rail-scroll {
  padding: 0 6px 12px;
}

.admin-rail-group { margin-bottom: 10px; }

.admin-rail-group-label {
  margin: 8px 6px 4px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.admin-rail-item {
  display: block;
  padding: 6px 8px;
  border-radius: 5px;
  color: #fff;
  text-decoration: none;
  font-size: 0.78rem;
  line-height: 1.25;
}

.admin-rail-item:hover { background: var(--OrbitLightBlue); }

.admin-rail-item-active {
  background: var(--OrbitLightBlue);
  font-weight: 700;
}

.admin-rail-item-destructive { color: #fecaca; }

.admin-rail-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  padding: 8px 6px;
}

.admin-rail-old {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.admin-rail-old-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.admin-rail-old-caret { color: rgba(255, 255, 255, 0.6); }

.admin-rail-old-note {
  margin: 0 8px 6px;
  font-size: 0.62rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.55);
}

.admin-rail-item-old { color: rgba(255, 255, 255, 0.8); }

.admin-drawer-root { position: fixed; inset: 0; z-index: 1000; }
.admin-drawer-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); }

.admin-drawer {
  position: absolute;
  inset: 0 auto 0 0;
  width: min(86vw, 320px);
  display: flex;
  flex-direction: column;
  background: var(--OrbitDarkBlue);
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.4);
}

.admin-drawer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  flex-shrink: 0;
}

.admin-drawer-close {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.1rem;
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}

.admin-drawer-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 6px 16px;
}

@media (max-width: 767.98px) {
  .admin-rail { display: none; }

  .admin-rail-bar {
    display: flex;
    align-items: center;
    background: var(--OrbitDarkBlue);
    padding: 4px 6px;
  }

  .admin-rail-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 10px;
    background: transparent;
    border: none;
    color: #fff;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .admin-rail-burger { font-size: 1.1rem; }

  .admin-rail-item { padding: 11px 10px; font-size: 0.9rem; }
  .admin-rail-old-toggle { min-height: 44px; font-size: 0.8rem; }
  .admin-rail-input { font-size: 16px; min-height: 44px; }
}
</style>
