// Source-level contracts for the shared pack UI (this repo has no component-test harness; its UI contracts are
// enforced as source checks — see siteScale.test.js, shortCardVarContract.test.js). These pin the behaviours the
// mobile / accessibility review required, so a later "tidy up" can't quietly regress them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
// Comments explain what NOT to do ("not 100vh"), so contracts are checked against the code with comments stripped.
const stripComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const overlay = stripComments(read('components/PackOpenOverlay.vue'))
const preview = read('components/PackPreviewModal.vue')
const packsTab = read('components/newsite/MyCollectionPacks.vue')
const collection = read('components/newsite/MyCollection.vue')
const cmart = read('components/newsite/Cmart.vue')

test('overlay is a real dialog: role, aria-modal, labelled, focus managed, Esc handled', () => {
  assert.match(overlay, /role="dialog"/)
  assert.match(overlay, /aria-modal="true"/)
  assert.match(overlay, /:aria-labelledby="titleId"/)
  assert.match(overlay, /e\.key === 'Escape'/)
  assert.match(overlay, /e\.key !== 'Tab'/) // focus trap
  assert.match(overlay, /previouslyFocused/) // focus handed back on close
  assert.match(overlay, /aria-live="polite"/)
  assert.match(overlay, /role="alert"/) // errors are announced
})

test('overlay sizes with dvh and never relies on 100vh alone; scroll is locked while open', () => {
  assert.match(overlay, /100dvh/)
  assert.doesNotMatch(overlay, /100vh/)
  assert.match(overlay, /pro-scroll-lock/)
  assert.match(overlay, /overscroll-behavior: contain/)
})

test('overlay respects prefers-reduced-motion and always offers Skip', () => {
  assert.match(overlay, /prefers-reduced-motion/)
  assert.match(overlay, /@click="skip"/)
  assert.doesNotMatch(overlay, /width: 300vw|height: 300vh/) // the old full-viewport white flash
})

test('overlay makes the request itself, to the POST endpoint, and shows an error instead of a blank reveal', () => {
  assert.match(overlay, /\$fetch\('\/api\/packs\/open', \{ method: 'POST'/)
  assert.doesNotMatch(overlay, /open-pack/)
  assert.match(overlay, /phase\.value = 'error'/)
  assert.match(overlay, /item\.isNew/) // "New!" is server-decided, not a client snapshot
  assert.doesNotMatch(overlay, /originalOwnedSet|ownedCtoonIds/)
})

test('overlay caps animated gToon card effects (iOS GPU-layer crash, see gtoonCardPerformance.test.js)', () => {
  assert.match(overlay, /FULL_EFFECT_CARDS = 4/)
  assert.match(overlay, /i < FULL_EFFECT_CARDS \? 'full' : 'static'/)
  assert.doesNotMatch(overlay, /will-change|preserve-3d/)
})

test('overlay surface is white, so every text colour on it is explicit (lightSurfaceContrast convention)', () => {
  assert.match(overlay, /\.pro-dialog \{[^}]*background: #fff;[^}]*color: #1a2a40/)
  assert.doesNotMatch(overlay, /text-white/)
})

test('nothing still calls the removed state-changing GET open endpoint', () => {
  for (const [name, src] of [['cmart', cmart], ['packsTab', packsTab], ['preview', preview]]) {
    assert.doesNotMatch(src, /cmart\/open-pack/, name)
  }
})

test('cMart opens through the shared overlay and no longer carries its own copy', () => {
  assert.match(cmart, /<PackOpenOverlay/)
  assert.doesNotMatch(cmart, /pack-reveal-grid|expandGlow|setTimeout\(async \(\) => \{\s*try \{\s*packContents/)
})

test('Packs tab: tablist semantics, 44px phone targets, jump-to-page, status chip on the art', () => {
  assert.match(collection, /role="tablist"/)
  assert.match(collection, /role="tab"/)
  assert.match(collection, /aria-selected/)
  assert.match(collection, /role="tabpanel"/)
  assert.match(collection, /ArrowRight|ArrowLeft/)
  assert.match(packsTab, /min-height: 44px/)
  assert.match(packsTab, /<select :value="page"/)
  assert.match(packsTab, /class="mcp-chip-status"/)
  assert.match(packsTab, /@media \(max-width: 768px\)/)
  assert.match(packsTab, /prefers-reduced-motion/)
})

test('Packs tab: a blocked pack says WHY on its button instead of going silently dead', () => {
  assert.match(packsTab, /blockReason\(it\) \|\| 'Open'/)
  assert.match(packsTab, /'In Auction'/)
  assert.match(packsTab, /'In Trade'/)
})

test('Packs tab removes the opened tile as soon as the server confirms, not on overlay close', () => {
  assert.match(packsTab, /function onOpened/)
  assert.match(packsTab, /items\.value = items\.value\.filter\(i => i\.id !== done\.id\)/)
})

test('pack preview reads the owner-scoped endpoint, not the cMart-only one', () => {
  assert.match(preview, /\/api\/packs\/\$\{props\.packId\}\/preview/)
  assert.doesNotMatch(preview, /cmart\/packs/)
  assert.match(preview, /role="dialog"/)
})

const redeem = read('pages/newsite/redeem.vue')

test('Redeem page: pack tiles show ×N, open through the shared overlay, and always point at My Collection > Packs', () => {
  assert.match(redeem, /<PackOpenOverlay/)
  assert.match(redeem, /×\{\{ t\.userPackIds\.length \}\}/)
  assert.match(redeem, /aria-label="`\$\{t\.userPackIds\.length\} pack/)
  assert.match(redeem, /MyCollection\?tab=packs/)
  assert.match(redeem, /\.rd-open-btn \{[^}]*min-height: 44px/)
  assert.match(redeem, /prefers-reduced-motion/)
})

test('Redeem page: submit is guarded against double-submits and results are announced', () => {
  assert.match(redeem, /if \(submitting\.value\) return/)
  assert.match(redeem, /:aria-busy="submitting/)
  assert.match(redeem, /class="rd-success-heading" role="status"/)
})

test('Redeem page: a pack already opened in another tab is dropped, not retried', () => {
  assert.match(redeem, /function onPackFailed/)
  assert.match(redeem, /status === 400 \|\| status === 404/)
})

const trade = read('components/newsite/Trade.vue')
const picker = read('components/trade/TradePackPicker.vue')

test('Trade builder: packs are picked on both sides, sent by TYPE+quantity, and gate Next/Send like cToons do', () => {
  assert.match(trade, /<TradePackPicker v-model="requestedPacks"/)
  assert.match(trade, /<TradePackPicker v-model="offeredPacks"/)
  assert.match(trade, /packsRequested: packPayload\(requestedPacks\.value\)/)
  assert.match(trade, /packsOffered: packPayload\(offeredPacks\.value\)/)
  assert.match(trade, /!selectedTargetCtoons\.length && !requestedPacks\.length && !isCounterMode/)
  assert.match(trade, /selectedInitiatorCtoons\.value\.length === 0 && !offeredPacks\.value\.length/)
  // a counter mirrors the packs, and every reset path clears them
  assert.match(trade, /requestedPacks\.value = packGroups\(offer, 'OFFERED'\)/)
  assert.match(trade, /offeredPacks\.value = packGroups\(offer, 'REQUESTED'\)/)
  assert.ok((trade.match(/requestedPacks\.value = \[\]; offeredPacks\.value = \[\]/g) || []).length >= 2)
})

test('Trade builder says packs are not valued, wherever a value estimate is shown', () => {
  assert.ok((trade.match(/Sealed packs are not valued/g) || []).length >= 2)
  assert.match(picker, /aren’t included in the value estimate/)
})

test('pack picker: never handles pack row ids, 44px steppers on phones, accessible stepper + live region', () => {
  assert.doesNotMatch(picker, /userPackId|userPackIds/)
  assert.match(picker, /\.tpp-step \{ width: 44px; height: 44px; \}/)
  assert.match(picker, /role="group" :aria-label="`Quantity of/)
  assert.match(picker, /<output class="tpp-qty" aria-live="polite">/)
  assert.match(picker, /aria-expanded/)
  assert.match(picker, /MAX_PACKS_PER_SIDE/)
})

const house = read('components/newsite/AuctionHouse.vue')
const amodal = read('components/newsite/AuctionModal.vue')
const adet = read('components/newsite/AuctionDetails.vue')
const socketServer = read('server/socket-server.js')
const settle = read('server/utils/auctionSettle.js')

test('Auction House: type switch lives in the top bar (the sidebar is collapsed on phones), packs get their own tag and preview', () => {
  assert.match(house, /class="ah-type" role="group"/)
  assert.match(house, /aria-pressed/)
  assert.match(house, /params\.set\('type', +'PACK'\)/)
  assert.match(house, /item\.kind === 'PACK'/)
  assert.match(house, /<PackPreviewModal/)
  assert.match(house, /\.ah-type-btn, \.ah-vt-btn \{ min-height: 32px/)
})

test('Auction modal: a pack goes to its own endpoint, with no rarity floor, insta-bid or cZone warning', () => {
  assert.match(amodal, /'\/api\/auctions\/pack'/)
  assert.match(amodal, /const isPack = computed\(\(\) => props\.ctoon\?\.kind === 'PACK'\)/)
  assert.match(amodal, /v-if="!isPack" class="am-instabid"/)
  assert.match(amodal, /v-if="inCzone && !isPack"/)
  assert.match(amodal, /role="dialog" aria-modal="true"/)
})

test('Auction detail page: pack variant (tag, preview, re-list through the pack form)', () => {
  assert.match(adet, /const isPack = computed\(\(\) => auction\.value\?\.kind === 'PACK'\)/)
  assert.match(adet, /<PackPreviewModal/)
  assert.match(adet, /kind: +'PACK'/)
})

test('the ending-soon notifier and settlement both branch on a pack auction (no unguarded cToon read)', () => {
  assert.match(socketServer, /soonAuctions\.map\(a => a\.userCtoon\?\.ctoonId\)\.filter\(Boolean\)/)
  assert.match(socketServer, /const isPack = auc\.kind === 'PACK'/)
  assert.doesNotMatch(socketServer, /soonAuctions\.map\(a => a\.userCtoon\.ctoonId\)/)
  assert.match(settle, /const isPack = auc\.kind === 'PACK'/)
  assert.match(settle, /isPack \? \{ userPackId \} : \{ userCtoonId \}/)
  assert.doesNotMatch(settle, /where: \{ userCtoonId, id: \{ not: id \} \}/, 'the NULL-userCtoonId trap')
})

test('My Collection > Packs offers Auction, in the pack form of the shared modal', () => {
  assert.match(packsTab, /class="mcp-btn mcp-auction"/)
  assert.match(packsTab, /kind: 'PACK', id: it\.id, packId: it\.packId/)
  assert.match(packsTab, /watch\(auctionCreatedSignal/)
})

const board = read('components/OgGtoonMatchBoard.vue')
const ogSocket = read('composables/useOgGtoonsSocket.js')
const ogAdmin = read('components/newsite/admin/legacy/OgPackRewardSettings.vue')
const onboarding = read('components/Onboarding.vue')

test('OG match-end card: pack banner is announced, tells the winner why there was no pack, and cannot push the buttons off a short screen', () => {
  assert.match(ogSocket, /socket\.on\('oggtoons:packReward'/)
  assert.match(ogSocket, /packReward\.value = null/) // cleared on next match / leave
  assert.match(board, /role="status" aria-live="polite"/)
  assert.match(board, /max-h-\[calc\(100dvh-1rem\)\] overflow-y-auto/)
  assert.match(board, /max-h-24 sm:max-h-56/) // log collapses on short screens
  for (const k of ['AWARDED', 'CAPPED', 'SAME_PAIR', 'IDLE_OPPONENT', 'FORFEIT']) assert.match(board, new RegExp(`case '${k}'`))
  assert.match(board, /MyCollection\?tab=packs/)
  assert.match(board, /min-h-\[44px\]/)
})

test('a PvP pack notification opens My Collection > Packs, not the auction fallback route', () => {
  const route = onboarding.slice(onboarding.indexOf('const notificationRoute'))
  assert.ok(route.indexOf("n.type === 'PVP_PACK_WON'") > -1)
  assert.ok(route.indexOf("n.type === 'PVP_PACK_WON'") < route.indexOf('/newsite/AuctionHouse/'))
  assert.match(route, /\/newsite\/MyCollection\?tab=packs/)
})

test('admin reward settings: pack + limit are all-or-nothing in the UI, inputs carry explicit text colours, and the Save button respects validation', () => {
  assert.match(ogAdmin, /Set both a pack and a per-player limit/)
  assert.match(ogAdmin, /text-gray-900 bg-white/)
  const games = read('components/newsite/admin/legacy/AdminLegacyGames.vue')
  assert.match(games, /<OgPackRewardSettings ref="ogPackRewardEl" v-model="ogWinPack"/)
  assert.match(games, /ogGtoonsWinPackId: +ogWinPack\.value\.packId/)
  assert.match(games, /!!ogPackRewardEl\?\.problem/)
})
