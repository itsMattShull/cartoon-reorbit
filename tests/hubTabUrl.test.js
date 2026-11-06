// The hub's tab <-> address-bar sync, run against a real vue-router (in-memory history) and real Vue watchers.
// The risks are all behavioural: a tab that doesn't update the URL, a URL that doesn't update the tab, or the two
// bouncing each other forever.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ref, nextTick, effectScope } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { syncTabWithUrl } from '../utils/hubTabUrl.js'

const IDS = ['decks', 'matchmaking', 'leaderboard', 'meta', 'tournaments']

async function settle () {
  for (let i = 0; i < 6; i++) { await nextTick(); await new Promise(r => setTimeout(r, 0)) }
}

async function harness ({ url = '/', tab = '', isReady = true, ids = IDS } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] })
  await router.push(url)
  await router.isReady()
  const route = { get query () { return router.currentRoute.value.query } } // what Nuxt's useRoute() gives a page
  const activeTab = ref(tab)
  const ready = ref(isReady)
  let navigations = 0
  router.afterEach(() => { navigations += 1 })
  const scope = effectScope()
  scope.run(() => syncTabWithUrl({ route, router, activeTab, ready, tabIds: () => ids, scopedQuery: { t: 'tournaments' } }))
  await settle()
  return { router, activeTab, ready, navigations: () => navigations, stop: () => scope.stop() }
}

test('choosing a tab puts it in the address, keeping other parameters', async () => {
  const h = await harness({ url: '/?utm=discord', tab: 'matchmaking' })
  assert.equal(h.router.currentRoute.value.query.tab, 'matchmaking', 'the starting tab is reflected too, so the address is always linkable')
  h.activeTab.value = 'meta'
  await settle()
  assert.deepEqual({ ...h.router.currentRoute.value.query }, { utm: 'discord', tab: 'meta' })
  h.stop()
})

test('a changed address switches the tab (a pasted link, an in-app link)', async () => {
  const h = await harness({ url: '/?tab=decks', tab: 'decks' })
  await h.router.push('/?tab=leaderboard')
  await settle()
  assert.equal(h.activeTab.value, 'leaderboard')
  h.stop()
})

test('Back and Forward move between tabs', async () => {
  const h = await harness({ url: '/?tab=decks', tab: 'decks' })
  await h.router.push('/?tab=meta'); await settle()
  await h.router.push('/?tab=tournaments'); await settle()
  assert.equal(h.activeTab.value, 'tournaments')
  h.router.back(); await settle()
  assert.equal(h.activeTab.value, 'meta')
  h.router.back(); await settle()
  assert.equal(h.activeTab.value, 'decks')
  h.router.forward(); await settle()
  assert.equal(h.activeTab.value, 'meta')
  h.stop()
})

test('the two sides never bounce each other: one tab switch is exactly one navigation', async () => {
  const h = await harness({ url: '/?tab=decks', tab: 'decks' })
  const before = h.navigations()
  h.activeTab.value = 'meta'
  await settle()
  assert.equal(h.navigations() - before, 1)
  // ...and a URL-driven change causes no further navigation (the tab just follows it).
  const mid = h.navigations()
  await h.router.push('/?tab=decks'); await settle()
  assert.equal(h.navigations() - mid, 1)
  assert.equal(h.activeTab.value, 'decks')
  h.stop()
})

test('nothing is written to the address until the first tab has been decided', async () => {
  const h = await harness({ url: '/', tab: '', isReady: false })
  assert.equal(h.router.currentRoute.value.query.tab, undefined)
  h.activeTab.value = 'matchmaking'; await settle()
  assert.equal(h.router.currentRoute.value.query.tab, undefined, 'still loading: a placeholder tab must not be linkable')
  h.ready.value = true; await settle()
  assert.equal(h.router.currentRoute.value.query.tab, 'matchmaking')
  h.stop()
})

test('a tab the viewer cannot open (switched off by an admin, or made up) in the address is ignored', async () => {
  const h = await harness({ url: '/?tab=decks', tab: 'decks', ids: ['decks', 'matchmaking'] })
  await h.router.push('/?tab=tournaments'); await settle()
  assert.equal(h.activeTab.value, 'decks')
  await h.router.push('/?tab=nope'); await settle()
  assert.equal(h.activeTab.value, 'decks')
  h.stop()
})

test('the legacy tournament parameter is kept on the Tournaments tab and dropped from every other tab', async () => {
  const h = await harness({ url: '/?tab=tournaments&t=abc123', tab: 'tournaments' })
  assert.equal(h.router.currentRoute.value.query.t, 'abc123', 'still there for the tab to forward it')
  h.activeTab.value = 'meta'; await settle()
  assert.deepEqual({ ...h.router.currentRoute.value.query }, { tab: 'meta' })
  h.stop()
})
