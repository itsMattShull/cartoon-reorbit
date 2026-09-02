import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// server/utils/cmoon.js eagerly constructs BullMQ Queue instances on import (see
// tests/cmoonEffectTypes.test.js's comment), so this reads it as text instead of importing it.
//
// Requirement under test: moving an EXISTING member to a different cMoon — admin single-user
// reassignment, an accepted CMoonChangeRequest, captain auto-align (all via reassignUserCMoon),
// and bulk admin "Balance Teams" (executeBalancePlan) — must never grant a fresh cMoon join
// prize. Only a genuine first-time self-select (selectCMoonForUser) may. This is already true
// today (grantCMoonPrizes has exactly one call site); these checks exist to keep it true.
//
// Function bodies are isolated as "from this top-level function's declaration line up to the
// next top-level function declaration (or EOF)" rather than by brace-counting — this file's
// nested `prisma.$transaction(async (tx) => {...})` blocks and template literals make naive
// brace matching unreliable, while every top-level function here is declared flush-left, so a
// line-based scan is both simpler and more robust.
const __dirname = dirname(fileURLToPath(import.meta.url))
const cmoonPath = join(__dirname, '../server/utils/cmoon.js')
const cmoonSrc = readFileSync(cmoonPath, 'utf8')
const lines = cmoonSrc.split('\n')

const FN_DECL = /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)/

function topLevelFunctions() {
  const fns = []
  lines.forEach((line, i) => {
    const m = line.match(FN_DECL)
    if (m) fns.push({ name: m[3], startLine: i })
  })
  return fns
}

const FUNCTIONS = topLevelFunctions()

function bodyOf(name) {
  const idx = FUNCTIONS.findIndex(f => f.name === name)
  assert.ok(idx !== -1, `function ${name} not found in server/utils/cmoon.js — has it been renamed?`)
  const start = FUNCTIONS[idx].startLine
  const end = idx + 1 < FUNCTIONS.length ? FUNCTIONS[idx + 1].startLine : lines.length
  return lines.slice(start, end).join('\n')
}

function enclosingFunctionName(lineIndex) {
  let owner = null
  for (const fn of FUNCTIONS) {
    if (fn.startLine <= lineIndex) owner = fn
    else break
  }
  return owner?.name || null
}

test('reassignUserCMoon never grants a cMoon join prize', () => {
  const body = bodyOf('reassignUserCMoon')
  assert.ok(
    !body.includes('grantCMoonPrizes'),
    'reassignUserCMoon (admin single-user moves, accepted change requests, captain auto-align) must never call grantCMoonPrizes',
  )
  assert.ok(!body.includes('mintQueue'), 'reassignUserCMoon must never touch mintQueue directly')
})

test('executeBalancePlan never grants a cMoon join prize', () => {
  const body = bodyOf('executeBalancePlan')
  assert.ok(
    !body.includes('grantCMoonPrizes'),
    'executeBalancePlan (admin "Balance Teams") must never call grantCMoonPrizes — a balanced player keeps their old prizes, they never receive new ones',
  )
  assert.ok(!body.includes('mintQueue'), 'executeBalancePlan must never touch mintQueue directly')
})

test('grantCMoonPrizes is only ever called from selectCMoonForUser', () => {
  const callRegex = /\bgrantCMoonPrizes\s*\(/g
  let match
  let sawCall = false
  while ((match = callRegex.exec(cmoonSrc))) {
    const lineIndex = cmoonSrc.slice(0, match.index).split('\n').length - 1
    if (lines[lineIndex].match(FN_DECL)?.[3] === 'grantCMoonPrizes') continue // its own declaration line
    sawCall = true
    const owner = enclosingFunctionName(lineIndex)
    assert.equal(
      owner,
      'selectCMoonForUser',
      `grantCMoonPrizes is called from ${owner || 'top level'} at cmoon.js:${lineIndex + 1} — only ` +
      'selectCMoonForUser (the real self-serve first-time join) may grant a cMoon prize. If this is ' +
      'a deliberate new caller, update this test’s allow-list deliberately rather than deleting the check.',
    )
  }
  assert.ok(sawCall, 'expected at least one call site of grantCMoonPrizes (inside selectCMoonForUser) — has it been renamed or removed?')
})

test('cMoon admin mutation routes never reference mintQueue/grantCMoonPrizes directly', () => {
  for (const file of ['../server/api/admin/cmoons/balance-teams.post.js', '../server/api/admin/cmoons/[id].put.js']) {
    const src = readFileSync(join(__dirname, file), 'utf8')
    assert.ok(!src.includes('mintQueue'), `${file} must not reference mintQueue directly — prize-granting is selectCMoonForUser's job alone`)
    assert.ok(!src.includes('grantCMoonPrizes'), `${file} must not call grantCMoonPrizes directly`)
  }
})
