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
  getAdminSection, OLD_ADMIN_GROUPS, OLD_ADMIN_PATHS
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

// ── Old admin fallback ────────────────────────────────────────────────────
// The original /admin/* pages stay live until each console section is
// confirmed working. These guard the fallback itself: a menu entry pointing at
// a page that no longer exists is a dead end at exactly the moment someone is
// reaching for it because the new console misbehaved.

test('every Old Admin menu entry resolves to a real page file', () => {
  for (const group of OLD_ADMIN_GROUPS) {
    for (const item of group.items) {
      const slug = item.to.replace(/^\/admin\/?/, '') || 'index'
      assert.ok(
        existsSync(join(root, 'pages/admin', `${slug}.vue`)),
        `Old Admin entry "${item.label}" -> ${item.to} has no page`
      )
    }
  }
})

test('Old Admin entries all point into /admin and have labels', () => {
  assert.ok(OLD_ADMIN_PATHS.length > 0)
  for (const group of OLD_ADMIN_GROUPS) {
    assert.ok(group.items.length, `empty Old Admin group ${group.id}`)
    for (const item of group.items) {
      assert.ok(item.to === '/admin' || item.to.startsWith('/admin/'), `${item.to} is not an old admin path`)
      assert.ok(item.label && item.label.trim().length, `entry ${item.to} has no label`)
    }
  }
})

test('Old Admin paths are unique', () => {
  assert.equal(new Set(OLD_ADMIN_PATHS).size, OLD_ADMIN_PATHS.length)
})

test('the old admin layout still exists for the fallback pages', () => {
  assert.ok(existsSync(join(root, 'layouts/admin.vue')), 'layouts/admin.vue is required by pages/admin/*')
  assert.ok(existsSync(join(root, 'pages/admin/index.vue')), 'pages/admin/index.vue missing')
})

test('the legacy nav offers a way into the new console', () => {
  assert.match(read('components/Nav.vue'), /\/newsite\/admin/)
})
