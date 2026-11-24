// utils/fullSweepunitTest.js
//
// Full-sweep regression check for local development: run it after a code change to see whether the
// game still works end to end. It is deliberately broad rather than deep — the fine-grained rules
// live in tests/*.test.js (run them too with --unit).
//
// What it checks, in order:
//
//   1. READS   Every GET route under server/api (discovered from the file tree, so new routes are
//              picked up automatically) is requested from the running dev server:
//                - player routes as a logged-in player            → must not 5xx
//                - admin routes as an admin                        → must not 5xx, must not 401/403
//                - admin routes as a NON-admin                     → must be refused (401/403/404)
//              Dynamic segments ([id], [username]…) are filled with real rows from the database
//              where one can be found, otherwise with a placeholder id (a clean 4xx still passes).
//   2. PAGES   Every page in pages/ is server-rendered through the dev server → must not 5xx.
//   3. FLOWS   The core gameplay loops, run against the REAL route handlers loaded in-process (the
//              same approach as tests/helpers/dbKit.js) with every Discord token removed, so nothing
//              is ever posted to Discord. Each asserts the resulting database state:
//                cMart purchase · wishlist · trade list · cToon lock · cZone save · cZone favourite ·
//                auction create → bid → outbid → auto-bid → settle · trade offer → accept / reject ·
//                notifications · code redemption (valid, repeat, invalid) · notification settings ·
//                MyOrbit follow · lottery ticket
//   4. SOCKETS The Socket.IO server accepts an authenticated connection and answers join-zone.
//   5. UNIT    (--unit) runs `node --test` and reports any failure that is not a known
//              Windows-only path failure.
//
// It finishes with a coverage report: every write route (POST/PUT/PATCH/DELETE) that no flow
// exercised, grouped by feature area, so it is clear what this sweep does NOT prove.
//
// Requirements: Postgres and Redis running. `npm run dev` for sections 1–2 and `npm run socket` for
// section 4 — a section whose server is not reachable is reported as SKIPPED, not failed.
//
// Data: uses three accounts it creates once and then reuses (discordId "sweeptest-a|b|admin").
// Everything it creates is closed out or removed again except those accounts, the cToons they
// buy, and the usual logs. It refuses to run against a database that is not on localhost.
//
// Usage:
//   node utils/fullSweepunitTest.js                    # reads, pages, flows, sockets
//   node utils/fullSweepunitTest.js --unit             # … plus the unit tests
//   node utils/fullSweepunitTest.js --only flows       # any of: reads,pages,flows,sockets,unit
//   node utils/fullSweepunitTest.js --skip pages
//   node utils/fullSweepunitTest.js --verbose          # list every check and every uncovered route
//   node utils/fullSweepunitTest.js --base http://localhost:3000 --socket http://localhost:3001

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)
// Snapshot the environment before .env is merged in — the unit-test child process gets this copy.
const STARTING_ENV = { ...process.env }
// Must be this exact module, loaded here: server/prisma.js imports 'dotenv/config' too, and an ES
// module only runs once. Loading .env any other way would let that later import re-read the file
// and put back the Discord settings this script removes just below.
await import('dotenv/config')

// ── arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i > -1 ? argv[i + 1] : fallback }
const VERBOSE = flag('verbose')
const BASE = String(opt('base', 'http://localhost:3000')).replace(/\/$/, '')
const SOCKET_ORIGIN = String(opt('socket', process.env.SOCKET_ORIGIN || 'http://localhost:3001')).replace(/\/$/, '')
const ALL_SECTIONS = ['reads', 'pages', 'flows', 'sockets', 'unit']
const only = opt('only') ? opt('only').split(',') : null
const skip = opt('skip') ? opt('skip').split(',') : []
const wants = (s) => (only ? only.includes(s) : s === 'unit' ? flag('unit') : true) && !skip.includes(s)
for (const s of [...(only || []), ...skip]) if (!ALL_SECTIONS.includes(s)) { console.error(`Unknown section "${s}". Sections: ${ALL_SECTIONS.join(', ')}`); process.exit(2) }

// ── safety: local database only, and never talk to Discord ───────────────────
const dbHost = (() => { try { return new URL(process.env.DATABASE_URL).hostname } catch { return '' } })()
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbHost) && !flag('allow-remote-db')) {
  console.error(`Refusing to run: DATABASE_URL points at "${dbHost || 'nothing'}", not localhost. This script writes test data.`)
  process.exit(2)
}
for (const k of Object.keys(process.env)) if (/DISCORD|BOT_TOKEN|WEBHOOK/i.test(k)) delete process.env[k]

// ── Nuxt/Nitro shims so route handlers load in plain Node ────────────────────
register('../tests/helpers/aliasLoader.mjs', import.meta.url) // `@/` and `~/`
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return s === '#imports' ? { url: 'data:text/javascript,export const useRuntimeConfig = () => globalThis.__runtimeConfig', shortCircuit: true } : n(s, c) }"
))
globalThis.__runtimeConfig = {
  jwtSecret: process.env.JWT_SECRET,
  socketOrigin: SOCKET_ORIGIN,
  socketPath: process.env.SOCKET_PATH || '/socket.io',
  socketBridgeSecret: process.env.SOCKET_BRIDGE_SECRET || process.env.JWT_SECRET,
  discord: {},
  public: { baseUrl: BASE, socketPort: process.env.SOCKET_PORT || 3001 }
}
globalThis.useRuntimeConfig = () => globalThis.__runtimeConfig
const h3 = await import('h3')
for (const [k, v] of Object.entries(h3)) if (!(k in globalThis)) globalThis[k] = v // Nitro auto-imports

const jwt = (await import('jsonwebtoken')).default
const { prisma } = await import('../server/prisma.js')
const { Prisma } = await import('@prisma/client')
// Belt and braces: nothing imported above may have restored a Discord credential.
const leaked = Object.keys(process.env).filter(k => /DISCORD|BOT_TOKEN|WEBHOOK/i.test(k))
if (leaked.length) { console.error(`Refusing to run: Discord settings are present in the environment (${leaked.join(', ')}).`); process.exit(2) }

// ── results ──────────────────────────────────────────────────────────────────
const results = []
const C = { pass: '\x1b[32m', fail: '\x1b[31m', skip: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' }
function record (section, name, status, detail = '') {
  results.push({ section, name, status, detail })
  if (status !== 'pass' || VERBOSE) {
    const mark = status === 'pass' ? '✔' : status === 'fail' ? '✖' : '–'
    console.log(`  ${C[status]}${mark}${C.off} ${name}${detail ? `${C.dim}  ${String(detail).slice(0, 300)}${C.off}` : ''}`)
  }
}
const heading = (t) => console.log(`\n${t}`)
const sectionTally = (section) => {
  const r = results.filter(x => x.section === section)
  const n = (s) => r.filter(x => x.status === s).length
  console.log(`  ${C.dim}${n('pass')} passed, ${n('fail')} failed, ${n('skip')} skipped${C.off}`)
}
class Skip extends Error {}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const eq = (a, b, msg) => assert(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

// ── accounts ─────────────────────────────────────────────────────────────────
const sessionCookie = (userId) => `session=${jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '2h' })}`
const pointsOf = async (userId) => (await prisma.userPoints.findUnique({ where: { userId } }))?.points ?? 0

async function ensureUser (key, { isAdmin = false } = {}) {
  const discordId = `sweeptest-${key}`
  const username = `SweepTest${key[0].toUpperCase()}${key.slice(1)}`
  const avatar = fs.readdirSync('public/avatars').find(f => /\.(png|jpe?g|gif)$/i.test(f)) || null
  const user = await prisma.user.upsert({
    where: { discordId },
    update: { active: true, banned: false, inGuild: true, isAdmin, suspendedUntil: null, lastLogin: new Date() },
    create: { discordId, discordUsername: username.toLowerCase(), username, usernameChangedAt: new Date(), avatar, active: true, inGuild: true, isAdmin, lastLogin: new Date() }
  })
  const pts = await prisma.userPoints.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, points: 0 } })
  if (pts.points < 20000) await prisma.userPoints.update({ where: { userId: user.id }, data: { points: 50000 } })
  return { ...user, cookie: sessionCookie(user.id) }
}

/** Owned copies that can go into a trade or auction right now. */
const tradeable = (userId) => prisma.userCtoon.findMany({
  where: {
    userId, burnedAt: null, isTradeable: true, lockedByUserId: null,
    auctions: { none: { status: 'ACTIVE' } },
    tradeOfferCtoons: { none: { tradeOffer: { status: 'PENDING' } } }
  },
  select: { id: true, ctoonId: true, mintNumber: true, ctoon: { select: { name: true, rarity: true, price: true } } }
})

async function topUpCtoons (user, want) {
  const { processMintJob } = await import('../server/utils/mintCtoon.js')
  let have = (await tradeable(user.id)).length
  if (have >= want) return
  const pool = await prisma.ctoon.findMany({
    where: { inCmart: true, codeOnly: false, releaseDate: { lte: new Date() }, price: { gt: 0, lte: 500 } },
    select: { id: true, price: true }, take: 300
  })
  for (const c of pool.sort(() => Math.random() - 0.5)) {
    if (have >= want) break
    try { await processMintJob({ data: { userId: user.id, ctoonId: c.id, effectivePrice: c.price } }, prisma); have++ } catch { /* sold out / limit: try another */ }
  }
  if (have < want) throw new Error(`could only give ${user.username} ${have}/${want} cToons — is the cMart stocked?`)
}

// ── live HTTP (dev server) ───────────────────────────────────────────────────
async function live (urlPath, cookie, { method = 'GET', timeoutMs = 30000 } = {}) {
  try {
    const res = await fetch(BASE + urlPath, { method, headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    const text = await res.text().catch(() => '')
    return { status: res.status, text, location: res.headers.get('location') || '' }
  } catch (e) {
    return { status: 0, text: e?.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : String(e?.cause?.code || e?.message || e) }
  }
}
async function pool (items, size, worker) {
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await worker(items[i++]) }))
}
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])
const posix = (p) => p.split(path.sep).join('/')

// ── fixtures for dynamic route segments ──────────────────────────────────────
const PLACEHOLDER = '00000000-0000-4000-8000-000000000000'
const MODELS = Object.values(Prisma.ModelName || {})
const modelFor = (word) => {
  const base = String(word).replace(/[-_]/g, '').toLowerCase()
  const tries = [base, base.replace(/ies$/, 'y'), base.replace(/es$/, ''), base.replace(/s$/, '')]
  for (const t of tries) { const m = MODELS.find(n => n.toLowerCase() === t); if (m) return m }
  return null
}
const firstIdCache = new Map()
async function firstId (model) {
  if (!firstIdCache.has(model)) {
    const delegate = prisma[model[0].toLowerCase() + model.slice(1)]
    firstIdCache.set(model, delegate?.findFirst({ select: { id: true } }).then(r => r?.id ?? null).catch(() => null) ?? null)
  }
  return firstIdCache.get(model)
}
let fx = {}
async function loadFixtures (players) {
  const [a] = players
  const one = (p) => p.catch(() => null)
  const [auction, ctoon, userCtoon, entry] = await Promise.all([
    one(prisma.auction.findFirst({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], select: { id: true } })),
    one(prisma.ctoon.findFirst({ where: { inCmart: true }, select: { id: true } })),
    one(prisma.userCtoon.findFirst({ where: { userId: a.id, burnedAt: null }, select: { id: true } })),
    one(prisma.encyclopediaEntry?.findFirst({ select: { slug: true } }) ?? Promise.resolve(null))
  ])
  fx = { username: a.username, userId: a.id, auctionId: auction?.id, ctoonId: ctoon?.id, userCtoonId: userCtoon?.id, slug: entry?.slug }
}
/** Value for one dynamic segment. `before` is the path segments in front of it. Returns { value, real }. */
async function resolveParam (name, before) {
  const real = (value) => (value ? { value: String(value), real: true } : null)
  const prev = before[before.length - 1] || ''
  const byName = { username: fx.username, userId: fx.userId, ctoonId: fx.ctoonId, userCtoonId: fx.userCtoonId, slug: fx.slug }
  if (name in byName) return real(byName[name]) || { value: PLACEHOLDER, real: false }
  if (name === 'id' || name === 'tid') {
    if (prev === 'users' || prev === 'user') return real(fx.userId)
    if (prev === 'auction' || prev === 'auctions' || prev === 'AuctionHouse') return real(fx.auctionId) || { value: PLACEHOLDER, real: false }
    if (prev === 'ctoon' || prev === 'ctoons') return real(fx.ctoonId) || { value: PLACEHOLDER, real: false }
    if (prev === 'czone') return real(fx.username)
    const model = modelFor(prev) || modelFor(before.slice(-2).join(''))
    if (model) { const id = await firstId(model); if (id) return real(id) }
  } else if (/Id$/.test(name)) {
    const model = modelFor(name.slice(0, -2))
    if (model) { const id = await firstId(model); if (id) return real(id) }
  }
  return { value: PLACEHOLDER, real: false }
}
async function buildUrl (segments) {
  const out = []; let allReal = true
  for (const seg of segments) {
    const m = /^\[(\.\.\.)?(.+)\]$/.exec(seg)
    if (!m) { out.push(seg); continue }
    if (m[1]) continue // catch-all: its base path
    const r = await resolveParam(m[2], out)
    if (!r.real) allReal = false
    out.push(encodeURIComponent(r.value))
  }
  return { url: '/' + out.join('/'), allReal }
}

// ── 1. READS ─────────────────────────────────────────────────────────────────
// GET routes that are not plain reads: OAuth redirects, a Discord API call that rewrites
// User.inGuild, and the dev-tools status route.
const READ_EXCLUDE = [/^\/api\/auth\/discord/, /^\/api\/discord\/guild-check$/, /^\/api\/admin\/dev\//, /^\/api\/webhooks\//]

// Routes known to be broken independently of whatever change is being tested. They are reported on
// every run without failing it; delete an entry once its route is fixed.
const KNOWN_BROKEN_READS = {
  '/api/admin/socket-metrics': 'proxies to /metrics/socket, which the socket server does not serve, so the request hangs'
}

async function sweepReads ({ player, admin }) {
  heading('1. READS — every GET route on the dev server')
  const files = walk('server/api').map(posix).filter(f => f.endsWith('.get.js'))
  let placeholders = 0
  const jobs = []
  for (const file of files) {
    const segs = file.replace(/^server\//, '').replace(/\.get\.js$/, '').split('/').filter(s => s !== 'index')
    const { url, allReal } = await buildUrl(segs)
    const route = '/' + segs.join('/')
    if (READ_EXCLUDE.some(re => re.test(route))) { record('reads', `GET ${route}`, 'skip', 'excluded: not a plain read (redirect / Discord call / dev tool)'); continue }
    if (KNOWN_BROKEN_READS[route]) { record('reads', `GET ${route}`, 'skip', `KNOWN ISSUE: ${KNOWN_BROKEN_READS[route]}`); continue }
    if (!allReal) placeholders++
    // Some admin routes are gated to the super-admin tier; a plain admin is correctly refused there.
    const superOnly = /requireSuperAdmin/.test(fs.readFileSync(file, 'utf8'))
    jobs.push({ route, url, isAdmin: route.startsWith('/api/admin/'), allReal, superOnly })
  }
  await pool(jobs, 6, async (j) => {
    const r = await live(j.url, j.isAdmin ? admin.cookie : player.cookie)
    const who = j.isAdmin ? 'admin' : 'player'
    const note = j.allReal ? '' : ' (placeholder id)'
    if (r.status === 0) record('reads', `GET ${j.route} as ${who}`, 'fail', r.text)
    else if (r.status >= 500) record('reads', `GET ${j.route} as ${who}`, 'fail', `${r.status} ${r.text.slice(0, 200)}`)
    else if (j.superOnly && r.status === 403) record('reads', `GET ${j.route} as ${who}`, 'pass', '403 (super-admin only, as designed)')
    else if (j.isAdmin && (r.status === 401 || r.status === 403)) record('reads', `GET ${j.route} as ${who}`, 'fail', `admin was refused: ${r.status} ${r.text.replace(/\s+/g, ' ').slice(0, 160)}`)
    else record('reads', `GET ${j.route} as ${who}`, 'pass', `${r.status}${note}`)
    if (j.isAdmin) {
      const p = await live(j.url, player.cookie)
      if ([401, 403, 404].includes(p.status)) record('reads', `GET ${j.route} refused for non-admin`, 'pass', String(p.status))
      else record('reads', `GET ${j.route} refused for non-admin`, 'fail', `a non-admin got ${p.status} — expected 401/403/404`)
    }
  })
  console.log(`  ${C.dim}${jobs.length} routes requested; ${placeholders} used a placeholder id for a dynamic segment${C.off}`)
  sectionTally('reads')
}

// ── 2. PAGES ─────────────────────────────────────────────────────────────────
async function sweepPages ({ player, admin }) {
  heading('2. PAGES — server-render every page')
  // An account with no cToons is "not set up yet" and gets bounced to /setup-username from every
  // page, which would make each check below pass on a redirect without rendering anything.
  await topUpCtoons(player, 1)
  await topUpCtoons(admin, 1)
  // Where a signed-in, set-up account must never be sent: it means the page did not render.
  const BOUNCED = /^\/(setup-username|join-discord)?(\?|$)/
  // Pages that are themselves the bounce target redirect a healthy account away by design.
  const REDIRECTS_BY_DESIGN = new Set(['/', '/setup-username', '/join-discord'])
  const files = walk('pages').map(posix).filter(f => f.endsWith('.vue'))
  const jobs = []
  for (const file of files) {
    const segs = file.replace(/^pages\//, '').replace(/\.vue$/, '').split('/').filter(s => s !== 'index')
    const { url } = await buildUrl(segs)
    jobs.push({ url: url === '/' ? '/' : url, isAdmin: url.startsWith('/admin') })
  }
  await pool(jobs, 3, async (j) => {
    const r = await live(j.url, j.isAdmin ? admin.cookie : player.cookie, { timeoutMs: 120000 })
    if (r.status === 0) record('pages', `page ${j.url}`, 'fail', r.text)
    else if (r.status >= 500) record('pages', `page ${j.url}`, 'fail', `${r.status} ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`)
    else if (r.status >= 300 && r.status < 400) {
      const to = r.location.replace(/^https?:\/\/[^/]+/, '')
      // The dev server answers a page whose name matches a folder in public/ with a redirect to
      // the same path plus a slash, and renders the page there; follow that one hop.
      if (to === `${j.url}/`) {
        const again = await live(to, j.isAdmin ? admin.cookie : player.cookie, { timeoutMs: 120000 })
        if (again.status === 200) record('pages', `page ${j.url}`, 'pass', '200 (after the dev server\'s trailing-slash hop)')
        else record('pages', `page ${j.url}`, 'fail', `${again.status} ${again.location || again.text.replace(/\s+/g, ' ').slice(0, 160)}`)
      } else if (to === j.url) record('pages', `page ${j.url}`, 'fail', 'redirects to itself (a redirect loop)')
      else if (BOUNCED.test(to) && !REDIRECTS_BY_DESIGN.has(j.url)) record('pages', `page ${j.url}`, 'fail', `redirected to ${to} instead of rendering`)
      else record('pages', `page ${j.url}`, 'pass', `${r.status} -> ${to}`)
    } else record('pages', `page ${j.url}`, 'pass', String(r.status))
  })
  sectionTally('pages')
}

// ── 3. FLOWS (real handlers, in-process, Discord stripped) ───────────────────
const exercised = new Set() // handler files a flow actually called
let api = null
async function startApi () {
  const router = h3.createRouter()
  const mounted = new Set()
  // Handlers authenticate via $fetch('/api/auth/me', { cookie }); here the cookie is `sweepUser=<id>`.
  const userFromCookie = (cookie) => /sweepUser=([^;]+)/.exec(cookie || '')?.[1] || null
  globalThis.$fetch = async (url, opts = {}) => {
    if (url !== '/api/auth/me') throw new Error(`unexpected $fetch from a handler: ${url}`)
    const id = userFromCookie(opts.headers?.cookie)
    const me = id && await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, discordId: true, isAdmin: true } })
    if (!me) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    return me
  }
  const app = h3.createApp().use(h3.defineEventHandler(async (event) => {
    const id = userFromCookie(event.node.req.headers.cookie)
    event.context.userId = id
    event.context.user = id ? await prisma.user.findUnique({ where: { id } }) : null // what guild-check.js provides
  }))
  const server = http.createServer(h3.toNodeListener(app.use(router)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    /** call('post', 'server/api/auctions.post.js', '/api/auctions', { as: user, body }) → { status, body } */
    async call (method, file, urlPath, { as, body } = {}) {
      const pattern = '/' + file.replace(/^server\//, '').replace(/\.(get|post|put|patch|delete)\.js$/, '').replace(/\/index$/, '').replace(/\[([^\]]+)\]/g, ':$1')
      const key = `${method} ${pattern}`
      if (!mounted.has(key)) { router[method](pattern, (await import(pathToFileURL(path.join(ROOT, file)).href)).default); mounted.add(key) }
      exercised.add(file)
      const res = await fetch(base + urlPath, {
        method: method.toUpperCase(),
        headers: { ...(as ? { cookie: `sweepUser=${as.id}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
      const text = await res.text()
      let parsed; try { parsed = JSON.parse(text) } catch { parsed = text }
      return { status: res.status, body: parsed }
    },
    close: () => new Promise(resolve => server.close(resolve))
  }
}
const msgOf = (r) => `${r.status} ${r.body?.statusMessage || r.body?.message || JSON.stringify(r.body).slice(0, 160)}`
const ok = (r, what) => { assert(r.status === 200, `${what}: ${msgOf(r)}`); return r.body }
const refused = (r, what) => assert(r.status >= 400 && r.status < 500, `${what} should have been refused, got ${msgOf(r)}`)

async function flow (name, fn) {
  try { await fn(); record('flows', name, 'pass') } catch (e) {
    if (e instanceof Skip) record('flows', name, 'skip', e.message)
    else record('flows', name, 'fail', e?.message || String(e))
  }
}

async function sweepFlows ({ a, b, admin }) {
  heading('3. FLOWS — core gameplay against the real handlers')
  api = await startApi()
  await topUpCtoons(a, 6)
  await topUpCtoons(b, 6)
  const { rarityFloor } = await import('../server/utils/auctionPriceSuggestion.js')
  const { incrementFor } = await import('../server/utils/autoBid.js')

  await flow('cMart purchase: charges the price, mints the cToon, writes a points log', async () => {
    const { processMintJob } = await import('../server/utils/mintCtoon.js')
    const candidates = await prisma.ctoon.findMany({ where: { inCmart: true, codeOnly: false, releaseDate: { lte: new Date() }, price: { gt: 0, lte: 500 } }, select: { id: true, price: true }, take: 200 })
    const before = { pts: await pointsOf(a.id), owned: await prisma.userCtoon.count({ where: { userId: a.id } }), logs: await prisma.pointsLog.count({ where: { userId: a.id } }) }
    let bought = null
    for (const c of candidates.sort(() => Math.random() - 0.5)) {
      try { await processMintJob({ data: { userId: a.id, ctoonId: c.id, effectivePrice: c.price } }, prisma); bought = c; break } catch { /* next */ }
    }
    assert(bought, 'no cMart cToon could be bought')
    eq(await pointsOf(a.id), before.pts - bought.price, 'points after purchase')
    eq(await prisma.userCtoon.count({ where: { userId: a.id } }), before.owned + 1, 'owned cToons after purchase')
    assert(await prisma.pointsLog.count({ where: { userId: a.id } }) > before.logs, 'no PointsLog row was written')
  })

  await flow('wishlist: add, list, remove', async () => {
    const mine = new Set((await prisma.userCtoon.findMany({ where: { userId: a.id }, select: { ctoonId: true } })).map(r => r.ctoonId))
    const target = (await prisma.ctoon.findMany({ select: { id: true }, take: 100 })).find(c => !mine.has(c.id))
    if (!target) throw new Skip('no cToon the player does not already own')
    await prisma.wishlistItem.deleteMany({ where: { userId: a.id, ctoonId: target.id } })
    ok(await api.call('post', 'server/api/wishlist/[ctoonId].post.js', `/api/wishlist/${target.id}`, { as: a, body: { offeredPoints: 150 } }), 'add')
    eq((await prisma.wishlistItem.findUnique({ where: { userId_ctoonId: { userId: a.id, ctoonId: target.id } } }))?.offeredPoints, 150, 'stored offer')
    const list = ok(await api.call('get', 'server/api/wishlist.get.js', '/api/wishlist', { as: a }), 'list')
    assert(JSON.stringify(list).includes(target.id), 'the new item is missing from GET /api/wishlist')
    ok(await api.call('delete', 'server/api/wishlist/[ctoonId].delete.js', `/api/wishlist/${target.id}`, { as: a }), 'remove')
    eq(await prisma.wishlistItem.count({ where: { userId: a.id, ctoonId: target.id } }), 0, 'rows after remove')
  })

  await flow('trade list: add, list, remove', async () => {
    const uc = (await tradeable(a.id))[0]
    await prisma.userTradeListItem.deleteMany({ where: { userId: a.id, userCtoonId: uc.id } })
    ok(await api.call('post', 'server/api/trade-list/[userCtoonId].post.js', `/api/trade-list/${uc.id}`, { as: a }), 'add')
    eq(await prisma.userTradeListItem.count({ where: { userId: a.id, userCtoonId: uc.id } }), 1, 'rows after add')
    ok(await api.call('get', 'server/api/trade-list.get.js', '/api/trade-list', { as: a }), 'list')
    ok(await api.call('delete', 'server/api/trade-list/[userCtoonId].delete.js', `/api/trade-list/${uc.id}`, { as: a }), 'remove')
    eq(await prisma.userTradeListItem.count({ where: { userId: a.id, userCtoonId: uc.id } }), 0, 'rows after remove')
  })

  await flow('cToon lock: lock, then unlock', async () => {
    const uc = (await tradeable(a.id))[0]
    ok(await api.call('post', 'server/api/locks/[userCtoonId].post.js', `/api/locks/${uc.id}`, { as: a }), 'lock')
    eq((await prisma.userCtoon.findUnique({ where: { id: uc.id } })).lockedByUserId, a.id, 'lockedByUserId after lock')
    ok(await api.call('delete', 'server/api/locks/[userCtoonId].delete.js', `/api/locks/${uc.id}`, { as: a }), 'unlock')
    eq((await prisma.userCtoon.findUnique({ where: { id: uc.id } })).lockedByUserId, null, 'lockedByUserId after unlock')
  })

  await flow('cZone: save a layout, then load it back', async () => {
    const toons = (await tradeable(a.id)).slice(0, 2).map((uc, i) => ({ id: uc.id, x: 40 + i * 120, y: 60 }))
    ok(await api.call('post', 'server/api/czone/save.post.js', '/api/czone/save', { as: a, body: { zones: [{ background: '', toons }] } }), 'save')
    const saved = await prisma.cZone.findUnique({ where: { userId: a.id } })
    eq(saved?.layoutData?.zones?.[0]?.toons?.length, toons.length, 'toons stored in zone 0')
    ok(await api.call('get', 'server/api/czone/[username].get.js', `/api/czone/${a.username}`, { as: b }), 'view as another player')
  })

  await flow('cZone favourite: add, refuse own cZone, remove', async () => {
    ok(await api.call('post', 'server/api/czone/favorites/[username].post.js', `/api/czone/favorites/${b.username}`, { as: a }), 'favourite')
    eq(await prisma.favoriteCzone.count({ where: { userId: a.id, favoritedUserId: b.id } }), 1, 'rows after favourite')
    refused(await api.call('post', 'server/api/czone/favorites/[username].post.js', `/api/czone/favorites/${a.username}`, { as: a }), 'favouriting your own cZone')
    ok(await api.call('delete', 'server/api/czone/favorites/[username].delete.js', `/api/czone/favorites/${b.username}`, { as: a }), 'unfavourite')
    eq(await prisma.favoriteCzone.count({ where: { userId: a.id, favoritedUserId: b.id } }), 0, 'rows after unfavourite')
  })

  await flow('auction: create → bid → outbid → auto-bid retakes lead → settle to the winner', async () => {
    const uc = (await tradeable(a.id))[0]
    const start = rarityFloor(uc.ctoon.rarity)
    const created = ok(await api.call('post', 'server/api/auctions.post.js', '/api/auctions', { as: a, body: { userCtoonId: uc.id, initialBet: start, durationDays: 0, durationMinutes: 15 } }), 'create')
    const id = created.auction.id
    try {
      eq((await prisma.userCtoon.findUnique({ where: { id: uc.id } })).isTradeable, false, 'cToon tradeable while listed')
      refused(await api.call('post', 'server/api/auctions.post.js', '/api/auctions', { as: a, body: { userCtoonId: uc.id, initialBet: start, durationDays: 0, durationMinutes: 15 } }), 'listing the same cToon twice')
      refused(await api.call('post', 'server/api/auction/[id]/bid.post.js', `/api/auction/${id}/bid`, { as: a, body: { amount: start } }), "the seller bidding on their own auction")
      ok(await api.call('post', 'server/api/auction/[id]/bid.post.js', `/api/auction/${id}/bid`, { as: b, body: { amount: start } }), 'first bid')
      let auc = await prisma.auction.findUnique({ where: { id } })
      eq(auc.highestBidderId, b.id, 'leader after first bid')
      const raise = auc.highestBid + incrementFor(auc.highestBid)
      ok(await api.call('post', 'server/api/auction/[id]/bid.post.js', `/api/auction/${id}/bid`, { as: admin, body: { amount: raise } }), 'outbid')
      eq((await prisma.auction.findUnique({ where: { id } })).highestBidderId, admin.id, 'leader after outbid')
      ok(await api.call('post', 'server/api/auction/[id]/autobid.post.js', `/api/auction/${id}/autobid`, { as: b, body: { maxAmount: raise + 500 } }), 'auto-bid')
      auc = await prisma.auction.findUnique({ where: { id } })
      eq(auc.highestBidderId, b.id, 'leader after auto-bid')
      assert(auc.highestBid > raise, `auto-bid should have raised past ${raise}, high bid is ${auc.highestBid}`)
      ok(await api.call('get', 'server/api/auction/[id].get.js', `/api/auction/${id}`, { as: b }), 'auction detail')

      const before = { seller: await pointsOf(a.id), winner: await pointsOf(b.id) }
      // Settlement only counts bids placed at or before endAt, so end the auction "now" rather than in the past.
      await prisma.auction.update({ where: { id }, data: { endAt: new Date() } })
      await new Promise(r => setTimeout(r, 50))
      const { settleAuction } = await import('../server/utils/auctionSettle.js')
      await settleAuction(id, { db: prisma, scheduleAuctionClose: async () => {}, notifyAuctionWon: async () => {} })
      const closed = await prisma.auction.findUnique({ where: { id } })
      assert(closed.status !== 'ACTIVE', `auction is still ${closed.status} after settlement`)
      eq((await prisma.userCtoon.findUnique({ where: { id: uc.id } })).userId, b.id, 'cToon owner after settlement')
      eq(await pointsOf(b.id), before.winner - auc.highestBid, 'winner points after settlement')
      assert(await pointsOf(a.id) > before.seller, 'seller was not paid')
    } finally {
      await prisma.auction.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'CANCELLED' } }).catch(() => {})
      await prisma.userCtoon.updateMany({ where: { id: uc.id, isTradeable: false }, data: { isTradeable: true } }).catch(() => {})
    }
  })

  await flow('trade: offer → accept swaps both cToons', async () => {
    const give = (await tradeable(a.id))[0]; const get = (await tradeable(b.id))[0]
    refused(await api.call('post', 'server/api/trade/offers.post.js', '/api/trade/offers', { as: a, body: { recipientUsername: a.username, ctoonIdsOffered: [give.id], ctoonIdsRequested: [] } }), 'trading with yourself')
    const offer = ok(await api.call('post', 'server/api/trade/offers.post.js', '/api/trade/offers', { as: a, body: { recipientUsername: b.username, ctoonIdsOffered: [give.id], ctoonIdsRequested: [get.id] } }), 'offer').offer
    refused(await api.call('post', 'server/api/trade/offers/[id]/accept.post.js', `/api/trade/offers/${offer.id}/accept`, { as: a }), 'the sender accepting their own offer')
    ok(await api.call('get', 'server/api/trade/offers/incoming.get.js', '/api/trade/offers/incoming', { as: b }), 'incoming list')
    ok(await api.call('get', 'server/api/trade/offers/outgoing.get.js', '/api/trade/offers/outgoing', { as: a }), 'outgoing list')
    ok(await api.call('post', 'server/api/trade/offers/[id]/accept.post.js', `/api/trade/offers/${offer.id}/accept`, { as: b }), 'accept')
    eq((await prisma.tradeOffer.findUnique({ where: { id: offer.id } })).status, 'ACCEPTED', 'offer status')
    eq((await prisma.userCtoon.findUnique({ where: { id: give.id } })).userId, b.id, 'offered cToon owner')
    eq((await prisma.userCtoon.findUnique({ where: { id: get.id } })).userId, a.id, 'requested cToon owner')
    refused(await api.call('post', 'server/api/trade/offers/[id]/accept.post.js', `/api/trade/offers/${offer.id}/accept`, { as: b }), 'accepting the same offer twice')
  })

  await flow('trade: offer → reject leaves ownership alone', async () => {
    const give = (await tradeable(a.id))[0]; const get = (await tradeable(b.id))[0]
    const offer = ok(await api.call('post', 'server/api/trade/offers.post.js', '/api/trade/offers', { as: a, body: { recipientUsername: b.username, ctoonIdsOffered: [give.id], ctoonIdsRequested: [get.id] } }), 'offer').offer
    ok(await api.call('post', 'server/api/trade/offers/[id]/reject.post.js', `/api/trade/offers/${offer.id}/reject`, { as: b }), 'reject')
    const status = (await prisma.tradeOffer.findUnique({ where: { id: offer.id } })).status
    assert(status !== 'PENDING' && status !== 'ACCEPTED', `offer status after reject is ${status}`)
    eq((await prisma.userCtoon.findUnique({ where: { id: give.id } })).userId, a.id, 'offered cToon owner')
    eq((await prisma.userCtoon.findUnique({ where: { id: get.id } })).userId, b.id, 'requested cToon owner')
  })

  await flow('notifications: a trade offer notifies the recipient; list, count, mark all read', async () => {
    const give = (await tradeable(a.id))[0]; const get = (await tradeable(b.id))[0]
    // Trade notifications are de-duplicated per sender, so clear the ones the earlier flows left.
    const fromA = { userId: b.id, contextType: 'TRADE', contextId: a.id }
    await prisma.notification.deleteMany({ where: fromA })
    const offer = ok(await api.call('post', 'server/api/trade/offers.post.js', '/api/trade/offers', { as: a, body: { recipientUsername: b.username, ctoonIdsOffered: [give.id], ctoonIdsRequested: [get.id] } }), 'offer').offer
    try {
      let n = 0
      for (let i = 0; i < 20 && !n; i++) { n = await prisma.notification.count({ where: { ...fromA, readAt: null } }); if (!n) await new Promise(r => setTimeout(r, 100)) } // sent after the response
      assert(n > 0, 'no notification was created for the recipient')
      ok(await api.call('get', 'server/api/notifications/index.get.js', '/api/notifications', { as: b }), 'list')
      const count = ok(await api.call('get', 'server/api/notifications/count.get.js', '/api/notifications/count', { as: b }), 'count')
      assert(JSON.stringify(count).match(/[1-9]/), `unread count should be above zero: ${JSON.stringify(count)}`)
      ok(await api.call('post', 'server/api/notifications/read.post.js', '/api/notifications/read', { as: b, body: { all: true } }), 'mark all read')
      eq(await prisma.notification.count({ where: { userId: b.id, readAt: null } }), 0, 'unread after mark-all-read')
    } finally {
      await api.call('post', 'server/api/trade/offers/[id]/reject.post.js', `/api/trade/offers/${offer.id}/reject`, { as: b })
    }
  })

  await flow('code redemption: valid code pays out once; repeat and unknown codes are refused and logged', async () => {
    const code = `SWEEP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    const row = await prisma.claimCode.create({ data: { code, maxClaims: 5, showInFrontend: false, rewards: { create: [{ points: 123 }] } } })
    try {
      const before = await pointsOf(a.id)
      ok(await api.call('post', 'server/api/redeem.post.js', '/api/redeem', { as: a, body: { code } }), 'redeem')
      eq(await pointsOf(a.id), before + 123, 'points after redeeming')
      eq(await prisma.claim.count({ where: { codeId: row.id, userId: a.id } }), 1, 'claim rows')
      refused(await api.call('post', 'server/api/redeem.post.js', '/api/redeem', { as: a, body: { code } }), 'redeeming the same code twice')
      eq(await pointsOf(a.id), before + 123, 'points after the repeat attempt')
      const since = new Date()
      refused(await api.call('post', 'server/api/redeem.post.js', '/api/redeem', { as: a, body: { code: `${code}-NOPE` } }), 'an unknown code')
      assert(await prisma.redeemAttemptLog.count({ where: { userId: a.id, createdAt: { gte: since } } }) > 0, 'the failed attempt was not logged')
    } finally {
      await prisma.redeemAttemptLog.deleteMany({ where: { OR: [{ codeId: row.id }, { userId: a.id, codeText: { startsWith: code } }] } }).catch(() => {})
      await prisma.claim.deleteMany({ where: { codeId: row.id } }).catch(() => {})
      await prisma.claimCodeReward.deleteMany({ where: { codeId: row.id } }).catch(() => {})
      await prisma.claimCode.delete({ where: { id: row.id } }).catch(() => {})
    }
  })

  await flow('settings: notification preference saves and restores', async () => {
    const before = (await prisma.user.findUnique({ where: { id: a.id } })).allowAuctionNotifications
    ok(await api.call('put', 'server/api/user/notifications.put.js', '/api/user/notifications', { as: a, body: { allowAuctionNotifications: !before } }), 'save')
    eq((await prisma.user.findUnique({ where: { id: a.id } })).allowAuctionNotifications, !before, 'stored preference')
    ok(await api.call('put', 'server/api/user/notifications.put.js', '/api/user/notifications', { as: a, body: { allowAuctionNotifications: before } }), 'restore')
  })

  await flow('MyOrbit follow: follow, list, refuse self, unfollow', async () => {
    ok(await api.call('post', 'server/api/myorbit/follow/[userId].post.js', `/api/myorbit/follow/${b.id}`, { as: a }), 'follow')
    const list = ok(await api.call('get', 'server/api/myorbit/following.get.js', '/api/myorbit/following', { as: a }), 'following list')
    assert(JSON.stringify(list).includes(b.id) || JSON.stringify(list).includes(b.username), 'the followed player is missing from the list')
    refused(await api.call('post', 'server/api/myorbit/follow/[userId].post.js', `/api/myorbit/follow/${a.id}`, { as: a }), 'following yourself')
    ok(await api.call('delete', 'server/api/myorbit/follow/[userId].delete.js', `/api/myorbit/follow/${b.id}`, { as: a }), 'unfollow')
  })

  await flow('lottery: buying a ticket charges points and returns a roll', async () => {
    const before = await pointsOf(a.id)
    const r = await api.call('post', 'server/api/lottery.post.js', '/api/lottery', { as: a })
    if (r.status === 500 && /settings not found/i.test(msgOf(r))) throw new Skip('no lotto settings in this database')
    if (r.status === 400 && /limit reached/i.test(msgOf(r))) throw new Skip('daily ticket limit already reached for the test player')
    const body = ok(r, 'buy ticket')
    assert('roll' in body && 'win' in body, `unexpected response ${JSON.stringify(body).slice(0, 120)}`)
    assert(await pointsOf(a.id) !== before || body.win, 'points did not change after buying a ticket')
  })

  await api.close()
  sectionTally('flows')
}

// ── 4. SOCKETS ───────────────────────────────────────────────────────────────
async function sweepSockets ({ player }) {
  heading('4. SOCKETS — Socket.IO server')
  const { io } = await import('socket.io-client')
  const zone = `sweeptest-${crypto.randomBytes(3).toString('hex')}`
  const result = await new Promise((resolve) => {
    const socket = io(SOCKET_ORIGIN, { path: process.env.SOCKET_PATH || '/socket.io', transports: ['websocket'], reconnection: false, timeout: 5000, extraHeaders: { cookie: player.cookie } })
    const done = (v) => { clearTimeout(timer); try { socket.disconnect() } catch {} resolve(v) }
    const timer = setTimeout(() => done({ connected: socket.connected, count: null, error: 'timed out' }), 8000)
    socket.on('connect_error', (e) => done({ connected: false, error: e?.message || String(e) }))
    socket.on('connect', () => socket.emit('join-zone', { zone }))
    socket.on('visitor-count', (count) => done({ connected: true, count }))
  })
  if (!result.connected) { record('sockets', 'connect to the socket server', 'skip', `${SOCKET_ORIGIN} not reachable (${result.error}) — start it with: npm run socket`); return sectionTally('sockets') }
  record('sockets', 'authenticated connection is accepted', 'pass')
  if (result.count >= 1) record('sockets', 'join-zone answers with a visitor count', 'pass', `count ${result.count}`)
  else record('sockets', 'join-zone answers with a visitor count', 'fail', result.error || `count ${result.count}`)
  sectionTally('sockets')
}

// ── 5. UNIT ──────────────────────────────────────────────────────────────────
// These eight fail on Windows only (a doubled drive letter, `c:\c:\…`, in the path they build) and
// fail the same way on a clean checkout, so they are reported but not counted as failures there.
const KNOWN_WINDOWS_FAILURES = ['adminPermissions', 'adminSectionsContract', 'cronJobsRegistry', 'dissolveMisfireOfficialRelease', 'ogGtoonTournamentSocket', 'queueHealth', 'siteScale', 'auctionItemAccess']
function sweepUnit () {
  heading('5. UNIT — node --test')
  // Run them the way `npm test` does: with the environment this script was started with, not the
  // one it built for itself (.env merged in, Discord settings stripped) — several tests read env.
  const run = spawnSync(process.execPath, ['--test'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, env: STARTING_ENV })
  const out = `${run.stdout}\n${run.stderr}`
  const num = (label) => Number((out.match(new RegExp(`^ℹ ${label} (\\d+)`, 'm')) || [])[1] ?? NaN)
  // The failure summary introduces each failure with "test at tests\<file>.test.js:line:col".
  const failedIn = [...out.matchAll(/^test at tests[\\/]([\w.-]+?)\.test\.js:/gm)].map(m => m[1])
  const isKnown = (file) => process.platform === 'win32' && KNOWN_WINDOWS_FAILURES.includes(file)
  const known = [...new Set(failedIn.filter(isKnown))]
  const unexpected = [...new Set(failedIn.filter(f => !isKnown(f)))]
  const unattributed = Math.max(0, num('fail') - failedIn.length) // a failure the summary tied to no file
  if (Number.isNaN(num('tests'))) record('unit', 'unit tests ran', 'fail', out.slice(-300))
  else if (!unexpected.length && !unattributed) record('unit', `unit tests: ${num('pass')} passed`, 'pass', known.length ? `ignored ${known.length} known Windows-only path failure(s): ${known.join(', ')}` : '')
  else record('unit', `unit tests: ${unexpected.length + unattributed} unexpected failure(s)`, 'fail', unexpected.map(f => `${f}.test.js`).join(', ') || 'see `node --test` output')
  sectionTally('unit')
}

// ── coverage report ──────────────────────────────────────────────────────────
function coverageReport () {
  const writes = walk('server/api').map(posix).filter(f => /\.(post|put|patch|delete)\.js$/.test(f))
  const uncovered = writes.filter(f => !exercised.has(f))
  const area = (f) => { const s = f.split('/'); return s[2] === 'admin' ? 'admin' : s[2] === 'game' ? `game/${(s[3] || '').replace(/\..*/, '')}` : s[2].replace(/\..*/, '') }
  const by = {}
  for (const f of uncovered) (by[area(f)] ||= []).push(f)
  heading(`COVERAGE — write routes (POST/PUT/PATCH/DELETE): ${writes.length - uncovered.length} of ${writes.length} exercised by a flow`)
  console.log(`  ${C.dim}Not exercised, by area: ${Object.entries(by).sort((x, y) => y[1].length - x[1].length).map(([k, v]) => `${k} ${v.length}`).join(' · ')}${C.off}`)
  if (VERBOSE) for (const f of uncovered) console.log(`  ${C.dim}· ${f}${C.off}`)
  else console.log(`  ${C.dim}(--verbose lists each one)${C.off}`)
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main () {
  console.log(`Full sweep — database ${dbHost}, dev server ${BASE}, socket server ${SOCKET_ORIGIN}`)
  const a = await ensureUser('a'); const b = await ensureUser('b'); const admin = await ensureUser('admin', { isAdmin: true })
  await loadFixtures([a, b])

  const serverUp = (wants('reads') || wants('pages')) ? (await live('/api/global-config', null, { timeoutMs: 60000 })).status === 200 : false
  for (const s of ['reads', 'pages']) {
    if (!wants(s)) continue
    if (!serverUp) { heading(`${s === 'reads' ? '1. READS' : '2. PAGES'}`); record(s, `dev server at ${BASE}`, 'skip', 'not reachable — start it with: npm run dev'); continue }
    await (s === 'reads' ? sweepReads({ player: a, admin }) : sweepPages({ player: a, admin }))
  }
  if (wants('flows')) await sweepFlows({ a, b, admin })
  if (wants('sockets')) await sweepSockets({ player: a })
  if (wants('unit')) sweepUnit()
  if (wants('flows')) coverageReport()

  const n = (s) => results.filter(r => r.status === s).length
  heading(`RESULT — ${C.pass}${n('pass')} passed${C.off}, ${n('fail') ? C.fail : ''}${n('fail')} failed${C.off}, ${n('skip')} skipped`)
  if (n('fail')) {
    console.log('Failures:')
    for (const r of results.filter(r => r.status === 'fail')) console.log(`  ${C.fail}✖${C.off} [${r.section}] ${r.name}${C.dim}  ${String(r.detail).slice(0, 240)}${C.off}`)
  }
  return n('fail') ? 1 : 0
}

let exitCode = 1
try { exitCode = await main() } catch (e) { console.error('\n✖ Sweep aborted:', e) }
await prisma.$disconnect().catch(() => {})
process.exit(exitCode)
