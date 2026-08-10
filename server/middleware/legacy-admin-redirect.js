import { defineEventHandler, sendRedirect } from 'h3'
import { legacyAdminTarget } from '~/utils/adminSections'

// The old admin lived at /admin/*. Those pages are gone — every tool now renders
// inside the consolidated console at /newsite/admin/*. Redirect server-side so
// bookmarks, Discord links and browser history keep working without shipping a
// client-side redirect page (which would be an unauthenticated route whose only
// job is to bounce).
//
// 302, not 301: a permanent redirect is cached by browsers indefinitely and
// would be painful to undo if a tool has to be rolled back.
export default defineEventHandler(async (event) => {
  const target = legacyAdminTarget(event.path)
  if (!target) return
  return sendRedirect(event, target, 302)
})
