import { useAuth } from '~/composables/useAuth'
import { navigateTo } from '#app'
import { isPageDeniedForSubAdmin, isSectionDeniedForSubAdmin } from '~/utils/adminAccess'
import { resolveAdminRoute } from '~/utils/adminSections'

// Console URL prefix; everything after it is the section path (utils/adminSections.js).
const CONSOLE_PREFIX = '/newsite/admin'

export default defineNuxtRouteMiddleware(async (to) => {
  const { isAdmin, isSubAdmin, fetchSelf } = useAuth()

  // If admin state is unknown on first load, fetch session once
  if (!isAdmin.value) {
    try { await fetchSelf() } catch {}
  }

  if (!isAdmin.value) {
    return navigateTo('/')
  }

  // Sub-admins: the tools are also refused server-side (server/middleware/sub-admin-guard.js);
  // this just keeps them off a page that would render and then 403 on every request.
  if (isSubAdmin.value) {
    let denied = isPageDeniedForSubAdmin(to.path)
    if (!denied && (to.path === CONSOLE_PREFIX || to.path.startsWith(CONSOLE_PREFIX + '/'))) {
      const segments = to.path.slice(CONSOLE_PREFIX.length).split('/').filter(Boolean)
      const resolved = resolveAdminRoute(segments)
      denied = !!resolved && isSectionDeniedForSubAdmin(resolved.section.key)
    }
    if (denied) return navigateTo(CONSOLE_PREFIX)
  }
})
