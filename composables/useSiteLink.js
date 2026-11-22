// Turns an admin-configured image link (Homepage admin: home images, middle sidebar images,
// bottom spotlight) into props for <component :is>, so links to this site navigate in-app and
// never reload the page. A full reload remounts the whole newsite template (nav, ad bar,
// sidebar), which resets anything running in it.
//
//   const siteLink = useSiteLink()
//   <component :is="siteLink(url).is" v-bind="siteLink(url).props">
//
// - A link to a page on this site (relative, or absolute with this site's host, with or without
//   "www.") → NuxtLink with `to` set to its path + query + hash.
// - Any other link (another site, or a non-page path such as /api/… or an image) → a plain
//   <a> opening in a new tab, as before.
// - No link → a plain <div>.
export function useSiteLink () {
  const router = useRouter()
  const NuxtLink = resolveComponent('NuxtLink')
  // Works during SSR as well as in the browser, unlike window.location.
  const here = useRequestURL()
  const bareHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '')

  return function siteLink (link) {
    const raw = typeof link === 'string' ? link.trim() : ''
    if (!raw) return { is: 'div', props: {} }

    let url = null
    try { url = new URL(raw, here.href) } catch {}

    const sameSite = url &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      bareHost(url.hostname) === bareHost(here.hostname)

    if (sameSite && !url.pathname.startsWith('/api/')) {
      const to = `${url.pathname}${url.search}${url.hash}`
      if (router.resolve(to).matched.length) {
        return { is: NuxtLink, props: { to } }
      }
    }

    return { is: 'a', props: { href: raw, target: '_blank', rel: 'noopener noreferrer' } }
  }
}
