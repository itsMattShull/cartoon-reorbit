// utils/hubTabUrl.js
//
// Keeps a tabbed page's active tab and its address bar in step, in both directions:
//   * switching tab writes ?tab=<id> to the URL (router.replace, so flicking through tabs doesn't bury the Back button);
//   * the URL changing (Back/Forward, a pasted link, an in-app link to another tab) switches the tab.
// Neither side can bounce the other: each only acts when the two disagree, and the second one then finds them equal.
//
// Takes the route/router/refs as arguments (rather than reaching for Nuxt auto-imports) so it can be tested with a real
// vue-router in plain Node — see tests/hubTabUrl.test.js.
import { watch } from 'vue'

/**
 * @param {object} p
 * @param {import('vue-router').RouteLocationNormalizedLoaded} p.route
 * @param {import('vue-router').Router} p.router
 * @param {import('vue').Ref<string>} p.activeTab        the selected tab id ('' until one has been chosen)
 * @param {import('vue').Ref<boolean>} p.ready           false until the first tab has been decided (don't write a placeholder)
 * @param {() => string[]} p.tabIds                      ids the viewer may actually open right now
 * @param {Record<string,string>} [p.scopedQuery]        query keys that only mean something on one tab, as `{ key: tabId }`;
 *                                                       they are dropped from the address when another tab is selected
 */
export function syncTabWithUrl ({ route, router, activeTab, ready, tabIds, scopedQuery = {} }) {
  const stopWrite = watch([activeTab, ready], ([tab, isReady]) => {
    if (!isReady || !tab || route.query.tab === tab) return
    const query = { ...route.query, tab }
    // e.g. { t: 'tournaments' }: the tournament id means nothing on any other tab, so don't carry it along.
    for (const [key, owner] of Object.entries(scopedQuery)) if (tab !== owner) delete query[key]
    router.replace({ query })
  }, { immediate: true }) // a page that is already ready when this starts still gets its starting tab into the address
  const stopRead = watch(() => route.query.tab, (tab) => {
    if (typeof tab === 'string' && tab !== activeTab.value && tabIds().includes(tab)) activeTab.value = tab
  })
  return () => { stopWrite(); stopRead() }
}
