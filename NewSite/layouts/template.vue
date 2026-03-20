<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300..700&display=swap');

html, body {
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
  --site-container-height:           670px;
  --site-container-width:            800px;
  --site-container-radius:           0px;
  --site-container-border-thickness: 0px;
  --site-container-border-color:     transparent;
  --site-container-row-gap:          10px;
  --site-container-column-gap:       var(--topbar-nav-gap);
  --site-container-pt:               0px;
  --site-container-pb:               0px;
  --site-container-pl:               0px;
  --site-container-pr:               0px;

  --topbar-bg:                       transparent;
  --topbar-height:                   105px;
  --topbar-width:                    800px;
  --topbar-radius:                   0px;
  --topbar-border-thickness:         0px;
  --topbar-border-color:             transparent;
  --topbar-gap:                      10px;
  --topbar-pt:                       0px;
  --topbar-pb:                       0px;
  --topbar-pl:                       0px;
  --topbar-pr:                       0px;

  --topbar-adbar-bg:                 var(--OrbitDarkBlue);
  --topbar-adbar-height:             65px;
  --topbar-adbar-radius:             8px;
  --topbar-adbar-border-thickness:   2px;
  --topbar-adbar-border-color:       var(--OrbitDarkBlue);
  --topbar-adbar-pt:                 0px;
  --topbar-adbar-pb:                 0px;
  --topbar-adbar-pl:                 0px;
  --topbar-adbar-pr:                 0px;

  --topbar-adbar-logo-bg:            #000000;
  --topbar-adbar-logo-height:        var(--topbar-adbar-height);
  --topbar-adbar-logo-width:         200px;
  --topbar-adbar-logo-scale-x:       1;
  --topbar-adbar-logo-scale-y:       1.1;
  --topbar-adbar-logo-radius:        0px;
  --topbar-adbar-logo-border-thickness: 0px;
  --topbar-adbar-logo-border-color:  transparent;
  --topbar-adbar-logo-pt:            0px;
  --topbar-adbar-logo-pb:            0px;
  --topbar-adbar-logo-pl:            0px;
  --topbar-adbar-logo-pr:            8px;

  --topbar-adbar-adlabel-bg:         transparent;
  --topbar-adbar-adlabel-height:     var(--topbar-adbar-height);
  --topbar-adbar-adlabel-width:      20px;
  --topbar-adbar-adlabel-scale-x:    1;
  --topbar-adbar-adlabel-scale-y:    1;
  --topbar-adbar-adlabel-radius:     0px;
  --topbar-adbar-adlabel-border-thickness: 0px;
  --topbar-adbar-adlabel-border-color: transparent;
  --topbar-adbar-adlabel-pt:         0px;
  --topbar-adbar-adlabel-pb:         0px;
  --topbar-adbar-adlabel-pl:         0px;
  --topbar-adbar-adlabel-pr:         0px;

  --topbar-adbar-ad-bg:              transparent;
  --topbar-adbar-ad-height:          var(--topbar-adbar-height);
  --topbar-adbar-ad-width:           460px;
  --topbar-adbar-ad-radius:          0px;
  --topbar-adbar-ad-border-thickness: 0px;
  --topbar-adbar-ad-border-color:    transparent;
  --topbar-adbar-ad-pt:              0px;
  --topbar-adbar-ad-pb:              0px;
  --topbar-adbar-ad-pl:              0px;
  --topbar-adbar-ad-pr:              0px;

  --topbar-adbar-rewatch-bg:         transparent;
  --topbar-adbar-rewatch-height:     var(--topbar-adbar-height);
  --topbar-adbar-rewatch-width:      100px;
  --topbar-adbar-rewatch-radius:     0px;
  --topbar-adbar-rewatch-border-thickness: 0px;
  --topbar-adbar-rewatch-border-color: transparent;
  --topbar-adbar-rewatch-pt:         0px;
  --topbar-adbar-rewatch-pb:         0px;
  --topbar-adbar-rewatch-pl:         0px;
  --topbar-adbar-rewatch-pr:         0px;

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
  --topbar-nav-left-width:           295px;
  --topbar-nav-left-radius:          8px;
  --topbar-nav-left-border-thickness: 0px;
  --topbar-nav-left-border-color:    var(--OrbitLightBlue);
  --topbar-nav-left-pt:              0px;
  --topbar-nav-left-pb:              0px;
  --topbar-nav-left-pl:              0px;
  --topbar-nav-left-pr:              0px;

  --topbar-nav-right-bg:             var(--OrbitDarkBlue);
  --topbar-nav-right-height:         var(--topbar-nav-height);
  --topbar-nav-right-width:          495px;
  --topbar-nav-right-radius:         8px;
  --topbar-nav-right-border-thickness: 0px;
  --topbar-nav-right-border-color:   var(--OrbitDarkBlue);
  --topbar-nav-right-pt:             0px;
  --topbar-nav-right-pb:             0px;
  --topbar-nav-right-pl:             0px;
  --topbar-nav-right-pr:             0px;

  --sidebar-bg:                      var(--OrbitLightBlue);
  --sidebar-height:                  480px;
  --sidebar-width:                   200px;
  --sidebar-radius:                  8px;
  --sidebar-border-thickness:        0px;
  --sidebar-border-color:            var(--OrbitLightBlue);
  --sidebar-pt:                      0px;
  --sidebar-pb:                      0px;
  --sidebar-pl:                      0px;
  --sidebar-pr:                      0px;

  --sidebar-top-bg:                  var(--OrbitDarkBlue);
  --sidebar-top-height:              85px;
  --sidebar-top-width:               186px;
  --sidebar-top-radius:              8px;
  --sidebar-top-border-thickness:    0px;
  --sidebar-top-border-color:        transparent;
  --sidebar-top-pt:                  0px;
  --sidebar-top-pb:                  0px;
  --sidebar-top-pl:                  0px;
  --sidebar-top-pr:                  0px;
  --sidebar-top-mt:                  8px;
  --sidebar-top-mb:                  4px;
  --sidebar-top-ml:                  8px;
  --sidebar-top-mr:                  8px;

  --sidebar-middle-bg:               var(--OrbitDarkBlue);
  --sidebar-middle-height:           300px;
  --sidebar-middle-width:            186px;
  --sidebar-middle-radius:           8px;
  --sidebar-middle-border-thickness: 0px;
  --sidebar-middle-border-color:     transparent;
  --sidebar-middle-pt:               0px;
  --sidebar-middle-pb:               0px;
  --sidebar-middle-pl:               0px;
  --sidebar-middle-pr:               0px;
  --sidebar-middle-mt:               4px;
  --sidebar-middle-mb:               4px;
  --sidebar-middle-ml:               8px;
  --sidebar-middle-mr:               8px;

  --sidebar-bottom-bg:               var(--OrbitDarkBlue);
  --sidebar-bottom-height:           64px;
  --sidebar-bottom-width:            186px;
  --sidebar-bottom-radius:           8px;
  --sidebar-bottom-border-thickness: 0px;
  --sidebar-bottom-border-color:     transparent;
  --sidebar-bottom-pt:               0px;
  --sidebar-bottom-pb:               0px;
  --sidebar-bottom-pl:               0px;
  --sidebar-bottom-pr:               0px;
  --sidebar-bottom-mt:               4px;
  --sidebar-bottom-mb:               8px;
  --sidebar-bottom-ml:               8px;
  --sidebar-bottom-mr:               8px;

  --main-content-bg:                 transparent;
  --main-content-height:             480px;
  --main-content-width:              590px;
  --main-content-radius:             8px;
  --main-content-border-thickness:   7px;
  --main-content-border-color:       var(--OrbitLightBlue);
  --main-content-pt:                 0px;
  --main-content-pb:                 0px;
  --main-content-pl:                 0px;
  --main-content-pr:                 0px;

  --footer-bg:                       transparent;
  --footer-height:                   60px;
  --footer-width:                    800px;
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
      <div class="topbar-adbar" :style="[{ visibility: showAdbar ? 'visible' : 'hidden' }, isMobile ? { width: '100%' } : {}]">
        <div v-if="!isMobile" class="topbar-adbar-logo"><ReorbitLogo /></div>
        <div class="topbar-adbar-adlabel" :style="{ marginLeft: isMobile ? '0' : 'auto' }"><AdLabel /></div>
        <div class="topbar-adbar-ad" :style="isMobile ? { flex: '1', width: 'auto' } : {}"><AdSpot /></div>
        <div v-if="!isMobile" class="topbar-adbar-rewatch"><Rewatch /></div>
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
    <div class="sidebar" :style="[{ display: showSidebar ? '' : 'none' }, isMobile ? { width: '100%', height: 'auto' } : {}]">
      <button v-if="isMobile" class="sidebar-toggle" @click="mobileSidebarCollapsed = !mobileSidebarCollapsed">
        {{ mobileSidebarCollapsed ? '▼ Show Sidebar' : '▲ Hide Sidebar' }}
      </button>
      <template v-if="!mobileSidebarCollapsed">
        <div class="sidebar-top"    :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', aspectRatio: '186 / 85' } : {}"><slot name="sidebar-top" /></div>
        <div class="sidebar-middle" :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', aspectRatio: '186 / 300', marginTop: 'var(--sidebar-middle-mt)', marginBottom: 'var(--sidebar-middle-mb)' } : {}"><slot name="sidebar-middle" /></div>
        <div class="sidebar-bottom" :style="isMobile ? { width: 'auto', alignSelf: 'stretch', height: 'auto', aspectRatio: '186 / 64', marginTop: 'var(--sidebar-bottom-mt)' } : {}"><slot name="sidebar-bottom" /></div>
      </template>
    </div>
    <div class="main-content" :class="{ 'main-content-full': !showSidebar && !isMobile, 'main-content-expand': !showFooter }" :style="[{ border: mainContentBorder }, mainContentMobileStyle]"><slot name="main-content" /></div>
    <div class="footer" :style="[{ display: showFooter ? '' : 'none' }, isMobile ? { width: '100%', height: 'auto', aspectRatio: '800 / 60' } : {}]"><slot name="footer" /></div>
    <slot />
  </div>
</template>

<script setup>
const route = useRoute()
const showAdbar = computed(() => route.meta.showAdbar !== false)
const showNav = computed(() => route.meta.showNav !== false)
const showSidebar = computed(() => route.meta.showSidebar !== false)
const showFooter = computed(() => route.meta.showFooter !== false)
const mainContentBorder = computed(() => route.meta.mainContentBorder === false ? 'none' : undefined)
const mobileSidebarCollapsed = ref(false)

const gridColumns = computed(() =>
  isMobile.value ? '1fr' : 'var(--sidebar-width) var(--main-content-width)'
)

const gridRows = computed(() => {
  if (isMobile.value) return 'auto auto auto auto'
  return showFooter.value
    ? 'var(--topbar-height) var(--sidebar-height) var(--footer-height)'
    : 'var(--topbar-height) 1fr'
})

const SITE_WIDTH = 800
const SITE_HEIGHT = 670
const SITE_PADDING = 20
const MOBILE_BREAKPOINT = 415
const MAIN_CONTENT_WIDTH = 590
const MAIN_CONTENT_HEIGHT = 480
const scale = ref(1)
const isMobile = ref(false)

const computeLayout = () => {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
  if (isMobile.value) {
    scale.value = Math.min((window.innerWidth - SITE_PADDING) / MOBILE_BREAKPOINT, 1)
  } else {
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
  const baseWidth = showSidebar.value ? MAIN_CONTENT_WIDTH : SITE_WIDTH
  return {
    width: `${baseWidth}px`,
    height: `${MAIN_CONTENT_HEIGHT}px`,
    zoom: MOBILE_BREAKPOINT / baseWidth,
  }
})

const scaleStyle = computed(() => {
  if (isMobile.value) {
    return {
      width: `${MOBILE_BREAKPOINT}px`,
      height: 'auto',
      transform: `scale(${scale.value})`,
      transformOrigin: 'top center',
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

.topbar-adbar {
  height: var(--topbar-adbar-height);
  background: var(--topbar-adbar-bg);
  border-radius: var(--topbar-adbar-radius);
  border: var(--topbar-adbar-border-thickness) solid var(--topbar-adbar-border-color);
  align-items: center;
  overflow: hidden;
  padding: var(--topbar-adbar-pt) var(--topbar-adbar-pr) var(--topbar-adbar-pb) var(--topbar-adbar-pl);
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
}

.topbar-adbar-logo {
  width: var(--topbar-adbar-logo-width);
  height: var(--topbar-adbar-logo-height);
  background: var(--topbar-adbar-logo-bg);
  transform: scale(var(--topbar-adbar-logo-scale-x), var(--topbar-adbar-logo-scale-y));
  border-radius: var(--topbar-adbar-logo-radius);
  border: var(--topbar-adbar-logo-border-thickness) solid var(--topbar-adbar-logo-border-color);
  padding: var(--topbar-adbar-logo-pt) var(--topbar-adbar-logo-pr) var(--topbar-adbar-logo-pb) var(--topbar-adbar-logo-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-adbar-adlabel {
  margin-left: auto;
  width: var(--topbar-adbar-adlabel-width);
  height: var(--topbar-adbar-adlabel-height);
  background: var(--topbar-adbar-adlabel-bg);
  transform: scale(var(--topbar-adbar-adlabel-scale-x), var(--topbar-adbar-adlabel-scale-y));
  border-radius: var(--topbar-adbar-adlabel-radius);
  border: var(--topbar-adbar-adlabel-border-thickness) solid var(--topbar-adbar-adlabel-border-color);
  padding: var(--topbar-adbar-adlabel-pt) var(--topbar-adbar-adlabel-pr) var(--topbar-adbar-adlabel-pb) var(--topbar-adbar-adlabel-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-adbar-ad {
  width: var(--topbar-adbar-ad-width);
  height: var(--topbar-adbar-ad-height);
  background: var(--topbar-adbar-ad-bg);
  border-radius: var(--topbar-adbar-ad-radius);
  border: var(--topbar-adbar-ad-border-thickness) solid var(--topbar-adbar-ad-border-color);
  padding: var(--topbar-adbar-ad-pt) var(--topbar-adbar-ad-pr) var(--topbar-adbar-ad-pb) var(--topbar-adbar-ad-pl);
  flex-shrink: 0;
  overflow: hidden;
}

.topbar-adbar-rewatch {
  margin-left: auto;
  width: var(--topbar-adbar-rewatch-width);
  height: var(--topbar-adbar-rewatch-height);
  background: var(--topbar-adbar-rewatch-bg);
  border-radius: var(--topbar-adbar-rewatch-radius);
  border: var(--topbar-adbar-rewatch-border-thickness) solid var(--topbar-adbar-rewatch-border-color);
  padding: var(--topbar-adbar-rewatch-pt) var(--topbar-adbar-rewatch-pr) var(--topbar-adbar-rewatch-pb) var(--topbar-adbar-rewatch-pl);
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
  width: var(--topbar-nav-left-width);
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
  border-radius: 0;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: bold;
  font-family: inherit;
  text-align: center;
  flex-shrink: 0;
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
  margin-top: auto;
  margin-bottom: auto;
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
  height: var(--main-content-height);
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

.footer {
  grid-column: 1 / -1;
  height: var(--footer-height);
  background: var(--footer-bg);
  border-radius: var(--footer-radius);
  border: var(--footer-border-thickness) solid var(--footer-border-color);
  padding: var(--footer-pt) var(--footer-pr) var(--footer-pb) var(--footer-pl);
  overflow: hidden;
}
</style>
