import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

// utils/adminSections.js is plain ESM with no Nuxt auto-imports, so it can be
// imported directly. This is the same source-contract style as
// blackjackClientRoutes / edRpsWiring: no server, no browser.
const {
  ADMIN_SECTIONS, ADMIN_GROUPS, adminNavTree, resolveAdminRoute,
  getAdminSection
} = await import(join(root, 'utils/adminSections.js'))
const { OLD_ADMIN_REDIRECTS, OLD_ADMIN_ROUTE_RULES } = await import(join(root, 'utils/oldAdminRedirects.js'))

// The registry is the source of truth for the nav AND the router, so these
// invariants are what keep a tool from silently disappearing.

test('every section resolves to a component file that exists on disk', () => {
  for (const s of ADMIN_SECTIONS) {
    assert.equal(typeof s.load.path, 'string', `section ${s.key} loader has no path`)
    assert.ok(
      existsSync(join(root, s.load.path)),
      `section ${s.key} points at a missing component: ${s.load.path}`
    )
  }
})

test('section keys are unique', () => {
  const seen = new Set()
  for (const s of ADMIN_SECTIONS) {
    assert.ok(!seen.has(s.key), `duplicate section key: ${s.key}`)
    seen.add(s.key)
  }
})

test('every section belongs to a declared group', () => {
  const groups = new Set(ADMIN_GROUPS.map(g => g.id))
  for (const s of ADMIN_SECTIONS) {
    assert.ok(groups.has(s.group), `section ${s.key} has unknown group ${s.group}`)
  }
})

test('every section has a label and a loader — no placeholder entries', () => {
  for (const s of ADMIN_SECTIONS) {
    assert.equal(typeof s.label, 'string')
    assert.ok(s.label.trim().length > 0, `section ${s.key} has an empty label`)
    assert.notEqual(s.label, 'Placeholder', `section ${s.key} is a placeholder`)
    assert.equal(typeof s.load, 'function', `section ${s.key} has no loader`)
  }
})

test('exactly one default section', () => {
  assert.equal(ADMIN_SECTIONS.filter(s => s.isDefault).length, 1)
})

test('nav tree exposes every non-hidden section exactly once', () => {
  const inNav = adminNavTree().flatMap(g => g.items.map(i => i.key))
  const expected = ADMIN_SECTIONS.filter(s => !s.hidden).map(s => s.key)
  assert.deepEqual([...inNav].sort(), [...expected].sort())
})

test('bare /newsite/admin resolves to the default section', () => {
  const r = resolveAdminRoute([])
  assert.equal(r.section.key, 'analytics')
  assert.deepEqual(r.subPath, [])
})

test('deep links resolve to the longest matching section with a sub-path', () => {
  const r = resolveAdminRoute(['ctoons', 'edit', 'abc-123'])
  assert.equal(r.section.key, 'ctoons/edit')
  assert.deepEqual(r.subPath, ['abc-123'])

  const list = resolveAdminRoute(['ctoons'])
  assert.equal(list.section.key, 'ctoons')
  assert.deepEqual(list.subPath, [])
})

test('unknown sections resolve to null so the page can 404', () => {
  assert.equal(resolveAdminRoute(['does-not-exist']), null)
  assert.equal(resolveAdminRoute(['ctoons', 'nope', 'x']), null)
})

test('prototype keys cannot resolve to a section', () => {
  for (const key of ['constructor', '__proto__', 'toString', 'valueOf']) {
    assert.equal(getAdminSection(key), null, `${key} must not resolve`)
    assert.equal(resolveAdminRoute([key]), null, `${key} must not resolve`)
  }
})

// ── Old /admin/* URLs ─────────────────────────────────────────────────────
// The original pages are gone; these redirects are all that keeps old bookmarks
// and Discord links working, so a target that stopped resolving would turn a
// redirect into a 404 at exactly the moment someone follows an old link.

const CONSOLE = '/newsite/admin'

// What resolveAdminRoute wants for a redirect target, with a sample id standing
// in for the `/**` remainder.
function resolveTarget (target) {
  const path = target.replace(/\/\*\*$/, '/sample-id')
  assert.ok(path === CONSOLE || path.startsWith(`${CONSOLE}/`), `${target} is not a console path`)
  return resolveAdminRoute(path.slice(CONSOLE.length).split('/').filter(Boolean))
}

test('every old /admin redirect lands on a real console section', () => {
  for (const [from, to] of Object.entries(OLD_ADMIN_REDIRECTS)) {
    assert.ok(resolveTarget(to), `${from} -> ${to} does not resolve to a console section`)
  }
})

test('redirects that carry an id only target sections that accept one', () => {
  for (const [from, to] of Object.entries(OLD_ADMIN_REDIRECTS)) {
    if (!to.endsWith('/**') || from === '/admin/**') continue
    assert.ok(from.endsWith('/**'), `${from} must also end in /** to carry the id through`)
    assert.equal(resolveTarget(to).subPath.length, 1, `${from} -> ${to} should land on a record id`)
  }
})

test('old /admin URLs all redirect, with a catch-all for removed pages', () => {
  assert.equal(OLD_ADMIN_REDIRECTS['/admin'], CONSOLE)
  assert.equal(OLD_ADMIN_REDIRECTS['/admin/**'], CONSOLE)
  for (const [from, rule] of Object.entries(OLD_ADMIN_ROUTE_RULES)) {
    assert.ok(from === '/admin' || from.startsWith('/admin/'), `${from} is not an old admin path`)
    assert.equal(rule.redirect.to, OLD_ADMIN_REDIRECTS[from])
  }
})

test('the old admin pages and layout are really gone', () => {
  assert.ok(!existsSync(join(root, 'pages/admin')), 'pages/admin should not exist; /admin/* redirects to the console')
  assert.ok(!existsSync(join(root, 'layouts/admin.vue')), 'layouts/admin.vue was only used by pages/admin')
})

test('the legacy nav offers a way into the new console', () => {
  assert.match(read('components/Nav.vue'), /\/newsite\/admin/)
})
