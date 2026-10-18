import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

const {
  SUB_ADMIN_DENIED_API, SUB_ADMIN_DENIED_SECTIONS, SUB_ADMIN_DENIED_PAGE_PREFIXES,
  isApiDeniedForSubAdmin, isSectionDeniedForSubAdmin, isPageDeniedForSubAdmin
} = await import(join(root, 'utils/adminAccess.js'))
const {
  ADMIN_SECTIONS, adminNavTree, oldAdminGroupsFor, OLD_ADMIN_GROUPS, OLD_ADMIN_PATHS
} = await import(join(root, 'utils/adminSections.js'))

const denied = (method, path) => isApiDeniedForSubAdmin(method, path)

test('tier-1 tools are refused to a sub-admin', () => {
  const cases = [
    ['GET', '/api/admin/users/stats'],
    ['POST', '/api/admin/users/transfer'],
    ['POST', '/api/admin/users/abc123/ban'],
    ['POST', '/api/admin/users/abc123/dissolve'],
    ['POST', '/api/admin/users/abc123/make-admin'],
    ['POST', '/api/admin/users/abc123/make-sub-admin'],
    ['POST', '/api/admin/users/abc123/remove-sub-admin'],
    ['POST', '/api/admin/locked-points/abc/release'],
    ['POST', '/api/admin/trade-offers'],
    ['POST', '/api/admin/dev/power'],
    ['GET', '/api/admin/dev/status'],
    ['POST', '/api/admin/cheating-tool-apply'],
    ['POST', '/api/admin/cheating-tool-apply-stream'],
    ['POST', '/api/admin/remove-cheating'],
    ['GET', '/api/admin/codes'],
    ['POST', '/api/admin/codes'],
    ['PUT', '/api/admin/codes'],
    ['GET', '/api/admin/codes/claimed'],
    ['POST', '/api/admin/global-config'],
    ['POST', '/api/admin/global-config/second-edition-overlay'],
    ['POST', '/api/admin/rarity-defaults'],
    ['POST', '/api/discord/register-commands'],
    ['POST', '/api/admin/ctoons/abc/give-to-official'],
    ['DELETE', '/api/admin/user-ctoons/abc']
  ]
  for (const [m, p] of cases) assert.ok(denied(m, p), `${m} ${p} should be denied`)
})

test('the Dissolve Queue is refused in full, reads included', () => {
  for (const [m, p] of [
    ['GET', '/api/admin/dissolve-queue'], ['GET', '/api/admin/dissolve-queue/errors'],
    ['DELETE', '/api/admin/dissolve-queue/errors'], ['PATCH', '/api/admin/dissolve-queue/abc'],
    ['POST', '/api/admin/dissolve-queue/schedule'],
    ['GET', '/api/admin/dissolve-misfires'], ['POST', '/api/admin/dissolve-misfires/scan'],
    ['POST', '/api/admin/dissolve-misfires/resolve'], ['PATCH', '/api/admin/dissolve-misfires/abc'],
    ['POST', '/api/admin/dissolve-misfires/abc/preview'],
    ['GET', '/api/admin/dissolve-featured-config'], ['POST', '/api/admin/dissolve-featured-config']
  ]) assert.ok(denied(m, p), `${m} ${p} should be denied`)
})

test('Auction Only is refused, in full', () => {
  for (const [m, p] of [
    ['GET', '/api/admin/auction-only'], ['POST', '/api/admin/auction-only'],
    ['GET', '/api/admin/auction-only/history'], ['DELETE', '/api/admin/auction-only/bulk'],
    ['POST', '/api/admin/auction-only/abc/start'], ['GET', '/api/admin/auction-only/owned']
  ]) assert.ok(denied(m, p), `${m} ${p} should be denied`)
})

test('evidence-deletion endpoints are refused, reads stay open', () => {
  assert.ok(denied('POST', '/api/admin/cron-run-logs/delete'))
  assert.ok(denied('POST', '/api/admin/queues/cron/clean'))
  assert.ok(!denied('GET', '/api/admin/queues/cron/jobs'))
})

test('everything allowed pages depend on stays open', () => {
  const open = [
    ['GET', '/api/admin/users'],                       // Auth Logs / Admin Changes user list
    ['GET', '/api/admin/users/search'],                // cMoon award picker
    ['POST', '/api/admin/users/abc/update-cmoon'],     // cMoons member assignment
    ['POST', '/api/admin/check-cheating'],             // read-only report used by Auth Logs
    ['POST', '/api/admin/cheating-tool-report'],
    ['GET', '/api/admin/global-config'],               // Manage Games / Packs / Certificate read it
    ['GET', '/api/admin/rarity-defaults'],
    ['GET', '/api/admin/codes-redeemed'],              // Analytics (must not be swallowed by /codes)
    ['GET', '/api/admin/auction-winners'],             // Auction Logs
    ['POST', '/api/admin/ctoon'], ['PUT', '/api/admin/ctoon/abc'],
    ['POST', '/api/admin/ctoons/bulk-edit'],
    ['POST', '/api/admin/lotto-settings'], ['POST', '/api/admin/achievements'],
    ['POST', '/api/admin/sales'], ['POST', '/api/admin/czone-contest/abc/distribute'],
    ['POST', '/api/admin/packs'], ['POST', '/api/admin/starter-sets'],
    ['POST', '/api/admin/global-config/logo'], ['POST', '/api/admin/global-config/certificate-logo'],
    ['GET', '/api/auth/me'], ['GET', '/api/ctoons']
  ]
  for (const [m, p] of open) assert.ok(!denied(m, p), `${m} ${p} should stay open`)
})

test('prefix rules are boundary-aware', () => {
  assert.ok(!denied('GET', '/api/admin/users-extra'))
  assert.ok(!denied('GET', '/api/admin/devices'))
  assert.ok(!denied('GET', '/api/admin/auction-only-logs'))
})

test('sloppy or encoded paths cannot dodge the list', () => {
  assert.ok(denied('POST', '//api//admin//codes/'))
  assert.ok(denied('POST', '/api/admin/./codes'))
  assert.ok(denied('POST', '/api/admin/x/../codes'))
  assert.ok(denied('POST', '/api/admin/%63odes'))
  assert.ok(denied('POST', '/api/admin/codes?x=1'))
  assert.ok(denied('POST', '/api/admin/users/transfer%'), 'undecodable path is refused')
})

test('every deny rule points at a route that exists (no stale entries)', () => {
  const exists = p => {
    const rel = join('server', p) // '/api/admin/codes' -> server/api/admin/codes(.*.js | /)
    const abs = join(root, rel)
    if (existsSync(abs) && statSync(abs).isDirectory()) return true
    const dir = dirname(abs)
    return existsSync(dir) && readdirSync(dir).some(f => f.startsWith(basename(abs) + '.'))
  }
  for (const r of SUB_ADMIN_DENIED_API) {
    const p = r.path || r.prefix
    if (p) assert.ok(exists(p), `deny rule targets a route that does not exist: ${p}`)
    else assert.ok(r.re instanceof RegExp)
  }
})

test('denied console sections exist and are gone from a sub-admin nav only', () => {
  const keys = new Set(ADMIN_SECTIONS.map(s => s.key))
  for (const k of SUB_ADMIN_DENIED_SECTIONS) assert.ok(keys.has(k), `unknown section key: ${k}`)

  const full = adminNavTree().flatMap(g => g.items.map(i => i.key))
  const sub = adminNavTree({ subAdmin: true }).flatMap(g => g.items.map(i => i.key))
  for (const k of ['manageUsers', 'initiateTrade', 'production', 'cheatingTool', 'checkCheating',
    'codes', 'auctions', 'dissolveQueue', 'globalSettings']) {
    assert.ok(full.includes(k), `${k} should still be in the full admin nav`)
    assert.ok(!sub.includes(k), `${k} should be hidden from sub-admins`)
  }
  // Allowed neighbours survive — Auction Logs is not Auction Only.
  for (const k of ['auctionLogs', 'ctoons', 'lotto', 'achievements', 'cheatFinder', 'authLogs', 'manageSales']) {
    assert.ok(sub.includes(k), `${k} should stay available to sub-admins`)
  }
  assert.ok(isSectionDeniedForSubAdmin('production'))
  assert.ok(!isSectionDeniedForSubAdmin('auctionLogs'))
})

test('denied old /admin pages exist, and are filtered from the old menu', () => {
  for (const p of SUB_ADMIN_DENIED_PAGE_PREFIXES) {
    const file = p.replace(/^\/admin\//, 'pages/admin/') + '.vue'
    assert.ok(existsSync(join(root, file)), `denied page prefix has no page: ${p}`)
  }
  const subPaths = oldAdminGroupsFor({ subAdmin: true }).flatMap(g => g.items.map(i => i.to))
  assert.equal(oldAdminGroupsFor({ subAdmin: false }), OLD_ADMIN_GROUPS)
  for (const p of ['/admin/users', '/admin/initiate-trade', '/admin/manage-dev', '/admin/cheating-tool',
    '/admin/check-cheating', '/admin/codes', '/admin/manage-auctions', '/admin/dissolve-queue',
    '/admin/global-settings']) {
    assert.ok(OLD_ADMIN_PATHS.includes(p) && !subPaths.includes(p), `${p} should be filtered`)
  }
  // '/admin/auctions' is the Auction LOGS page — it must not be caught by '/admin/manage-auctions'.
  assert.ok(subPaths.includes('/admin/auctions'))
  assert.ok(isPageDeniedForSubAdmin('/admin/users'))
  assert.ok(isPageDeniedForSubAdmin('/admin/edit-code'))
  assert.ok(!isPageDeniedForSubAdmin('/admin/auctions'))
})

test('the guard middleware and the client middleware are wired to the policy', () => {
  const mw = read('server/middleware/sub-admin-guard.js')
  assert.match(mw, /isApiDeniedForSubAdmin/)
  assert.match(mw, /isSubAdmin/)
  const cmw = read('middleware/admin.js')
  assert.match(cmw, /isPageDeniedForSubAdmin/)
  assert.match(cmw, /isSectionDeniedForSubAdmin/)
})

test('promotion endpoints: full admins only, flag handled on every role change', () => {
  const make = read('server/api/admin/users/[id]/make-sub-admin.post.js')
  assert.match(make, /requireAdmin/)
  assert.match(make, /caller\?\.isSubAdmin/)
  assert.match(make, /isAdmin: true, isSubAdmin: true/)
  assert.match(make, /logAdminChange/)
  const rm = read('server/api/admin/users/[id]/remove-sub-admin.post.js')
  assert.match(rm, /!target\.isSubAdmin/)
  assert.match(rm, /isAdmin: false, isSubAdmin: false/)
  // Full-admin promotion / demotion must clear the sub-admin flag.
  assert.match(read('server/api/admin/users/[id]/make-admin.post.js'), /isSubAdmin: false/)
  assert.match(read('server/api/admin/users/[id]/remove-admin.post.js'), /isSubAdmin: false/)
  // The session payload carries the flag for the client.
  assert.match(read('server/api/auth/me.get.js'), /isSubAdmin: user\.isSubAdmin/)
})
