// Guards against the Prisma 7 raw-SQL regression that silently stopped every live DAILY_TASK
// cMoon award (see the ::timestamp(3) comment in server/utils/cmoon.js's
// recordDailyTaskCompletions). With the pg driver adapter, raw-query parameters reach Postgres
// untyped, and an untyped parameter in a UNION arm's SELECT list resolves to text, so an INSERT
// into a timestamp/int column from it throws on every run. Plain comparisons, VALUES and simple
// INSERT ... SELECT still infer the type from context, so only this shape needs an explicit cast.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')

function jsFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...jsFiles(p))
    else if (p.endsWith('.js')) out.push(p)
  }
  return out
}

// Every ${...} directly in a UNION arm's SELECT list (between SELECT and FROM) must carry a ::cast.
// Interpolating a Prisma.sql fragment (e.g. `const BUCKET = Prisma.sql\`date_trunc(...)\``) is
// inlined as SQL text, not sent as a parameter, so those names are skipped.
export function uncastUnionSelectParams(source) {
  const problems = []
  const fragments = new Set([...source.matchAll(/\bconst\s+(\w+)\s*=\s*(?:[^;\n]*\?\s*)?Prisma\.(?:sql|join|raw|empty)\b/g)].map(m => m[1]))
  const raw = /(\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?|Prisma\.sql)\s*`([\s\S]*?)`/g
  for (const m of source.matchAll(raw)) {
    const body = m[2]
    if (!/\bUNION\b/i.test(body)) continue
    for (const arm of body.split(/\bUNION(?:\s+ALL)?\b/i)) {
      for (const sel of arm.matchAll(/\bSELECT\b([\s\S]*?)\bFROM\b/gi)) {
        for (const p of sel[1].matchAll(/\$\{\s*([^}]+?)\s*\}(::\w+)?/g)) {
          if (fragments.has(p[1])) continue
          if (!p[2]) problems.push({ line: source.slice(0, m.index).split('\n').length, param: p[0] })
        }
      }
    }
  }
  return problems
}

test('the scanner flags an uncast UNION select-list param and accepts a cast one', () => {
  const bad = 'prisma.$queryRaw`SELECT "userId", ${d} FROM a UNION ALL SELECT "userId", ${e} FROM b`'
  const good = 'prisma.$queryRaw`SELECT "userId", ${d}::timestamp(3) FROM a UNION ALL SELECT "userId", ${e}::timestamp(3) FROM b`'
  assert.equal(uncastUnionSelectParams(bad).length, 2)
  assert.equal(uncastUnionSelectParams(good).length, 0)
  const fragment = 'const B = Prisma.sql`date_trunc(\'day\', "createdAt")`\nprisma.$queryRaw`SELECT ${B} AS b FROM a UNION SELECT ${B} AS b FROM c`'
  assert.equal(uncastUnionSelectParams(fragment).length, 0)
})

test('no raw query in server/ has an uncast parameter in a UNION select list', () => {
  const found = []
  for (const f of jsFiles(join(root, 'server'))) {
    for (const p of uncastUnionSelectParams(readFileSync(f, 'utf8'))) {
      found.push(`${relative(root, f)}:${p.line} ${p.param}`)
    }
  }
  assert.deepEqual(found, [], `cast these params explicitly (e.g. \${x}::timestamp(3)):\n${found.join('\n')}`)
})

test('recordDailyTaskCompletions casts both completion boundaries in its INSERT', () => {
  const src = readFileSync(join(root, 'server/utils/cmoon.js'), 'utf8')
  assert.match(src, /"userId", \$\{dailyBoundary\}::timestamp\(3\) FROM eveningQualifying/)
  assert.match(src, /"userId", \$\{morningBoundary\}::timestamp\(3\) FROM morningQualifying/)
})
