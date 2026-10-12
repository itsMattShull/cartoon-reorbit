import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoClient } from '../server/utils/memoClient.js'

function fakeClient() {
  const calls = []
  const model = (name) => ({
    findUnique: async (args) => { calls.push([name, 'findUnique', args]); return { id: args?.where?.id } },
    count: async (args) => { calls.push([name, 'count', args]); return 3 },
    create: async (args) => { calls.push([name, 'create', args]); return { ok: true } },
  })
  return { calls, user: model('user'), userCtoon: model('userCtoon'), $transaction: async (fn) => fn('tx') }
}

test('identical reads run once, regardless of key order', async () => {
  const c = fakeClient()
  const m = createMemoClient(c)
  await m.user.findUnique({ where: { id: 'a' }, select: { id: true, name: true } })
  await m.user.findUnique({ select: { name: true, id: true }, where: { id: 'a' } })
  assert.equal(c.calls.length, 1)
  assert.equal(m.stats.hits, 1)
})

test('different args and different models are separate entries', async () => {
  const c = fakeClient()
  const m = createMemoClient(c)
  await m.user.findUnique({ where: { id: 'a' } })
  await m.user.findUnique({ where: { id: 'b' } })
  await m.userCtoon.count({ where: { userId: 'a' } })
  await m.userCtoon.count({ where: { userId: 'a' } })
  assert.equal(c.calls.length, 3)
})

test('writes and $-methods pass through uncached; clear() resets reads', async () => {
  const c = fakeClient()
  const m = createMemoClient(c)
  await m.user.create({ data: { x: 1 } })
  await m.user.create({ data: { x: 1 } })
  assert.equal(c.calls.filter(x => x[1] === 'create').length, 2)
  assert.equal(await m.$transaction(async (tx) => tx), 'tx')
  await m.userCtoon.count({ where: { a: 1 } })
  m.clear()
  await m.userCtoon.count({ where: { a: 1 } })
  assert.equal(c.calls.filter(x => x[1] === 'count').length, 2)
})

test('a rejected read is not cached', async () => {
  let n = 0
  const m = createMemoClient({ user: { findUnique: async () => { n++; if (n === 1) throw new Error('boom'); return 'ok' } } })
  await assert.rejects(() => m.user.findUnique({ where: { id: 1 } }))
  assert.equal(await m.user.findUnique({ where: { id: 1 } }), 'ok')
})
