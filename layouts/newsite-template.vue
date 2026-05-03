<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300..700&display=swap');

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
  --site-container-height:           862px;
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

  --topbar-banner-bg:                 var(--OrbitDarkBlue);
  --topbar-banner-height:             65px;
  --topbar-banner-radius:             8px;
  --topbar-banner-border-thickness:   2px;
  --topbar-banner-border-color:       var(--OrbitDarkBlue);
  --topbar-banner-pt:                 0px;
  --topbar-banner-pb:                 0px;
  --topbar-banner-pl:                 0px;
  --topbar-banner-pr:                 0px;

  --topbar-banner-logo-bg:            #000000;
  --topbar-banner-logo-height:        var(--topbar-banner-height);
  --topbar-banner-logo-width:         200px;
  --topbar-banner-logo-scale-x:       1;
  --topbar-banner-logo-scale-y:       1.1;
  --topbar-banner-logo-radius:        0px;
  --topbar-banner-logo-border-thickness: 0px;
  --topbar-banner-logo-border-color:  transparent;
  --topbar-banner-logo-pt:            0px;
  --topbar-banner-logo-pb:            0px;
  --topbar-banner-logo-pl:            0px;
  --topbar-banner-logo-pr:            8px;

  --topbar-banner-label-bg:         transparent;
  --topbar-banner-label-height:     var(--topbar-banner-height);
  --topbar-banner-label-width:      20px;
  --topbar-banner-label-scale-x:    1;
  --topbar-banner-label-scale-y:    1;
  --topbar-banner-label-radius:     0px;
  --topbar-banner-label-border-thickness: 0px;
  --topbar-banner-label-border-color: transparent;
  --topbar-banner-label-pt:         0px;
  --topbar-banner-label-pb:         0px;
  --topbar-banner-label-pl:         0px;
  --topbar-banner-label-pr:         0px;

  --topbar-banner-spot-bg:              transparent;
  --topbar-banner-spot-height:          var(--topbar-banner-height);
  --topbar-banner-spot-width:           460px;
  --topbar-banner-spot-radius:          0px;
  --topbar-banner-spot-border-thickness: 0px;
  --topbar-banner-spot-border-color:    transparent;
  --topbar-banner-spot-pt:              0px;
  --topbar-banner-spot-pb:              0px;
  --topbar-banner-spot-pl:              0px;
  --topbar-banner-spot-pr:              0px;

  --topbar-banner-rewatch-bg:         transparent;
  --topbar-banner-rewatch-height:     var(--topbar-banner-height);
  --topbar-banner-rewatch-width:      100px;
  --topbar-banner-rewatch-radius:     0px;
  --topbar-banner-rewatch-border-thickness: 0px;
  --topbar-banner-rewatch-border-color: transparent;
  --topbar-banner-rewatch-pt:         0px;
  --topbar-banner-rewatch-pb:         0px;
  --topbar-banner-rewatch-pl:         0px;
  --topbar-banner-rewatch-pr:         0px;

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
  <div class="site-container" :style="[{ gridTemplateRows: gridRows, gridTemplateColumns: gridColumns }, scaleStyle]">
    <div class="topbar" :style="isMobile ? { height: 'auto', overflow: 'visible', width: '100%' } : {}">
      <div class="topbar-banner" :style="[{ visibility: showAdbar ? 'visible' : 'hidden' }, isMobile ? { width: '100%' } : {}]">
        <div v-if="!isMobile" class="topbar-banner-logo"><ReorbitLogo /></div>
        <div class="topbar-banner-label" :style="{ marginLeft: isMobile ? '0' : 'auto' }"><AdLabel /></div>
        <div class="topbar-banner-spot" :style="isMobile ? { flex: '1', width: 'auto' } : {}"><AdSpot /></div>
        <div v-if="!isMobile" class="topbar-banner-rewatch"><Rewatch /></div>
      </div>
      <div class="topbar-nav"
        :style="[
          { visibility: showNav ? 'visible' : 'hidden' },
          isMobile ? { flexDirection: 'column', height: 'calc(var(--topbar-nav-height) * 2 + 4px)', overflow: 'visible', gap: '4px', width: '100%' } : {}
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
        <div class="sidebar-top"    :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto' } : {}"><slot name="sidebar-top" /></div>
        <div class="sidebar-middle" :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', marginTop: 'var(--sidebar-middle-mt)', marginBottom: 'var(--sidebar-middle-mb)' } : {}"><slot name="sidebar-middle"><MiddleSidebarImages /></slot></div>
        <div class="sidebar-bottom" :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', marginTop: 'var(--sidebar-bottom-mt)' } : {}"><slot name="sidebar-bottom" /></div>
      </template>
    </div>
    <div class="main-content" :class="{ 'main-content-full': !showSidebar && !isMobile, 'main-content-expand': !showFooter }" :style="[{ border: mainContentBorder }, mainContentMobileStyle]"><slot name="main-content" /></div>
    <div class="footer" :style="[{ display: showFooter ? '' : 'none' }, isMobile ? { width: '100%', height: 'auto', aspectRatio: '800 / 60' } : {}]"><slot name="footer" /></div>
    <slot />
    <CtoonInfoCard v-if="ctoonModalIsOpen" />
  </div>
</template>

<script setup>
const route = useRoute()
const { isOpen: ctoonModalIsOpen } = useCtoonModal()
const czoneState = useState('newSiteCzoneState', () => ({ buildMode: false }))
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
const mainContentBorder = computed(() => route.meta.mainContentBorder === false ? 'none' : undefined)
const mobileSidebarCollapsed = ref(true)

const gridColumns = computed(() =>
  isMobile.value ? '1fr' : 'var(--sidebar-width) var(--main-content-width)'
)

const gridRows = computed(() => {
  if (isMobile.value) return 'auto auto auto auto'
  return showFooter.value
    ? 'var(--topbar-height) var(--sidebar-height) var(--footer-height)'
    : 'var(--topbar-height) 1fr'
})

const SITE_WIDTH = 1040
const SITE_HEIGHT = 862
const SITE_PADDING = 20
const MOBILE_BREAKPOINT = 768
const MAIN_CONTENT_WIDTH = 800
const MAIN_CONTENT_HEIGHT = 669
const scale = ref(1)
const isMobile = ref(false)

const computeLayout = () => {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
  if (!isMobile.value) {
    const scaleX = (window.innerWidth - SITE_PADDING) / SITE_WIDTH
    const scaleY = (window.innerHeight - SITE_PADDING) / SITE_HEIGHT
    scale.value = Math.min(scaleX, scaleY, 1)
  }
}

onMounted(() => {
  computeLayout()
  window.addEventListener('resize', computeLayout)
})

onUnmounted(() => {
  window.removeEventListener('resize', computeLayout)
})

const mainContentMobileStyle = computed(() => {
  if (!isMobile.value) return {}
  return {
    width: '100%',
    height: 'auto',
  }
})

const scaleStyle = computed(() => {
  if (isMobile.value) {
    return {
      width: '100%',
      height: 'auto',
    }
  }
  return {
    transform: `scale(${scale.value})`,
    transformOrigin: 'top center',
    marginBottom: `${(scale.value - 1) * SITE_HEIGHT}px`
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

.topbar-banner {
  height: var(--topbar-banner-height);
  background: var(--topbar-banner-bg);
  border-radius: var(--topbar-banner-radius);
  border: var(--topbar-banner-border-thickness) solid var(--topbar-banner-border-color);
  align-items: center;
  overflow: hidden;
  padding: var(--topbar-banner-pt) var(--topbar-banner-pr) var(--topbar-banner-pb) var(--topbar-banner-pl);
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
}

.topbar-banner-logo {
  width: var(--topbar-banner-logo-width);
  height: var(--topbar-banner-logo-height);
  background: var(--topbar-banner-logo-bg);
  transform: scale(var(--topbar-banner-logo-scale-x), var(--topbar-banner-logo-scale-y));
  border-radius: var(--topbar-banner-logo-radius);
  border: var(--topbar-banner-logo-border-thickness) solid var(--topbar-banner-logo-border-color);
  padding: var(--topbar-banner-logo-pt) var(--topbar-banner-logo-pr) var(--topbar-banner-logo-pb) var(--topbar-banner-logo-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-banner-label {
  margin-left: auto;
  width: var(--topbar-banner-label-width);
  height: var(--topbar-banner-label-height);
  background: var(--topbar-banner-label-bg);
  transform: scale(var(--topbar-banner-label-scale-x), var(--topbar-banner-label-scale-y));
  border-radius: var(--topbar-banner-label-radius);
  border: var(--topbar-banner-label-border-thickness) solid var(--topbar-banner-label-border-color);
  padding: var(--topbar-banner-label-pt) var(--topbar-banner-label-pr) var(--topbar-banner-label-pb) var(--topbar-banner-label-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-banner-spot {
  width: var(--topbar-banner-spot-width);
  height: var(--topbar-banner-spot-height);
  background: var(--topbar-banner-spot-bg);
  border-radius: var(--topbar-banner-spot-radius);
  border: var(--topbar-banner-spot-border-thickness) solid var(--topbar-banner-spot-border-color);
  padding: var(--topbar-banner-spot-pt) var(--topbar-banner-spot-pr) var(--topbar-banner-spot-pb) var(--topbar-banner-spot-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-banner-rewatch {
  margin-left: auto;
  width: var(--topbar-banner-rewatch-width);
  height: var(--topbar-banner-rewatch-height);
  background: var(--topbar-banner-rewatch-bg);
  border-radius: var(--topbar-banner-rewatch-radius);
  border: var(--topbar-banner-rewatch-border-thickness) solid var(--topbar-banner-rewatch-border-color);
  padding: var(--topbar-banner-rewatch-pt) var(--topbar-banner-rewatch-pr) var(--topbar-banner-rewatch-pb) var(--topbar-banner-rewatch-pl);
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
  width: var(--topbar-nav-right-width);
  height: var(--topbar-nav-right-height);
  background: var(--topbar-nav-right-bg);
  border-radius: var(--topbar-nav-right-radius);
  border: var(--topbar-nav-right-border-thickness) solid var(--topbar-nav-right-border-color);
  padding: var(--topbar-nav-right-pt) var(--topbar-nav-right-pr) var(--topbar-nav-right-pb) var(--topbar-nav-right-pl);
  flex-shrink: 0;
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
  .topbar-banner,
  .topbar-banner-logo,
  .topbar-banner-label,
  .topbar-banner-spot,
  .topbar-banner-rewatch,
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
