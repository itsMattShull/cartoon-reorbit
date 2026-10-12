// server/utils/memoClient.js
//
// A read-through memoizing wrapper around a Prisma client, scoped to ONE unit of work (e.g. one
// user's achievements pass). Identical read queries — same model, operation and arguments — are
// executed once and the cached promise is reused. clear() drops the cache; call it after anything
// that may have changed the data being read (e.g. after an achievement award grants points).
//
// Why: evaluating ~100 achievements for one user used to re-run the same `user.findUnique`,
// `userPoints.findUnique`, `userCtoon.count`, ... for every achievement, i.e. hundreds of identical
// queries per user. With this, each distinct query runs once per pass.
//
// Only read operations are memoized. Every other property (writes, $transaction, $queryRaw, ...)
// passes straight through to the underlying client, uncached.
const MEMO_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'])

function stableStringify(value) {
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Date) return { __date: v.getTime() }
    if (typeof v === 'bigint') return { __bigint: v.toString() }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out = {}
      for (const k of Object.keys(v).sort()) out[k] = v[k]
      return out
    }
    return v
  })
}

export function createMemoClient(client) {
  const cache = new Map()
  const stats = { hits: 0, misses: 0 }

  const modelProxies = new Map()
  function wrapModel(name, delegate) {
    return new Proxy(delegate, {
      get(target, op, receiver) {
        const value = Reflect.get(target, op, receiver)
        if (typeof op !== 'string' || typeof value !== 'function') return value
        if (!MEMO_OPS.has(op)) return value.bind(target)
        return (args) => {
          const key = `${name}.${op}:${args === undefined ? '' : stableStringify(args)}`
          if (cache.has(key)) { stats.hits++; return cache.get(key) }
          stats.misses++
          // Awaiting here (rather than caching Prisma's lazy PrismaPromise) makes the query start
          // exactly once; a rejected promise is dropped so a retry re-queries.
          const p = Promise.resolve(value.call(target, args)).catch((err) => { cache.delete(key); throw err })
          cache.set(key, p)
          return p
        }
      },
    })
  }

  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'clear') return () => cache.clear()
      if (prop === 'stats') return stats
      const value = Reflect.get(target, prop, receiver)
      // Model delegates are the lowercase-named objects on the client ($-prefixed members are
      // client methods). Anything else passes through untouched.
      if (typeof prop === 'string' && !prop.startsWith('$') && !prop.startsWith('_') && value && typeof value === 'object') {
        if (!modelProxies.has(prop)) modelProxies.set(prop, wrapModel(prop, value))
        return modelProxies.get(prop)
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return proxy
}
