// utils/seedTestTrades.js
//
// Dev-only: every seeded test user (discordId "seedtest-…", see utils/seedTestUsers.js) proposes
// a 1-for-1 trade to a random other seeded user: one random tradeable cToon of theirs for one random
// tradeable cToon of the recipient's. Then a random half of the recipients accept; the rest stay
// PENDING.
//
// Offers and accepts go through the REAL POST /api/trade/offers and
// POST /api/trade/offers/:id/accept handlers, served from a local h3 server (same approach as
// tests/helpers/dbKit.js) with every Discord token/webhook env var removed first, so no DMs are sent.
// In-app notifications are still created.
//
// Usage: node utils/seedTestTrades.js

import 'dotenv/config'
import http from 'node:http'
import { register } from 'node:module'

for (const k of Object.keys(process.env)) {
  if (/DISCORD|BOT_TOKEN|WEBHOOK/i.test(k)) delete process.env[k]
}
register('../tests/helpers/aliasLoader.mjs', import.meta.url)

const { createApp, createRouter, toNodeListener, defineEventHandler } = await import('h3')
const { prisma } = await import('../server/prisma.js')
const createOffer = (await import('../server/api/trade/offers.post.js')).default
const acceptOffer = (await import('../server/api/trade/offers/[id]/accept.post.js')).default

const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Handlers authenticate via $fetch('/api/auth/me', { cookie }); here the cookie is `seedUser=<id>`.
globalThis.$fetch = async (url, opts = {}) => {
  if (url !== '/api/auth/me') throw new Error(`unexpected $fetch: ${url}`)
  const id = /seedUser=([^;]+)/.exec(opts.headers?.cookie || '')?.[1]
  const me = id && await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, discordId: true, isAdmin: true } })
  if (!me) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  return me
}

async function startApi () {
  const router = createRouter()
  router.post('/api/trade/offers', createOffer)
  router.post('/api/trade/offers/:id/accept', acceptOffer)
  const app = createApp().use(defineEventHandler((event) => {
    event.context.userId = /seedUser=([^;]+)/.exec(event.node.req.headers.cookie || '')?.[1] || null
  }))
  const server = http.createServer(toNodeListener(app.use(router)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    async post (path, userId, body) {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { cookie: `seedUser=${userId}`, 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {})
      })
      const text = await res.text()
      let parsed; try { parsed = JSON.parse(text) } catch { parsed = text }
      return { status: res.status, body: parsed }
    },
    close: () => new Promise(resolve => server.close(resolve))
  }
}

const errMsg = (r) => r.body?.statusMessage || r.body?.message || JSON.stringify(r.body)

// Copies a user could put in a trade right now: owned, unburned, tradeable (false while in an
// auction), not locked, not already in a pending offer.
const tradeable = (userId) => prisma.userCtoon.findMany({
  where: {
    userId, burnedAt: null, isTradeable: true, lockedByUserId: null,
    tradeOfferCtoons: { none: { tradeOffer: { status: 'PENDING' } } }
  },
  select: { id: true, mintNumber: true, ctoon: { select: { name: true } } }
})

async function main () {
  const users = await prisma.user.findMany({
    where: { discordId: { startsWith: 'seedtest-' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true }
  })
  if (users.length < 2) throw new Error('Need at least 2 seeded test users (run utils/seedTestUsers.js first)')
  const api = await startApi()
  const offers = []

  console.log(`— Proposals (${users.length} users)`)
  for (const u of users) {
    const mine = shuffle(await tradeable(u.id))
    let made = null
    for (const other of shuffle(users.filter(x => x.id !== u.id))) {
      const theirs = shuffle(await tradeable(other.id))
      if (!mine.length || !theirs.length) continue
      const give = mine[0]
      const get = theirs[0]
      const r = await api.post('/api/trade/offers', u.id, {
        recipientUsername: other.username,
        ctoonIdsOffered: [give.id],
        ctoonIdsRequested: [get.id]
      })
      if (r.status === 200) { made = { id: r.body.offer.id, from: u, to: other, give, get }; break }
      console.warn(`    ${u.username} → ${other.username} rejected (${r.status} ${errMsg(r)}), trying another`)
    }
    if (!made) { console.warn(`  ${u.username}: could not propose a trade`); continue }
    offers.push(made)
    console.log(`  ${u.username.padEnd(24)} → ${made.to.username.padEnd(24)} gives ${made.give.ctoon.name} #${made.give.mintNumber}  for  ${made.get.ctoon.name} #${made.get.mintNumber}`)
  }

  const toAccept = new Set(shuffle(offers).slice(0, Math.floor(offers.length / 2)).map(o => o.id))
  console.log(`\n— Accepting ${toAccept.size} of ${offers.length}`)
  let accepted = 0
  for (const o of offers.filter(o => toAccept.has(o.id))) {
    const r = await api.post(`/api/trade/offers/${o.id}/accept`, o.to.id)
    if (r.status === 200) { accepted++; console.log(`  ✔ ${o.to.username.padEnd(24)} accepted from ${o.from.username}`) } else {
      console.warn(`  ✖ ${o.to.username} could not accept from ${o.from.username} (${r.status} ${errMsg(r)})`)
    }
  }

  await api.close()
  const statuses = await prisma.tradeOffer.groupBy({ by: ['status'], where: { id: { in: offers.map(o => o.id) } }, _count: true })
  console.log('\nDone:', { proposed: offers.length, accepted, byStatus: Object.fromEntries(statuses.map(s => [s.status, s._count])) })
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect()
    setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref()
  })
