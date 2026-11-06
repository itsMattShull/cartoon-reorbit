// What a player's tournament page is told, against a REAL Postgres, through the real handlers over HTTP.
//
// The bug these pin down: the stored status only changes when the scheduler runs (a few minutes late), and the page used
// to render the STORED status — so inside the real opt-in window it said "opt-in has not opened yet" and offered no
// button. Players must see (and the endpoints must enforce) what the clock says.
//
//   OWNERSHIP_TEST_DB=postgresql://... REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
//     node --test --test-force-exit tests/ogGtoonTournamentPages.db.test.js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkBarePack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
const API = '/api/game/oggtoons/tournaments'
let prisma, api, me, packA, openNow, windowOver, notYet, flags

const mk = (name, status, startOffsetMs, endOffsetMs, over = {}) => prisma.ogGtoonTournament.create({
  data: {
    name, status, optInStartAt: new Date(Date.now() + startOffsetMs), optInEndAt: new Date(Date.now() + endOffsetMs),
    announcementChannelId: '', ...over
  }
})

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  // Tournaments are off unless an admin switches them on; the config is cached for a minute, so set it before any call.
  flags = await prisma.gameConfig.findUnique({ where: { gameName: 'OgGtoons' }, select: { ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true } })
  await prisma.gameConfig.upsert({
    where: { gameName: 'OgGtoons' },
    create: { gameName: 'OgGtoons', ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true },
    update: { ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true }
  })
  const list = (await import('../server/api/game/oggtoons/tournaments/index.get.js')).default
  const one = (await import('../server/api/game/oggtoons/tournaments/[id].get.js')).default
  const optIn = (await import('../server/api/game/oggtoons/tournaments/[id]/opt-in.post.js')).default
  const optOut = (await import('../server/api/game/oggtoons/tournaments/[id]/opt-out.post.js')).default
  api = await startApi([
    { method: 'get', path: API, handler: list },
    { method: 'get', path: `${API}/:id`, handler: one },
    { method: 'post', path: `${API}/:id/opt-in`, handler: optIn },
    { method: 'post', path: `${API}/:id/opt-out`, handler: optOut }
  ])
  me = await mkUser(prisma)
  packA = await mkBarePack(prisma, { name: 'Participation Pack' })

  const H = 3600 * 1000
  // Stored DRAFT, but the window opened an hour ago and the scheduler has not run yet.
  openNow = await mk('Open now', 'DRAFT', -H, 24 * H, {
    participantPrizeJson: { points: 0, ctoons: [], backgrounds: [], packs: [{ packId: packA.id, quantity: 3 }] }
  })
  // Stored OPT_IN_OPEN, but the window ended a minute ago and the scheduler has not closed it yet.
  windowOver = await mk('Window over', 'OPT_IN_OPEN', -48 * H, -60 * 1000)
  // Stored DRAFT, opens in two hours: genuinely not open.
  notYet = await mk('Not yet', 'DRAFT', 2 * H, 48 * H)
})
after(async () => {
  if (skipUnlessDb) return
  await api?.close()
  await prisma.gameConfig.update({
    where: { gameName: 'OgGtoons' },
    data: { ogGtoonsGameEnabled: flags?.ogGtoonsGameEnabled ?? false, ogGtoonsTournamentsEnabled: flags?.ogGtoonsTournamentsEnabled ?? false }
  }).catch(() => {})
  await prisma.$disconnect()
})

run('inside the real opt-in window a DRAFT tournament is shown as open, and the flip is saved with its announcement', async () => {
  const r = await api.call('get', `${API}/${openNow.id}`, { userId: me.id })
  assert.equal(r.status, 200)
  assert.equal(r.body.status, 'OPT_IN_OPEN', 'the page gets the Opt-in button')
  const row = await prisma.ogGtoonTournament.findUnique({ where: { id: openNow.id } })
  assert.equal(row.status, 'OPT_IN_OPEN', 'the same guarded flip the scheduler makes')
  assert.equal(row.nextAnnouncementAt?.getTime(), openNow.optInStartAt.getTime(), 'so the announcement still goes out from the start time')
})

run('a window that has run out is shown as closed (entry is already refused), but closing stays the scheduler\'s job', async () => {
  const r = await api.call('get', `${API}/${windowOver.id}`, { userId: me.id })
  assert.equal(r.body.status, 'OPT_IN_CLOSED')
  assert.equal((await prisma.ogGtoonTournament.findUnique({ where: { id: windowOver.id } })).status, 'OPT_IN_OPEN', 'no pairings are made by a page view')
  const out = await api.call('post', `${API}/${windowOver.id}/opt-in`, { userId: me.id, body: { deckId: 'x' } })
  assert.equal(out.status, 400)
  assert.match(out.body.statusMessage || out.body.message || '', /Opt-in is closed/)
})

run('a tournament that has not reached its start time stays DRAFT and cannot be entered', async () => {
  const r = await api.call('get', `${API}/${notYet.id}`, { userId: me.id })
  assert.equal(r.body.status, 'DRAFT')
  assert.equal((await prisma.ogGtoonTournament.findUnique({ where: { id: notYet.id } })).status, 'DRAFT', 'not flipped early')
  const out = await api.call('post', `${API}/${notYet.id}/opt-in`, { userId: me.id, body: { deckId: 'x' } })
  assert.equal(out.status, 400)
  assert.match(out.body.statusMessage || out.body.message || '', /Opt-in is closed/)
})

run('the tournament list agrees with the page: open now / closed / coming soon', async () => {
  // The list is cached for 15s in Redis; a quick re-run of this file would otherwise be served the last run's list.
  const { getRedis } = await import('../server/utils/redis.js')
  await getRedis().del('cache:og-tournaments:list').catch(() => {})
  const r = await api.call('get', API, { userId: me.id })
  assert.equal(r.status, 200)
  const by = Object.fromEntries(r.body.map(t => [t.id, t]))
  assert.equal(by[openNow.id].status, 'OPT_IN_OPEN')
  assert.equal(by[windowOver.id].status, 'OPT_IN_CLOSED')
  assert.equal(by[notYet.id].status, 'DRAFT')
  assert.equal(by[openNow.id].hasPrizes, true, 'a pack-only participation prize counts as a prize')
  assert.equal(by[notYet.id].hasPrizes, false)
})

run('entering inside the window gets past the window check (a deck is then required) and leaving works', async () => {
  const fresh = await mk('Open now 2', 'DRAFT', -3600 * 1000, 24 * 3600 * 1000)
  const player = await mkUser(prisma)
  const enter = await api.call('post', `${API}/${fresh.id}/opt-in`, { userId: player.id, body: { deckId: 'no-such-deck' } })
  assert.equal(enter.status, 400)
  assert.doesNotMatch(enter.body.statusMessage || '', /Opt-in is closed/, 'refused for the deck, not because the window looked closed')
  const leave = await api.call('post', `${API}/${fresh.id}/opt-out`, { userId: player.id })
  assert.equal(leave.status, 200)
})

run('the page shows the participation prize and its packs, with name and image resolved', async () => {
  const r = await api.call('get', `${API}/${openNow.id}`, { userId: me.id })
  assert.equal(r.body.prizes.first, null)
  assert.equal(r.body.prizes.top8, null)
  const packs = r.body.prizes.participant.packs
  assert.equal(packs.length, 1)
  assert.equal(packs[0].packId, packA.id)
  assert.equal(packs[0].quantity, 3)
  assert.equal(packs[0].name, 'Participation Pack')
  assert.ok(packs[0].imagePath)
})
