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
/*
 * Customisation API — all knobs are `--sc-*` and are read at point of use with
 * a fallback, rather than being declared on `.sc`.
 *
 * Two rules, both learned the hard way:
 *
 * 1. Declaring a default on `.sc` makes it win over anything an ancestor sets,
 *    because a declaration on the grid container never enters `.sc`'s cascade
 *    at all — inheritance is only consulted when `.sc`'s own cascade is empty.
 *    That silently turned two separate `--footer-height` overrides on the card
 *    grids into dead code. Point-of-use fallbacks let a container override work.
 *
 * 2. The `--sc-` prefix is not decoration. `layouts/newsite-template.vue` puts
 *    `--footer-height/-bg/-radius` on `:root` for the *page* footer. Reading
 *    those bare names here would inherit the page footer's 60px into every card.
 */

/* ── Card shell ──────────────────────────────────────────────── */
.sc {
  display: flex;
  flex-direction: column;
  width:  var(--sc-width,  var(--shortcard-width,  132px));
  height: var(--sc-height, var(--shortcard-height, 176px));
  background: var(--sc-bg, var(--OrbitDarkBlue, #336699));
  border: var(--sc-border-width, 2px) solid var(--sc-border-color, #1a4a7a);
  border-radius: var(--sc-radius, 8px);
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}

/* ── Header ──────────────────────────────────────────────────── */
.sc-header {
  height: var(--sc-header-height, auto);
  flex: 1 1 0%;
  min-height: 0;
  /* Containing block for slot content, so it can size with `inset: 0` instead
     of `height: 100%` — a percentage height against a flex-sized `auto` parent
     is the classic WebKit trap. */
  position: relative;
  background: var(--sc-header-bg, url('/images/newsite/infocardSplash.png') top / 100% auto no-repeat);
  border-radius: var(--sc-header-radius, 0px);
  overflow: hidden;
}

/* ── Middle ──────────────────────────────────────────────────── */
.sc-middle {
  height: var(--sc-middle-height, 18px);
  min-height: var(--sc-middle-height, 18px);
  max-height: var(--sc-middle-height, 18px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sc-middle-bg, transparent);
  border-radius: var(--sc-middle-radius, 0px);
  padding: var(--sc-middle-padding, 0px 4px);
  overflow: hidden;
  width: 100%;
}

/* ── Footer ──────────────────────────────────────────────────── */
/* A floor, never a ceiling. The previous `height`/`max-height` pin plus
   `overflow: hidden` is what clipped the action buttons out of existence once a
   consumer stacked the two halves into a column. The card's own height is
   fixed, and `.sc-header { flex: 1 }` absorbs whatever the footer takes, so
   letting the footer size to its content costs nothing and cannot clip. */
.sc-footer {
  flex: 0 0 auto;
  min-height: var(--sc-footer-min-height, 26px);
  display: flex;
  flex-direction: row;
  /* stretch, not center: in the stacked (column) case the cross axis is
     horizontal, and `center` would shrink-wrap each half to its content width. */
  align-items: stretch;
  gap: var(--sc-footer-gap, 0px);
  background: var(--sc-footer-bg, transparent);
  border-radius: var(--sc-footer-radius, 0px);
  padding: var(--sc-footer-padding, 1px);
  overflow: hidden;
}

/* No `height: 100%` on either half. `align-items: stretch` above gives them the
   full cross size in both directions without a percentage that has to resolve
   against a containing block which may be indefinite. */
.sc-footer-left {
  width: var(--sc-footer-left-width, 65%);
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  background: var(--sc-footer-left-bg, transparent);
  border-radius: var(--sc-footer-left-radius, 0px);
  overflow: hidden;
}

.sc-footer-right {
  width: var(--sc-footer-right-width, 35%);
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: var(--sc-footer-right-bg, transparent);
  border-radius: var(--sc-footer-right-radius, 0px);
  overflow: hidden;
}
</style>
