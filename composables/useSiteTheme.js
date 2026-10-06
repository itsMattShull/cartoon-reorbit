// composables/useSiteTheme.js
// Resolves the site's effective color theme (admin-managed via Manage Site Theme) into an
// SSR-safe :root override. Unlike composables/useUiClickSound.js (deliberately client-only,
// since nothing needs sound before a click happens anyway), colors ARE the first thing a
// visitor sees — a client-only override would flash the hardcoded default chrome before
// snapping to a custom theme, defeating the point of a themed event. Uses useFetch (not $fetch)
// so Nuxt's own SSR payload carries the server-resolved value to the client with no second
// request and no flash.
//
// The fallback object here is a last resort only (a failed/not-yet-loaded fetch) — the server
// endpoint (server/utils/siteTheme.js#resolveEffectiveSiteTheme) always resolves a complete
// theme, so this is rarely if ever actually used. Mirrors that file's own DEFAULT_SITE_THEME
// (and layouts/newsite-template.vue's hardcoded :root values) deliberately duplicated rather
// than imported — composables are client-bundled and must never import from server/.
const FALLBACK_THEME = {
  orbitDarkBlue: '#336699',
  orbitLightBlue: '#3399CC',
  orbitGreen: '#66CC00',
  bgColor: '#003466',
  textColor: '#ffffff',
}

export function useSiteTheme() {
  const { data } = useFetch('/api/global-config', { key: 'global-config-for-site-theme' })

  const theme = computed(() => {
    const t = data.value?.siteTheme
    return (t && typeof t === 'object') ? { ...FALLBACK_THEME, ...t } : FALLBACK_THEME
  })

  // `html:root` rather than plain `:root` — same vars, but the extra type selector raises
  // specificity to (0,1,1) vs. the layout's own plain `:root{...}` block (0,1,0). That block
  // reaches the page twice: once inlined for SSR, and again via a `<link rel="stylesheet">`
  // for newsite-template.vue's compiled CSS that Nuxt/Vite injects into <head> AFTER this tag
  // once the client hydrates — so relying on source order alone lets that late link silently
  // win back to the defaults. Higher specificity wins regardless of which loads last.
  const styleText = computed(() =>
    `html:root{--OrbitDarkBlue:${theme.value.orbitDarkBlue};--OrbitLightBlue:${theme.value.orbitLightBlue};` +
    `--OrbitGreen:${theme.value.orbitGreen};--bg-color:${theme.value.bgColor};--text-color:${theme.value.textColor};}`
  )

  return { theme, styleText }
}
