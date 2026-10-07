// composables/useSiteLogo.js
// Resolves the site-wide topbar logo path (admin-managed via Manage Homepage). Shares the exact
// same useFetch key as composables/useSiteTheme.js so the two composables (both commonly used
// together off the same /api/global-config payload within one page render) reuse one request
// instead of issuing it twice.
const DEFAULT_LOGO_PATH = '/images/newlogo.gif'

export function useSiteLogo() {
  const { data } = useFetch('/api/global-config', { key: 'global-config-for-site-theme' })

  const logoPath = computed(() => data.value?.logoPath || DEFAULT_LOGO_PATH)

  return { logoPath }
}
