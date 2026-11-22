// middleware/old-newsite-redirect.global.js
// Every signed-in page used to live under /newsite (the prefix dates from the site redesign,
// when the old pages still existed beside the new ones). The prefix is gone; this keeps old
// bookmarks, Discord messages and admin-entered links (homepage images, ads, encyclopedia
// entries) working by sending /newsite/<anything> to /<anything>.
import { stripNewsitePrefix } from '~/utils/oldNewsitePath'

export default defineNuxtRouteMiddleware((to) => {
  const path = stripNewsitePrefix(to.path)
  if (path === null) return
  return navigateTo({ path, query: to.query, hash: to.hash }, { redirectCode: 301, replace: true })
})
