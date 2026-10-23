// Shared setup for the ownership db tests (tests/*Ownership*, auctionSettlement, mintCtoon, packOpening).
//
// These run against a REAL Postgres (and Redis, for the queue the handlers enqueue onto) so they exercise the
// actual SQL, row locks and transactions — the parts that decide who ends up owning a cToon. They are skipped
// unless OWNERSHIP_TEST_DB is set to a throwaway database already migrated to the current schema:
//
//   OWNERSHIP_TEST_DB=postgresql://... REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
//     node --test --test-force-exit --test-concurrency=1 tests/*.db.test.js
//
// Every fixture uses random ids/usernames, so tests never collide with each other or with leftover rows.
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { register } from 'node:module'
import { createApp, createRouter, toNodeListener } from 'h3'

export const DB_URL = process.env.OWNERSHIP_TEST_DB
// `run` is test() when a database is configured, test.skip otherwise.
export const skipUnlessDb = !DB_URL

let booted
/** Points the app at the test database, registers the `@/` alias, stubs Nitro's global `$fetch`, and returns { prisma }. */
export async function boot() {
  if (booted) return booted
  process.env.DATABASE_URL = DB_URL
  process.env.MINT_QUEUE_KEY ||= `ownershipTest-${randomUUID().slice(0, 8)}`
  delete process.env.BOT_TOKEN // handlers DM Discord when this is set
  register('./aliasLoader.mjs', import.meta.url)

  const { prisma } = await import('../../server/prisma.js')

  // Handlers authenticate with `$fetch('/api/auth/me', { headers: { cookie } })`, which only exists inside Nitro.
  // Here the cookie is simply `testUser=<id>`.
  globalThis.$fetch = async (url, opts = {}) => {
    if (url === '/api/auth/me') {
      const id = /testUser=([^;]+)/.exec(opts.headers?.cookie || '')?.[1]
      const me = id && await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, isAdmin: true } })
      if (!me) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
      return me
    }
    throw new Error(`unexpected $fetch in test: ${url}`)
  }

  booted = { prisma }
  return booted
}

const tag = () => randomUUID().slice(0, 8)

export async function mkUser(prisma, { points = 0, username } = {}) {
  const t = tag()
  const user = await prisma.user.create({
    data: { discordId: `d-${t}-${randomUUID()}`, username: username ?? `u_${t}`, email: `${t}@test.invalid` }
  })
  await prisma.userPoints.create({ data: { userId: user.id, points } })
  return user
}

export const pointsOf = async (prisma, userId) =>
  (await prisma.userPoints.findUnique({ where: { userId } }))?.points ?? 0

/** A cToon. Unlimited, free and uncapped unless overridden. */
export function mkCtoon(prisma, over = {}) {
  const t = tag()
  return prisma.ctoon.create({
    data: { name: `Toon ${t}`, type: 'Character', rarity: 'Common', assetPath: `/test/${t}.png`, price: 100, quantity: null, ...over }
  })
}

let mintCounter = 0
/** A minted copy owned by `userId`. */
export function mkUserCtoon(prisma, userId, ctoonId, over = {}) {
  return prisma.userCtoon.create({
    data: { userId, ctoonId, mintNumber: over.mintNumber ?? (Date.now() % 1e6) * 1000 + (mintCounter++ % 1000), ...over }
  })
}

export const ownerOf = async (prisma, userCtoonId) =>
  (await prisma.userCtoon.findUnique({ where: { id: userCtoonId }, select: { userId: true } }))?.userId

/** Serves h3 handlers over real HTTP so body parsing, params and thrown createError()s behave as in production. */
export async function startApi(routes) {
  const router = createRouter()
  for (const { method, path, handler } of routes) router[method](path, handler)
  const server = http.createServer(toNodeListener(createApp().use(router)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    /** Resolves { status, body } and never throws on a non-2xx. `userId` becomes the logged-in user. */
    async call(method, path, { userId, body } = {}) {
      const res = await fetch(base + path, {
        method: method.toUpperCase(),
        headers: { ...(userId ? { cookie: `testUser=${userId}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined
      })
      const text = await res.text()
      let parsed; try { parsed = JSON.parse(text) } catch { parsed = text }
      return { status: res.status, body: parsed }
    },
    close: () => new Promise(resolve => server.close(resolve))
  }
}
