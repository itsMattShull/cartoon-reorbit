<template>
  <div ref="triggerWrap" class="economy-trigger-wrap">
    <BlueButton
      type="button"
      class="economy-trigger"
      :style="{ height: buttonHeight }"
      data-nav-sound="economy"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      Economy
      <span class="economy-caret" :class="{ 'economy-caret-open': open }" aria-hidden="true">▾</span>
    </BlueButton>

    <!-- Teleported to <body>, not just position:absolute in place — `.site-container` gets
         `transform: scale()` on desktop (see layouts/newsite-template.vue's own comment on
         fluidLayout), which makes it the containing block for any `position: fixed` descendant,
         and both it and `.topbar`/`.topbar-primary` are `overflow: hidden`. A panel left in place
         would be clipped by the first and mispositioned by the second — Teleport escapes both,
         same reason every modal in this app (AuctionModal, EconomyIndexModal, ...) does it. -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="economy-dropdown-panel"
        role="menu"
        :style="panelStyle"
      >
        <NuxtLink to="/newsite/trade" class="economy-dropdown-item" data-nav-sound="trades" role="menuitem" @click="close">
          Trades
        </NuxtLink>
        <NuxtLink to="/newsite/AuctionHouse" class="economy-dropdown-item" data-nav-sound="auctions" role="menuitem" @click="close">
          Auctions
        </NuxtLink>
        <NuxtLink to="/newsite/economy" class="economy-dropdown-item" data-nav-sound="toononomics" role="menuitem" @click="close">
          Toononomics
        </NuxtLink>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
defineProps({
  buttonHeight: {
    type: String,
    default: '22px'
  }
})

const open = ref(false)
const triggerWrap = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})
const route = useRoute()

function positionPanel() {
  const trigger = triggerWrap.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const PANEL_WIDTH = 160
  const GAP = 4
  // Right-align to the trigger's right edge if left-aligning would run the panel past the
  // viewport's right edge (the button sits near the right end of the top bar) — otherwise
  // left-align, so it doesn't jut out past the left edge on a narrow mobile viewport either.
  const overflowsRight = rect.left + PANEL_WIDTH > window.innerWidth - 8
  panelStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + GAP}px`,
    left: overflowsRight ? 'auto' : `${rect.left}px`,
    right: overflowsRight ? `${Math.max(8, window.innerWidth - rect.right)}px` : 'auto',
    width: `${PANEL_WIDTH}px`,
  }
}

function onDocumentPointerDown(event) {
  if (triggerWrap.value?.contains(event.target)) return
  if (panelRef.value?.contains(event.target)) return
  close()
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

function toggle() {
  if (open.value) {
    close()
  } else {
    open.value = true
    nextTick(positionPanel)
  }
}

function close() {
  open.value = false
}

watch(open, (isOpen) => {
  if (typeof document === 'undefined') return
  if (isOpen) {
    // Deferred a tick so the click that opened the dropdown doesn't also immediately close it
    // via this same listener (it hasn't finished bubbling yet when `open` first flips true).
    nextTick(() => {
      document.addEventListener('click', onDocumentPointerDown)
      document.addEventListener('keydown', onKeydown)
      window.addEventListener('resize', positionPanel)
      window.addEventListener('scroll', positionPanel, true)
    })
  } else {
    document.removeEventListener('click', onDocumentPointerDown)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', positionPanel)
    window.removeEventListener('scroll', positionPanel, true)
  }
})

// Closes the menu on navigation (e.g. back/forward, or any other in-app link) rather than
// leaving it open and misplaced over whatever page the user lands on.
watch(() => route.fullPath, close)

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', positionPanel)
  window.removeEventListener('scroll', positionPanel, true)
})
</script>

<style scoped>
.economy-trigger-wrap {
  /* NOT display:contents (the old .nav-link wrapper pattern in NavRight.vue/NavLeft.vue) — that
     generates no box at all, so getBoundingClientRect() on it in positionPanel() below would
     return a zero/(0,0) rect instead of the trigger's real on-screen position. inline-flex keeps
     it sized to exactly its BlueButton child, so it still behaves like one flex item inside
     .nav-right's own flex row. */
  display: inline-flex;
  align-items: center;
}

.economy-trigger {
  display: inline-flex !important;
  align-items: center;
  gap: 4px;
}

.economy-caret {
  display: inline-block;
  font-size: 0.7em;
  line-height: 1;
  transition: transform 0.15s ease;
}

.economy-caret-open {
  transform: rotate(180deg);
}
</style>

<style>
/* Unscoped: this panel is teleported to <body>, outside this component's own scoped-style
   subtree, so a `scoped` block (which relies on a data-v-* attribute Vue only adds within the
   component's own rendered tree) would never match it. */
.economy-dropdown-panel {
  z-index: 1100;
  background: #062a4a;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 4px;
  box-sizing: border-box;
}

.economy-dropdown-item {
  display: block;
  padding: 8px 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  border-radius: 6px;
  white-space: nowrap;
}

.economy-dropdown-item:hover,
.economy-dropdown-item:focus {
  background: rgba(255, 255, 255, 0.12);
}
</style>
