import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

const perms = await import(join(root, 'utils/adminPermissions.js'))
const sections = await import(join(root, 'utils/adminSections.js'))
const {
  ADMIN_PERMISSION_KEYS, ADMIN_PERMISSION_PRESETS, ADMIN_API_SEGMENT_PERMS,
  adminApiAccess, adminScopeDenial, adminScopeOf, cleanAdminPermissions,
  normalizeAdminApiPath, isScopedAdminPath
} = perms
const { ADMIN_SECTIONS, permOf, adminNavTree, grantableAdminTree } = sections

const sub = (...p) => ({ full: false, permissions: p })
const FULL = { full: true, permissions: [] }

function walk (dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

// ── Registry <-> sections ────────────────────────────────────────────────────────────────

test('permission keys are unique', () => {
  assert.equal(new Set(ADMIN_PERMISSION_KEYS).size, ADMIN_PERMISSION_KEYS.length)
})

test('every grantable tool in the console has a permission key, and every key is a tool', () => {
  const grantable = ADMIN_SECTIONS.filter(s => !s.hidden && !s.superOnly).map(permOf)
  assert.deepEqual([...grantable].sort(), [...ADMIN_PERMISSION_KEYS].sort())
})

test('hidden sub-pages are gated by a real permission of their parent tool', () => {
  for (const s of ADMIN_SECTIONS.filter(x => x.hidden)) {
    assert.ok(ADMIN_PERMISSION_KEYS.includes(permOf(s)), `hidden section ${s.key} has perm ${permOf(s)} which is not grantable`)
  }
})

test('super-admin-only tools are never grantable', () => {
  for (const s of ADMIN_SECTIONS.filter(x => x.superOnly)) {
    assert.ok(!ADMIN_PERMISSION_KEYS.includes(permOf(s)), `${s.key} must not be a grantable permission`)
  }
})

test('presets only use real permissions', () => {
  for (const p of ADMIN_PERMISSION_PRESETS) {
    assert.ok(p.perms.length > 0, `preset ${p.id} is empty`)
    for (const k of p.perms) assert.ok(ADMIN_PERMISSION_KEYS.includes(k), `preset ${p.id} has unknown key ${k}`)
  }
})

test('every permission named by an API rule is a real permission', () => {
  for (const [seg, list] of Object.entries(ADMIN_API_SEGMENT_PERMS)) {
    for (const k of list) assert.ok(ADMIN_PERMISSION_KEYS.includes(k), `rule ${seg} names unknown permission ${k}`)
  }
})

test('every tool is reachable: some API rule or the users rules mention its permission', () => {
  const mentioned = new Set(Object.values(ADMIN_API_SEGMENT_PERMS).flat())
  ;['manageUsers', 'checkCheating', 'cheatingTool', 'cMoon', 'authLogs', 'adminChanges'].forEach(k => mentioned.add(k))
  for (const k of ADMIN_PERMISSION_KEYS) {
    assert.ok(mentioned.has(k), `permission ${k} is not named by any API rule; a sub-admin with it could not load anything`)
  }
})

test('nav tree for a sub-admin only contains granted tools', () => {
  const tree = adminNavTree(k => k === 'ctoons' || k === 'tradeLogs')
  const keys = tree.flatMap(g => g.items.map(i => i.key))
  assert.deepEqual(keys.sort(), ['ctoons', 'tradeLogs'])
  assert.deepEqual(adminNavTree(() => false), [])
})

test('the modal tree lists every tool once, super-admin-only ones flagged', () => {
  const items = grantableAdminTree().flatMap(g => g.items)
  assert.equal(new Set(items.map(i => i.perm)).size, items.length)
  assert.ok(items.find(i => i.label === 'Track Touch Trades')?.superOnly)
  assert.ok(items.find(i => i.perm === 'production')?.sensitive)
})

// ── Every admin API file is mapped (fail closed) ─────────────────────────────────────────

test('every /api/admin handler is mapped to a permission, full-only, or super-admin-only', () => {
  const base = join(root, 'server/api/admin')
  const unmapped = []
  for (const file of walk(base)) {
    const rel = relative(base, file).split(sep).join('/')
    const route = '/api/admin/' + rel
      .replace(/\.(get|post|put|patch|delete)\.js$/, '')
      .replace(/\.js$/, '')
      .replace(/\/index$/, '')
      .replace(/\[[^\]]+\]/g, 'x')
    const access = adminApiAccess(normalizeAdminApiPath(route))
    if (access.type !== 'denied') continue
    // A "denied" route is only acceptable if its handler is itself super-admin only.
    if (!/requireSuperAdmin|SUPER_ADMIN_DISCORD_ID/.test(readFileSync(file, 'utf8'))) unmapped.push(route)
  }
  assert.deepEqual(unmapped, [], `unmapped admin endpoints (add them to ADMIN_API_SEGMENT_PERMS):\n${unmapped.join('\n')}`)
})

// ── Enforcement behaviour ────────────────────────────────────────────────────────────────

test('a full admin is never narrowed', () => {
  assert.equal(adminScopeDenial(FULL, '/api/admin/users/abc/ban'), null)
  assert.equal(adminScopeDenial(FULL, '/api/admin/anything-new'), null)
})

test('a sub-admin may call endpoints of granted tools only', () => {
  const s = sub('ctoons')
  assert.equal(adminScopeDenial(s, '/api/admin/all-ctoons'), null)
  assert.equal(adminScopeDenial(s, '/api/admin/ctoon/123?x=1'), null)
  assert.match(adminScopeDenial(s, '/api/admin/points-log'), /do not have access/)
  assert.match(adminScopeDenial(s, '/api/admin/global-config'), /do not have access/)
})

test('a shared endpoint is open to any tool that uses it', () => {
  assert.equal(adminScopeDenial(sub('achievements'), '/api/admin/list-ctoons'), null)
  assert.equal(adminScopeDenial(sub('codes'), '/api/admin/list-ctoons'), null)
  assert.notEqual(adminScopeDenial(sub('pointLogs'), '/api/admin/list-ctoons'), null)
})

test('an unmapped admin path is refused for a sub-admin', () => {
  assert.notEqual(adminScopeDenial(sub('ctoons'), '/api/admin/brand-new-endpoint'), null)
  assert.notEqual(adminScopeDenial(sub('ctoons'), '/api/admin'), null)
  assert.notEqual(adminScopeDenial(sub('ctoons'), '/api/admin/'), null)
})

test('prototype keys and odd segments do not resolve to a rule', () => {
  for (const seg of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.notEqual(adminScopeDenial(sub('ctoons', 'manageUsers'), `/api/admin/${seg}`), null, seg)
  }
})

test('users routes: list for several tools, actions for Manage Users only', () => {
  assert.equal(adminScopeDenial(sub('authLogs'), '/api/admin/users'), null)
  assert.notEqual(adminScopeDenial(sub('authLogs'), '/api/admin/users/u1/ban'), null)
  assert.equal(adminScopeDenial(sub('manageUsers'), '/api/admin/users/u1/ban'), null)
  assert.equal(adminScopeDenial(sub('cMoon'), '/api/admin/users/u1/update-cmoon'), null)
  assert.equal(adminScopeDenial(sub('cMoon'), '/api/admin/users/search?q=a'), null)
  assert.notEqual(adminScopeDenial(sub('cMoon'), '/api/admin/users/u1/dissolve'), null)
})

test('granting admin access is never available to a sub-admin, even with every tool', () => {
  const all = sub(...ADMIN_PERMISSION_KEYS)
  for (const tail of ['admin-access', 'make-admin', 'remove-admin']) {
    assert.match(adminScopeDenial(all, `/api/admin/users/u1/${tail}`), /Full admins only/)
  }
  assert.equal(adminApiAccess('/api/admin/users/u1/admin-access').type, 'full-only')
})

test('touch trades are not available to a sub-admin, even with every tool', () => {
  assert.notEqual(adminScopeDenial(sub(...ADMIN_PERMISSION_KEYS), '/api/admin/touch-trades'), null)
  assert.notEqual(adminScopeDenial(sub(...ADMIN_PERMISSION_KEYS), '/api/admin/touch-trades/dismiss'), null)
})

test('admin-only endpoints outside /api/admin are full-admin only', () => {
  assert.match(adminScopeDenial(sub(...ADMIN_PERMISSION_KEYS), '/api/discord/register-commands'), /Full admins only/)
  assert.equal(adminScopeDenial(FULL, '/api/discord/register-commands'), null)
  assert.equal(adminScopeDenial(sub('ctoons'), '/api/ctoons'), null)
})

test('path tricks cannot dodge the rules', () => {
  const s = sub('ctoons')
  for (const p of [
    '//api//admin//users/u1/ban',
    '/api/admin/ctoons/../users/u1/ban',
    '/api/admin/./users/u1/ban',
    '/api/admin/%75sers/u1/ban',
    '/api/admin/%2e%2e/admin/users/u1/ban',
    '/API/ADMIN/users/u1/ban',
    '/api/admin/users/u1/ban#x'
  ]) {
    assert.notEqual(adminScopeDenial(s, p), null, `${p} should be refused`)
  }
  assert.ok(isScopedAdminPath(normalizeAdminApiPath('/Api/Admin/x')))
  assert.ok(!isScopedAdminPath(normalizeAdminApiPath('/api/administrators')))
})

test('scope derivation', () => {
  assert.deepEqual(adminScopeOf({ isAdmin: false }), { full: false, permissions: [] })
  assert.deepEqual(adminScopeOf({ isAdmin: true, adminRestricted: false }), { full: true, permissions: [] })
  assert.deepEqual(
    adminScopeOf({ isAdmin: true, adminRestricted: true, adminPermissions: ['ctoons', 'gone-tool', 'ctoons'] }),
    { full: false, permissions: ['ctoons'] }
  )
  assert.deepEqual(cleanAdminPermissions(['pointLogs', 'ctoons', 'nope']), ['ctoons', 'pointLogs'])
  assert.deepEqual(cleanAdminPermissions(null), [])
})

// ── Wiring contracts ─────────────────────────────────────────────────────────────────────

test('the scope middleware, grant endpoint, and legacy-page block are wired', () => {
  const mw = read('server/middleware/require-admin-scope.js')
  assert.match(mw, /adminScopeDenial/)
  assert.match(mw, /statusCode: 403/)

  const ep = read('server/api/admin/users/[id]/admin-access.post.js')
  assert.match(ep, /requireAdmin\(event\)/)
  assert.match(ep, /scope\?\.full/)
  assert.match(ep, /SUPER_ADMIN_DISCORD_ID/)
  assert.match(ep, /logAdminChange/)
  for (const key of ['makeSubAdmin', 'editSubAdminAccess', 'removeSubAdmin', 'convertToSubAdmin']) {
    assert.ok(ep.includes(`'${key}'`), `endpoint does not log ${key}`)
  }

  const legacy = read('middleware/admin.js')
  assert.match(legacy, /isFullAdmin/)
  assert.match(legacy, /navigateTo\('\/newsite\/admin'\)/)

  for (const f of ['server/api/admin/users/[id]/make-admin.post.js', 'server/api/admin/users/[id]/remove-admin.post.js']) {
    const src = read(f)
    assert.match(src, /adminRestricted: false/, `${f} must clear the sub-admin scope`)
    assert.match(src, /targetUserId/, `${f} must record the target in the admin log`)
  }
})
