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
  getAdminSection, legacyAdminTarget, LEGACY_ADMIN_REDIRECTS
} = await import(join(root, 'utils/adminSections.js'))

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

test('every legacy /admin link in the redirect map points at a real section', () => {
  for (const [slug, key] of LEGACY_ADMIN_REDIRECTS) {
    assert.ok(getAdminSection(key), `legacy /admin/${slug} -> unknown section ${key}`)
  }
})

test('legacy redirects stay on-site and never build an off-site target', () => {
  assert.equal(legacyAdminTarget('/admin/users'), '/newsite/admin/manageUsers')
  assert.equal(legacyAdminTarget('/admin'), '/newsite/admin/analytics')
  // A protocol-relative target would navigate off-site.
  for (const path of ['/admin//evil.com', '/admin/\\evil.com', '/admin/../../evil']) {
    const target = legacyAdminTarget(path)
    assert.ok(target.startsWith('/newsite/admin'), `${path} produced ${target}`)
    assert.ok(!target.startsWith('//'), `${path} produced a protocol-relative target`)
  }
  // Non-admin paths are left alone.
  assert.equal(legacyAdminTarget('/newsite/home'), null)
  assert.equal(legacyAdminTarget('/administrator'), null)
})

test('legacy redirects preserve a single trailing record id', () => {
  assert.equal(legacyAdminTarget('/admin/editCtoon/abc-123'), '/newsite/admin/ctoons/edit/abc-123')
  assert.equal(legacyAdminTarget('/admin/edit-pack/99'), '/newsite/admin/packs/edit/99')
})

test('no component still references a retired /admin/* route', () => {
  const files = [
    'components/Nav.vue',
    'components/newsite/AdminNav.vue',
    'pages/newsite/admin/[...path].vue'
  ]
  for (const f of files) {
    const src = read(f)
    const hits = [...src.matchAll(/["'`]\/admin\//g)]
    assert.equal(hits.length, 0, `${f} still links into the retired /admin/* routes`)
  }
})

test('the old admin pages and layout are gone', () => {
  assert.ok(!existsSync(join(root, 'pages/admin')), 'pages/admin still exists')
  assert.ok(!existsSync(join(root, 'layouts/admin.vue')), 'layouts/admin.vue still exists')
})
