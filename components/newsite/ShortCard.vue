<template>
  <div class="sc">
    <div class="sc-header">
      <slot name="header" />
    </div>
    <div class="sc-middle">
      <slot name="middle" />
    </div>
    <div class="sc-footer">
      <div class="sc-footer-left">
        <slot name="footer-left" />
      </div>
      <div class="sc-footer-right">
        <slot name="footer-right" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  ctoon: {
    type: Object,
    default: null,
  },
})
</script>

<style scoped>
/* ── Variables ───────────────────────────────────────────────── */
.sc {
  --card-radius:          8px;
  --card-bg:              var(--OrbitDarkBlue, #336699);
  --card-border-width:    2px;
  --card-border-color:    #1a4a7a;

  --header-height:        auto;
  --header-bg:            url('/api/uploads/infocards/infocardSplash.png') top / 100% auto no-repeat;
  --header-radius:        0px;

  --middle-height:        18px;
  --middle-bg:            transparent;
  --middle-radius:        0px;
  --middle-padding:       0px 4px;

  --footer-height:        26px;
  --footer-bg:            transparent;
  --footer-radius:        0px;
  --footer-padding:       1px;

  --footer-left-width:    65%;
  --footer-left-bg:       transparent;
  --footer-left-radius:   0px;

  --footer-right-width:   35%;
  --footer-right-bg:      transparent;
  --footer-right-radius:  0px;
}

/* ── Card shell ──────────────────────────────────────────────── */
.sc {
  display: flex;
  flex-direction: column;
  width: var(--shortcard-width);
  height: var(--shortcard-height);
  background: var(--card-bg);
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--card-radius);
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}

/* ── Header ──────────────────────────────────────────────────── */
.sc-header {
  height: var(--header-height);
  flex: 1;
  min-height: 0;
  background: var(--header-bg);
  border-radius: var(--header-radius);
  overflow: hidden;
}

/* ── Middle ──────────────────────────────────────────────────── */
.sc-middle {
  height: var(--middle-height);
  min-height: var(--middle-height);
  max-height: var(--middle-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--middle-bg);
  border-radius: var(--middle-radius);
  padding: var(--middle-padding);
  overflow: hidden;
  width: 100%;
}

/* ── Footer ──────────────────────────────────────────────────── */
.sc-footer {
  height: var(--footer-height);
  min-height: var(--footer-height);
  max-height: var(--footer-height);
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  background: var(--footer-bg);
  border-radius: var(--footer-radius);
  padding: var(--footer-padding);
  overflow: hidden;
}

.sc-footer-left {
  width: var(--footer-left-width);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 100%;
  background: var(--footer-left-bg);
  border-radius: var(--footer-left-radius);
  overflow: hidden;
}

.sc-footer-right {
  width: var(--footer-right-width);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  background: var(--footer-right-bg);
  border-radius: var(--footer-right-radius);
  overflow: hidden;
}
</style>
