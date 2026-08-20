<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300..700&display=swap');

html.newsite-active {
  /* Always reserve the vertical scrollbar gutter. The layout scale is derived
     from documentElement.clientWidth, which shrinks when a classic scrollbar
     appears — and since the chrome's height is a multiple of that scale, a
     narrow band of window sizes exists where the scrollbar's arrival shrinks
     the page just enough to make the scrollbar unnecessary, which brings it
     back, at frame rate. Reserving the gutter unconditionally breaks that loop,
     and stops the page jumping sideways when navigating between a short page
     and a long one. */
  overflow-y: scroll;
}

html.newsite-active,
html.newsite-active body {
  background: var(--bg-color);
  margin: 0;
  padding: 0;
  width: 100%;
  overflow-x: hidden;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  color: var(--text-color);
  font-family: var(--font-family);
}

:root {
  --OrbitDarkBlue:                   #336699;
  --OrbitLightBlue:                  #3399CC;
  --OrbitGreen:                      #66CC00;

  --bg-color:                        #003466;
  --text-color:                      #ffffff;
  --font-family:                     'Nunito', sans-serif;

  --site-container-bg:               transparent;
  /* topbar 105 + sidebar 682 + footer 60, plus the two 10px row gaps between
     them. This was 862px, five short, so `overflow: hidden` clipped the bottom
     edge of the footer. Barely visible while everything was scaled to 70%;
     plainly visible now that the chrome renders at 1:1. Mirrored by SITE_HEIGHT
     in utils/siteScale.js. */
  --site-container-height:           867px;
  --site-container-width:            1040px;
  --site-container-radius:           0px;
  --site-container-border-thickness: 0px;
  --site-container-border-color:     transparent;
  --site-container-row-gap:          10px;
  --site-container-column-gap:       8px;
  --site-container-pt:               0px;
  --site-container-pb:               0px;
  --site-container-pl:               0px;
  --site-container-pr:               0px;

  --topbar-bg:                       transparent;
  --topbar-height:                   105px;
  --topbar-width:                    1040px;
  --topbar-radius:                   0px;
  --topbar-border-thickness:         0px;
  --topbar-border-color:             transparent;
  --topbar-gap:                      10px;
  --topbar-pt:                       0px;
  --topbar-pb:                       0px;
  --topbar-pl:                       0px;
  --topbar-pr:                       0px;

  --topbar-primary-bg:                 var(--OrbitDarkBlue);
  --topbar-primary-height:             65px;
  --topbar-primary-radius:             8px;
  --topbar-primary-border-thickness:   2px;
  --topbar-primary-border-color:       var(--OrbitDarkBlue);
  --topbar-primary-pt:                 0px;
  --topbar-primary-pb:                 0px;
  --topbar-primary-pl:                 0px;
  --topbar-primary-pr:                 0px;

  --topbar-primary-logo-bg:            #000000;
  --topbar-primary-logo-height:        var(--topbar-primary-height);
  --topbar-primary-logo-width:         200px;
  --topbar-primary-logo-scale-x:       1;
  --topbar-primary-logo-scale-y:       1.1;
  --topbar-primary-logo-radius:        8px 0 0 8px;
  --topbar-primary-logo-border-thickness: 0px;
  --topbar-primary-logo-border-color:  transparent;
  --topbar-primary-logo-pt:            0px;
  --topbar-primary-logo-pb:            0px;
  --topbar-primary-logo-pl:            0px;
  --topbar-primary-logo-pr:            8px;

  --topbar-primary-promolabel-bg:         transparent;
  --topbar-primary-promolabel-height:     var(--topbar-primary-height);
  --topbar-primary-promolabel-width:      20px;
  --topbar-primary-promolabel-scale-x:    1;
  --topbar-primary-promolabel-scale-y:    1;
  --topbar-primary-promolabel-radius:     0px;
  --topbar-primary-promolabel-border-thickness: 0px;
  --topbar-primary-promolabel-border-color: transparent;
  --topbar-primary-promolabel-pt:         0px;
  --topbar-primary-promolabel-pb:         0px;
  --topbar-primary-promolabel-pl:         0px;
  --topbar-primary-promolabel-pr:         0px;

  --topbar-primary-promo-bg:              transparent;
  --topbar-primary-promo-height:          var(--topbar-primary-height);
  --topbar-primary-promo-width:           460px;
  --topbar-primary-promo-radius:          0px;
  --topbar-primary-promo-border-thickness: 0px;
  --topbar-primary-promo-border-color:    transparent;
  --topbar-primary-promo-pt:              0px;
  --topbar-primary-promo-pb:              0px;
  --topbar-primary-promo-pl:              0px;
  --topbar-primary-promo-pr:              0px;

  --topbar-primary-rewatch-bg:         transparent;
  --topbar-primary-rewatch-height:     var(--topbar-primary-height);
  --topbar-primary-rewatch-width:      100px;
  --topbar-primary-rewatch-radius:     0px;
  --topbar-primary-rewatch-border-thickness: 0px;
  --topbar-primary-rewatch-border-color: transparent;
  --topbar-primary-rewatch-pt:         0px;
  --topbar-primary-rewatch-pb:         0px;
  --topbar-primary-rewatch-pl:         0px;
  --topbar-primary-rewatch-pr:         0px;

  --topbar-nav-bg:                   transparent;
  --topbar-nav-height:               30px;
  --topbar-nav-radius:               0px;
  --topbar-nav-border-thickness:     0px;
  --topbar-nav-border-color:         transparent;;
  --topbar-nav-pt:                   0px;
  --topbar-nav-pb:                   0px;
  --topbar-nav-pl:                   0px;
  --topbar-nav-pr:                   0px;
  --topbar-nav-gap:                  10px;

  --topbar-nav-left-bg:              var(--OrbitLightBlue);
  --topbar-nav-left-height:          var(--topbar-nav-height);
  --topbar-nav-left-width:           330px;
  --topbar-nav-left-radius:          8px;
  --topbar-nav-left-border-thickness: 0px;
  --topbar-nav-left-border-color:    var(--OrbitLightBlue);
  --topbar-nav-left-pt:              0px;
  --topbar-nav-left-pb:              0px;
  --topbar-nav-left-pl:              0px;
  --topbar-nav-left-pr:              0px;

  --topbar-nav-right-bg:             var(--OrbitDarkBlue);
  --topbar-nav-right-height:         var(--topbar-nav-height);
  --topbar-nav-right-width:          700px;
  --topbar-nav-right-radius:         8px;
  --topbar-nav-right-border-thickness: 0px;
  --topbar-nav-right-border-color:   var(--OrbitDarkBlue);
  --topbar-nav-right-pt:             0px;
  --topbar-nav-right-pb:             0px;
  --topbar-nav-right-pl:             0px;
  --topbar-nav-right-pr:             0px;

  --sidebar-bg:                      var(--OrbitLightBlue);
  --sidebar-height:                  682px;
  --sidebar-width:                   232px;
  --sidebar-radius:                  8px;
  --sidebar-border-thickness:        0px;
  --sidebar-border-color:            var(--OrbitLightBlue);
  --sidebar-pt:                      0px;
  --sidebar-pb:                      0px;
  --sidebar-pl:                      0px;
  --sidebar-pr:                      0px;

  --sidebar-top-bg:                  var(--OrbitDarkBlue);
  --sidebar-top-height:              85px;
  --sidebar-top-width:               224px;
  --sidebar-top-radius:              8px;
  --sidebar-top-border-thickness:    0px;
  --sidebar-top-border-color:        transparent;
  --sidebar-top-pt:                  0px;
  --sidebar-top-pb:                  0px;
  --sidebar-top-pl:                  0px;
  --sidebar-top-pr:                  0px;
  --sidebar-top-mt:                  4px;
  --sidebar-top-mb:                  4px;
  --sidebar-top-ml:                  0px;
  --sidebar-top-mr:                  0px;

  --sidebar-middle-bg:               var(--OrbitDarkBlue);
  --sidebar-middle-height:           495px;
  --sidebar-middle-width:            224px;
  --sidebar-middle-radius:           8px;
  --sidebar-middle-border-thickness: 0px;
  --sidebar-middle-border-color:     transparent;
  --sidebar-middle-pt:               0px;
  --sidebar-middle-pb:               0px;
  --sidebar-middle-pl:               0px;
  --sidebar-middle-pr:               0px;
  --sidebar-middle-mt:               0px;
  --sidebar-middle-mb:               4px;
  --sidebar-middle-ml:               0px;
  --sidebar-middle-mr:               0px;

  --sidebar-bottom-bg:               var(--OrbitDarkBlue);
  --sidebar-bottom-height:           78px;
  --sidebar-bottom-width:            224px;
  --sidebar-bottom-radius:           8px;
  --sidebar-bottom-border-thickness: 0px;
  --sidebar-bottom-border-color:     transparent;
  --sidebar-bottom-pt:               0px;
  --sidebar-bottom-pb:               0px;
  --sidebar-bottom-pl:               0px;
  --sidebar-bottom-pr:               0px;
  --sidebar-bottom-mt:               0px;
  --sidebar-bottom-mb:               4px;
  --sidebar-bottom-ml:               0px;
  --sidebar-bottom-mr:               0px;

  --main-content-bg:                 transparent;
  --main-content-height:             682px;
  --main-content-width:              800px;
  --main-content-radius:             8px;
  --main-content-border-thickness:   4px;
  --main-content-border-color:       var(--OrbitLightBlue);
  --main-content-pt:                 0px;
  --main-content-pb:                 0px;
  --main-content-pl:                 0px;
  --main-content-pr:                 0px;

  --footer-bg:                       transparent;
  --footer-height:                   60px;
  --footer-width:                    1040px;

  --shortcard-width:                      132px;
  --shortcard-height:                     176px;
  --footer-radius:                   0px;
  --footer-border-thickness:         0px;
  --footer-border-color:             transparent;
  --footer-pt:                       0px;
  --footer-pb:                       0px;
  --footer-pl:                       0px;
  --footer-pr:                       0px;
}
</style>

<template>
  <div class="site-container" :class="{ 'site-container-fluid': fluidLayout }" :style="[{ gridTemplateRows: gridRows, gridTemplateColumns: gridColumns }, scaleStyle]">
    <div class="topbar" :style="isMobile ? { height: 'auto', overflow: 'visible', width: '100%' } : {}">
      <div class="topbar-primary" :style="[{ visibility: showAdbar ? 'visible' : 'hidden' }, isMobile ? { width: '100%' } : {}]">
        <div v-if="!isMobile" class="topbar-primary-logo"><ReorbitLogo /></div>
        <div class="topbar-primary-promolabel" :style="{ marginLeft: isMobile ? '0' : 'auto' }"><ClientOnly><PromoLabel /></ClientOnly></div>
        <div class="topbar-primary-promo" :style="isMobile ? { flex: '1', width: 'auto' } : {}"><ClientOnly><PromoSpot /></ClientOnly></div>
        <div v-if="!isMobile" class="topbar-primary-rewatch"><Rewatch /></div>
      </div>
      <div class="topbar-nav"
        :style="[
          { visibility: showNav ? 'visible' : 'hidden' },
          isMobile ? { flexDirection: 'column', height: 'auto', overflow: 'visible', gap: '4px', width: '100%' } : {}
        ]"
      >
        <div class="topbar-nav-left" :style="isMobile ? { width: '100%' } : {}"><NavLeft :isMobile="isMobile" /></div>
        <div class="topbar-nav-right" :style="isMobile ? { width: '100%' } : {}"><NavRight :isMobile="isMobile" /></div>
      </div>
    </div>
    <div class="sidebar" :style="[{ display: showSidebar ? '' : 'none' }, isMobile ? { width: '100%', height: 'auto', boxSizing: 'border-box', paddingLeft: '5px', paddingRight: '5px' } : {}]">
      <button v-if="isMobile" class="sidebar-toggle" @click="mobileSidebarCollapsed = !mobileSidebarCollapsed">
        {{ mobileSidebarCollapsed ? '▼ Show Sidebar' : '▲ Hide Sidebar' }}
      </button>
      <template v-if="!isMobile || !mobileSidebarCollapsed">
        <div class="sidebar-top"    :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto' } : {}"><UserInfo /></div>
        <!-- No fixed height: --sidebar-middle-height varies per page, so
             .sidebar-chat flexes to fill what's left after UserInfo instead. -->
        <div v-if="showChatInSidebar" class="sidebar-chat"><LazyDiscordChat /></div>
        <template v-else>
          <div class="sidebar-middle" :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', marginTop: 'var(--sidebar-middle-mt)', marginBottom: 'var(--sidebar-middle-mb)' } : {}">
            <MiddleSidebarImages v-show="!sidebarMiddleComponent" />
            <CmartSidebar        v-show="sidebarMiddleComponent === 'CmartSidebar'" />
            <NewcmartSidebar     v-show="sidebarMiddleComponent === 'NewcmartSidebar'" />
            <AuctionHouseSidebar v-show="sidebarMiddleComponent === 'AuctionHouseSidebar'" />
            <MyCollectionSidebar v-show="sidebarMiddleComponent === 'MyCollectionSidebar'" />
            <AllCtoonsSidebar    v-show="sidebarMiddleComponent === 'AllCtoonsSidebar'" />
            <MyWishlistSidebar   v-show="sidebarMiddleComponent === 'MyWishlistSidebar'" />
            <TradeSidebarWrapper v-show="sidebarMiddleComponent === 'TradeSidebarWrapper'" />
            <CzoneSidebarMiddle  v-show="sidebarMiddleComponent === 'CzoneSidebarMiddle'" />
          </div>
          <div class="sidebar-bottom" :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', marginTop: 'var(--sidebar-bottom-mt)' } : {}"><WinballPromo /></div>
        </template>
      </template>
    </div>
    <!-- Teleported sheet, not a sidebar region: the sidebar body above sits
         behind a v-if keyed on mobileSidebarCollapsed, so a panel inside it
         would be unmounted (dropping the socket) by the "Hide Sidebar" button.
         position:fixed resolves against the real viewport here because the
         chrome's transform is dropped below 768px. -->
    <Teleport to="body">
      <div v-if="showChatSheet" class="chat-sheet" role="dialog" aria-modal="true" aria-label="Discord chat">
        <LazyDiscordChat sheet @close="chatOpen = false" />
      </div>
    </Teleport>
    <div class="main-content" :class="{ 'main-content-full': !showSidebar && !isMobile, 'main-content-expand': !showFooter }" :style="[{ border: mainContentBorder }, mainContentMobileStyle]"><slot /></div>
    <div class="footer" :style="[{ display: showFooter ? '' : 'none' }, isMobile ? { width: '100%', height: 'auto', aspectRatio: '800 / 60' } : {}]"><slot name="footer" /></div>
    <CtoonInfoCard v-if="ctoonModalIsOpen" />
    <AuctionModal
      v-if="auctionModalIsOpen && auctionModalCtoon"
      :ctoon="auctionModalCtoon"
      :prefill="auctionModalPrefill"
      @close="closeAuctionModal"
      @created="onAuctionCreated"
    />
  </div>
  <!-- Hidden while a modal is up. `.site-container` gets `transform: scale()` on
       desktop, which makes it a stacking context at z-index auto, so the modals
       inside it (CtoonInfoCard at 10000, AuctionModal at 1000) are trapped below
       this sibling's z-50 and the floating pill paints over them. On mobile the
       transform is dropped, the container stops being a stacking context, and
       the modals cover the pill correctly — so without this the behaviour flips
       at 768px, which is exactly the class of bug the note above warns about.
       A permanently-visible unread badge would make it obvious. -->
  <Onboarding v-if="!ctoonModalIsOpen && !auctionModalIsOpen" />
  <CMoonSelectModal />
</template>

<script setup>
import { computeSiteScale, scaleMarginBottom, MOBILE_QUERY } from '~/utils/siteScale'

const route = useRoute()
const { isOpen: ctoonModalIsOpen } = useCtoonModal()
const {
  isOpen:  auctionModalIsOpen,
  ctoon:   auctionModalCtoon,
  prefill: auctionModalPrefill,
  close:   closeAuctionModal,
  notifyCreated: notifyAuctionCreated
} = useAuctionModal()

function onAuctionCreated(userCtoonId) {
  notifyAuctionCreated(userCtoonId)
}
const { sidebarMiddleComponent, mobileSidebarCollapsed, chatOpen } = useNewsiteLayout()
const czoneState = useNewSiteCzoneState()

const siteName = 'Cartoon ReOrbit'
const defaultDescription = "Cartoon ReOrbit is a fan-made revival of Cartoon Network's Cartoon Orbit. Collect cToons, build your cZone, trade with other players, and play games."
const resolveMeta = value =>
  typeof value === 'function' ? value(route) : typeof value === 'string' ? value : ''
const pageTitle = computed(() => resolveMeta(route.meta.title))
const fullTitle = computed(() => (pageTitle.value ? `${pageTitle.value} | ${siteName}` : siteName))
const pageDescription = computed(() => resolveMeta(route.meta.description) || defaultDescription)

useHead({ title: fullTitle })
useSeoMeta({
  description: pageDescription,
  ogTitle: fullTitle,
  ogDescription: pageDescription,
  ogSiteName: siteName,
  ogType: 'website',
  twitterCard: 'summary',
  robots: computed(() => route.meta.robots || null)
})

useHead({
  htmlAttrs: { class: 'newsite-active' },
  bodyAttrs: { class: computed(() => {
    const pageClass  = route.name ? `page-${String(route.name).toLowerCase()}` : ''
    const buildClass = czoneState.value.buildMode ? 'czone-build' : ''
    return [pageClass, buildClass].filter(Boolean).join(' ')
  })
} })
const showAdbar = computed(() => route.meta.showAdbar !== false)
const showNav = computed(() => route.meta.showNav !== false)
const showSidebar = computed(() => route.meta.showSidebar !== false)
const showFooter = computed(() => route.meta.showFooter !== false)

// Chat only exists where the sidebar does (hidden on the games + admin console).
const chatAvailable = computed(() => showSidebar.value && !fluidLayout.value)
const showChatInSidebar = computed(() => chatOpen.value && chatAvailable.value && !isMobile.value)
const showChatSheet = computed(() => chatOpen.value && chatAvailable.value && isMobile.value)
const mainContentBorder = computed(() => route.meta.mainContentBorder === false ? 'none' : undefined)


// Pages that opt into `fluidLayout` (currently the admin console) escape the
// fixed-size retro chrome entirely. That chrome is a `transform: scale()`
// container, and a transform — even `scale(1)` — makes the element the
// containing block for `position: fixed` descendants, so every `fixed inset-0`
// modal inside it resolves against the 1040px box and is then clipped by
// `.site-container { overflow: hidden }`. It also decouples viewport media
// queries from the content width, which makes responsive CSS meaningless.
// Dense tables and modals need real viewport semantics.
const fluidLayout = computed(() => route.meta.fluidLayout === true)

const gridColumns = computed(() => {
  if (fluidLayout.value) return '1fr'
  return isMobile.value ? '1fr' : 'var(--sidebar-width) var(--main-content-width)'
})

const gridRows = computed(() => {
  if (fluidLayout.value) return 'auto minmax(0, 1fr)'
  if (isMobile.value) return 'auto auto auto auto'
  return showFooter.value
    ? 'var(--topbar-height) var(--sidebar-height) var(--footer-height)'
    : 'var(--topbar-height) 1fr'
})

// Opt back into the old shrink-to-fit-the-height behaviour. The chrome is taller
// than a 768p laptop's viewport, so fitting height means never rendering at full
// size there — but a handful of pages genuinely cannot tolerate a scrolling
// page and are better off small. Two verified reasons, not hypotheticals:
// pages/newsite/blackjack.vue measures document overflow and shrinks its table
// to absorb it (a deliberately-overflowing page would collapse the table to its
// 300px floor), and pages/newsite/flappypowerpuff.vue pins `body` on every game
// start to defeat pull-to-refresh, which would strand the bottom of a scrolling
// playfield off-screen. Timed canvas games also just play badly when the
// playfield can scroll out from under the player.
const fitHeight = computed(() => route.meta.fitHeight === true)

const scale = ref(1)
const isMobile = ref(false)

// `isMobile` comes straight from the same media query the CSS uses, rather than
// from a measured width, so the layout's JS and its own `@media (max-width:
// 768px)` blocks cannot disagree about which mode they are in. That mismatch is
// exactly what composables/useIsNarrow.js was written to work around back when
// this was computed from a zoom-adjusted width.
let mql = null

// Measured in CSS pixels, with no devicePixelRatio anywhere: see the long note
// in utils/siteScale.js for why trying to detect and cancel out browser zoom is
// what broke reloads for zoomed-in players. clientWidth excludes a classic
// vertical scrollbar; innerWidth (which includes it) is the SSR-safe fallback.
const measure = () => {
  const el = document.documentElement
  const width = el?.clientWidth || window.innerWidth
  scale.value = fitHeight.value
    ? computeSiteScale(width, el?.clientHeight || window.innerHeight)
    : computeSiteScale(width)
}

// Re-measures inline rather than going through the rAF-coalesced path: Vue
// flushes on the microtask queue, which runs before the next animation frame,
// so deferring here would paint one frame of the new mode at the old mode's
// scale — a visible pop when a phone rotates across the breakpoint.
const applyMobile = e => {
  isMobile.value = e.matches
  measure()
}

// Coalesced into a frame. Not for frequency — browsers already cap `resize` at
// one per frame — but for ordering: it defers the ref write, and so Vue's DOM
// patch, past the other resize listeners in the same dispatch. Several pages
// (MyCzone, CzoneEdit) read geometry in their own resize handlers, and without
// this they read it immediately after this layout rewrites `transform` on the
// whole chrome subtree, forcing a synchronous reflow.
let frame = null
const computeLayout = () => {
  if (frame !== null) return
  frame = requestAnimationFrame(() => {
    frame = null
    measure()
  })
}

onMounted(() => {
  mql = window.matchMedia(MOBILE_QUERY)
  // Read on mount, not during setup: the server always renders the desktop
  // branch, so applying a `mobile` value any earlier would be a hydration
  // mismatch on every narrow load.
  applyMobile(mql)
  mql.addEventListener('change', applyMobile)
  window.addEventListener('resize', computeLayout)
})

onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame)
  mql?.removeEventListener('change', applyMobile)
  window.removeEventListener('resize', computeLayout)
  releaseChatSheet()
})

// Mobile chat sheet: visualViewport sizes it around the iOS keyboard (100dvh
// doesn't shrink for it), and the body-pin defeats pull-to-refresh, which
// would otherwise reload the page and drop the socket + scrollback.
let sheetScrollY = 0
let sheetPinned = false

const syncChatSheet = () => {
  const el = document.querySelector('.chat-sheet')
  const vv = window.visualViewport
  if (!el || !vv) return
  el.style.height = `${vv.height}px`
  el.style.transform = `translateY(${vv.offsetTop}px)`
}

function holdChatSheet() {
  if (sheetPinned) return
  sheetPinned = true
  sheetScrollY = window.scrollY
  document.body.style.position = 'fixed'
  document.body.style.top = `-${sheetScrollY}px`
  document.body.style.width = '100%'
  document.documentElement.style.overscrollBehaviorY = 'none'
  window.visualViewport?.addEventListener('resize', syncChatSheet)
  window.visualViewport?.addEventListener('scroll', syncChatSheet)
  nextTick(syncChatSheet)
}

function releaseChatSheet() {
  if (!sheetPinned) return
  sheetPinned = false
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.width = ''
  document.documentElement.style.overscrollBehaviorY = ''
  window.visualViewport?.removeEventListener('resize', syncChatSheet)
  window.visualViewport?.removeEventListener('scroll', syncChatSheet)
  window.scrollTo(0, sheetScrollY)
}

watch(showChatSheet, (open) => {
  if (open) holdChatSheet()
  else releaseChatSheet()
})

const mainContentMobileStyle = computed(() => {
  if (fluidLayout.value) return { width: '100%', height: '100%', minHeight: '0' }
  if (!isMobile.value) return {}
  return {
    width: '100%',
    height: 'auto',
  }
})

const scaleStyle = computed(() => {
  // No transform at all in fluid mode — see `fluidLayout` above.
  if (fluidLayout.value) return {}
  if (isMobile.value) {
    return {
      width: '100%',
      height: 'auto',
    }
  }
  // The transform stays even at scale(1). It is free — a static 2D scale is not
  // layer-promoted — and dropping it conditionally would make the container a
  // containing block for `position: fixed` descendants at some window widths
  // but not others. Several places already depend on the current, consistent
  // behaviour (pages/newsite/edrps.vue teleports its overlay to body for
  // exactly this reason), and a containing block that flips on viewport width
  // produces bugs that only reproduce at specific window sizes. `fluidLayout`
  // above is the explicit, per-route way to opt out.
  return {
    transform: `scale(${scale.value})`,
    transformOrigin: 'top center',
    marginBottom: `${scaleMarginBottom(scale.value)}px`,
    // Lets the chat panel counter-scale so its text stays readable at small
    // window widths, where scale can floor near 0.72.
    '--site-scale': String(scale.value)
  }
})
</script>

<style scoped>
.site-container {
  width: var(--site-container-width);
  height: var(--site-container-height);
  min-width: var(--site-container-width);
  min-height: var(--site-container-height);
  flex-shrink: 0;
  background: var(--site-container-bg);
  border-radius: var(--site-container-radius);
  border: var(--site-container-border-thickness) solid var(--site-container-border-color);
  padding: var(--site-container-pt) var(--site-container-pr) var(--site-container-pb) var(--site-container-pl);
  display: grid;
  grid-template-columns: var(--sidebar-width) var(--main-content-width);
  grid-template-rows: var(--topbar-height) var(--sidebar-height) var(--footer-height);
  row-gap: var(--site-container-row-gap);
  column-gap: var(--site-container-column-gap);
  overflow: hidden;
}

/* Fluid mode: full-viewport, no fixed track sizes, no clipping. Everything a
   dense admin table or a `position: fixed` modal needs in order to behave. */
.site-container-fluid {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: auto;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: visible;
}

.site-container-fluid .topbar,
.site-container-fluid .topbar-primary,
.site-container-fluid .topbar-nav,
.site-container-fluid .topbar-nav-left,
.site-container-fluid .topbar-nav-right {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}

.site-container-fluid .topbar {
  height: auto;
}

.site-container-fluid .main-content {
  grid-column: 1 / -1;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  overflow: visible;
}

.topbar {
  grid-column: 1 / -1;
  width: var(--topbar-width);
  height: var(--topbar-height);
  background: var(--topbar-bg);
  border-radius: var(--topbar-radius);
  border: var(--topbar-border-thickness) solid var(--topbar-border-color);
  padding: var(--topbar-pt) var(--topbar-pr) var(--topbar-pb) var(--topbar-pl);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  gap: var(--topbar-gap);
}

.topbar-primary {
  height: var(--topbar-primary-height);
  background: var(--topbar-primary-bg);
  border-radius: var(--topbar-primary-radius);
  border: var(--topbar-primary-border-thickness) solid var(--topbar-primary-border-color);
  align-items: center;
  overflow: hidden;
  padding: var(--topbar-primary-pt) var(--topbar-primary-pr) var(--topbar-primary-pb) var(--topbar-primary-pl);
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
}

.topbar-primary-logo {
  width: var(--topbar-primary-logo-width);
  height: var(--topbar-primary-logo-height);
  background: var(--topbar-primary-logo-bg);
  transform: scale(var(--topbar-primary-logo-scale-x), var(--topbar-primary-logo-scale-y));
  border-radius: var(--topbar-primary-logo-radius);
  border: var(--topbar-primary-logo-border-thickness) solid var(--topbar-primary-logo-border-color);
  padding: var(--topbar-primary-logo-pt) var(--topbar-primary-logo-pr) var(--topbar-primary-logo-pb) var(--topbar-primary-logo-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-primary-promolabel {
  margin-left: auto;
  width: var(--topbar-primary-promolabel-width);
  height: var(--topbar-primary-promolabel-height);
  background: var(--topbar-primary-promolabel-bg);
  transform: scale(var(--topbar-primary-promolabel-scale-x), var(--topbar-primary-promolabel-scale-y));
  border-radius: var(--topbar-primary-promolabel-radius);
  border: var(--topbar-primary-promolabel-border-thickness) solid var(--topbar-primary-promolabel-border-color);
  padding: var(--topbar-primary-promolabel-pt) var(--topbar-primary-promolabel-pr) var(--topbar-primary-promolabel-pb) var(--topbar-primary-promolabel-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-primary-promo {
  width: var(--topbar-primary-promo-width);
  height: var(--topbar-primary-promo-height);
  background: var(--topbar-primary-promo-bg);
  border-radius: var(--topbar-primary-promo-radius);
  border: var(--topbar-primary-promo-border-thickness) solid var(--topbar-primary-promo-border-color);
  padding: var(--topbar-primary-promo-pt) var(--topbar-primary-promo-pr) var(--topbar-primary-promo-pb) var(--topbar-primary-promo-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-primary-rewatch {
  margin-left: auto;
  width: var(--topbar-primary-rewatch-width);
  height: var(--topbar-primary-rewatch-height);
  background: var(--topbar-primary-rewatch-bg);
  border-radius: var(--topbar-primary-rewatch-radius);
  border: var(--topbar-primary-rewatch-border-thickness) solid var(--topbar-primary-rewatch-border-color);
  padding: var(--topbar-primary-rewatch-pt) var(--topbar-primary-rewatch-pr) var(--topbar-primary-rewatch-pb) var(--topbar-primary-rewatch-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-nav {
  height: var(--topbar-nav-height);
  background: var(--topbar-nav-bg);
  border-radius: var(--topbar-nav-radius);
  border: var(--topbar-nav-border-thickness) solid var(--topbar-nav-border-color);
  padding: var(--topbar-nav-pt) var(--topbar-nav-pr) var(--topbar-nav-pb) var(--topbar-nav-pl);
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  overflow: hidden;
  gap: var(--topbar-nav-gap);
}

.topbar-nav-left {
  width: fit-content;
  height: var(--topbar-nav-left-height);
  background: var(--topbar-nav-left-bg);
  border-radius: var(--topbar-nav-left-radius);
  border: var(--topbar-nav-left-border-thickness) solid var(--topbar-nav-left-border-color);
  padding: var(--topbar-nav-left-pt) var(--topbar-nav-left-pr) var(--topbar-nav-left-pb) var(--topbar-nav-left-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-nav-right {
  flex: 1;
  min-width: 0;
  height: var(--topbar-nav-right-height);
  background: var(--topbar-nav-right-bg);
  border-radius: var(--topbar-nav-right-radius);
  border: var(--topbar-nav-right-border-thickness) solid var(--topbar-nav-right-border-color);
  padding: var(--topbar-nav-right-pt) var(--topbar-nav-right-pr) var(--topbar-nav-right-pb) var(--topbar-nav-right-pl);
  overflow: hidden;
}

.sidebar {
  height: var(--sidebar-height);
  background: var(--sidebar-bg);
  border-radius: var(--sidebar-radius);
  border: var(--sidebar-border-thickness) solid var(--sidebar-border-color);
  padding: var(--sidebar-pt) var(--sidebar-pr) var(--sidebar-pb) var(--sidebar-pl);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-toggle {
  width: 100%;
  padding: 6px 10px;
  background: var(--OrbitDarkBlue);
  color: white;
  border: none;
  border-radius: var(--sidebar-radius) var(--sidebar-radius) 0 0;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: bold;
  font-family: inherit;
  text-align: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .sidebar {
    background: var(--OrbitDarkBlue);
  }

  .sidebar-toggle {
    margin-left: -5px;
    margin-right: -5px;
    width: calc(100% + 10px);
  }
}

.sidebar-toggle:hover {
  background: var(--OrbitLightBlue);
}

.sidebar-top {
  width: var(--sidebar-top-width);
  height: var(--sidebar-top-height);
  background: var(--sidebar-top-bg);
  border-radius: var(--sidebar-top-radius);
  border: var(--sidebar-top-border-thickness) solid var(--sidebar-top-border-color);
  padding: var(--sidebar-top-pt) var(--sidebar-top-pr) var(--sidebar-top-pb) var(--sidebar-top-pl);
  margin: var(--sidebar-top-mt) var(--sidebar-top-mr) var(--sidebar-top-mb) var(--sidebar-top-ml);
  flex-shrink: 0;
  align-self: center;
  overflow: hidden;
}

.sidebar-middle {
  width: var(--sidebar-middle-width);
  height: var(--sidebar-middle-height);
  background: var(--sidebar-middle-bg);
  border-radius: var(--sidebar-middle-radius);
  border: var(--sidebar-middle-border-thickness) solid var(--sidebar-middle-border-color);
  padding: var(--sidebar-middle-pt) var(--sidebar-middle-pr) var(--sidebar-middle-pb) var(--sidebar-middle-pl);
  margin-top: var(--sidebar-middle-mt);
  margin-bottom: var(--sidebar-middle-mb);
  margin-left: var(--sidebar-middle-ml);
  margin-right: var(--sidebar-middle-mr);
  flex-shrink: 0;
  overflow: hidden;
  align-self: center;
}

/* min-height:0 required — without it a flex item's auto min-size refuses to
   shrink, and .sidebar { overflow: hidden } clips the composer off. */
.sidebar-chat {
  flex: 1 1 auto;
  min-height: 0;
  width: var(--sidebar-middle-width);
  align-self: center;
  margin-top: var(--sidebar-middle-mt);
  margin-bottom: var(--sidebar-bottom-mb);
  overflow: hidden;
}

/* Mobile-only full-screen sheet, teleported to body. height:100dvh is a pre-JS
   fallback — the visualViewport handler sets the real value above the keyboard. */
.chat-sheet {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100dvh;
  z-index: 60;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
}

.sidebar-bottom {
  width: var(--sidebar-bottom-width);
  height: var(--sidebar-bottom-height);
  background: var(--sidebar-bottom-bg);
  border-radius: var(--sidebar-bottom-radius);
  border: var(--sidebar-bottom-border-thickness) solid var(--sidebar-bottom-border-color);
  padding: var(--sidebar-bottom-pt) var(--sidebar-bottom-pr) var(--sidebar-bottom-pb) var(--sidebar-bottom-pl);
  margin-top: auto;
  margin-bottom: var(--sidebar-bottom-mb);
  margin-left: var(--sidebar-bottom-ml);
  margin-right: var(--sidebar-bottom-mr);
  flex-shrink: 0;
  overflow: hidden;
  align-self: center;
}

.main-content {
  width: var(--main-content-width);
  height: var(--main-content-height);
  box-sizing: border-box;
  flex-shrink: 0;
  background: var(--main-content-bg);
  border-radius: var(--main-content-radius);
  border: var(--main-content-border-thickness) solid var(--main-content-border-color);
  padding: var(--main-content-pt) var(--main-content-pr) var(--main-content-pb) var(--main-content-pl);
  overflow: hidden;
}

.main-content-full {
  grid-column: 1 / -1;
  width: var(--site-container-width);
}

.main-content-expand {
  height: auto;
  align-self: stretch;
}

@media (max-width: 768px) {
  .site-container,
  .topbar,
  .topbar-primary,
  .topbar-primary-logo,
  .topbar-primary-promolabel,
  .topbar-primary-promo,
  .topbar-primary-rewatch,
  .topbar-nav,
  .topbar-nav-left,
  .topbar-nav-right,
  .sidebar,
  .sidebar-toggle,
  .sidebar-top,
  .sidebar-middle,
  .sidebar-bottom,
  .main-content,
  .footer {
    flex-shrink: 1;
    min-width: unset;
    min-height: unset;
    max-width: 100%;
  }

  .site-container {
    width: 100%;
    overflow: visible;
    box-sizing: border-box;
  }

  .topbar-primary {
    overflow: visible;
    height: auto;
  }

  .topbar-nav-left,
  .topbar-nav-right {
    overflow: visible;
    height: auto;
  }

  .main-content {
    overflow-x: auto;
    overflow-y: auto;
    width: 100%;
    box-sizing: border-box;
  }
}

.footer {
  grid-column: 1 / -1;
  width: var(--footer-width);
  height: var(--footer-height);
  flex-shrink: 0;
  background: var(--footer-bg);
  border-radius: var(--footer-radius);
  border: var(--footer-border-thickness) solid var(--footer-border-color);
  padding: var(--footer-pt) var(--footer-pr) var(--footer-pb) var(--footer-pl);
  overflow: hidden;
}
</style>
