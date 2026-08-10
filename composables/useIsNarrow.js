import { ref, onScopeDispose } from 'vue'

// Single source of truth for "is this a narrow/phone viewport", backed by the
// same media query the CSS uses so JS and CSS can never disagree.
//
// The layout's own `isMobile` (layouts/newsite-template.vue) multiplies
// innerWidth by a devicePixelRatio-derived zoom factor, so at high browser zoom
// it reports "desktop" while every `@media (max-width: 768px)` rule and every
// Tailwind `sm:`/`md:` variant reports "mobile". Admin components that switch
// between a table and a card list must not straddle that gap — a component
// rendering its desktop table while the container is in mobile mode is how you
// get 1000px of table inside a 390px box.
//
// Tailwind's `md` breakpoint is min-width:768px, so "narrow" is < 768px, i.e.
// max-width: 767.98px. This deliberately matches `md:` and NOT the layout's
// `<= 768` check.
export const NARROW_QUERY = '(max-width: 767.98px)'

export function useIsNarrow () {
  // Default false so SSR renders the table markup; the client corrects on mount.
  const isNarrow = ref(false)

  if (import.meta.client) {
    const mql = window.matchMedia(NARROW_QUERY)
    const apply = (e) => { isNarrow.value = e.matches }
    apply(mql)
    mql.addEventListener('change', apply)
    onScopeDispose(() => mql.removeEventListener('change', apply))
  }

  return isNarrow
}
