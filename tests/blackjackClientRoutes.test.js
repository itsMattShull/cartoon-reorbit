import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Guards the one blackjack failure that endpoint tests structurally cannot catch.
//
// Every handler under server/api/game/blackjack is method-specific by filename: status.get.js
// answers GET, the rest answer POST only. The page's helper derived its method from whether a
// body happened to be passed, so the two calls that need no arguments — cash out and practice
// reset — went out as GETs and 404'd. Both endpoints passed their own tests the whole time,
// because `curl -X POST` was always sending the right verb; only the browser sent the wrong
// one. A player left holding chips under the minimum bet could then neither cash out nor
// leave, because leaving with chips routes through the cash-out sheet.
//
// This checks the page's calls against the handlers on disk, which needs no server and no
// browser.

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PAGE = join(root, 'pages/newsite/blackjack.vue')
const API_DIR = join(root, 'server/api/game/blackjack')

const source = readFileSync(PAGE, 'utf8')

/** Route names the page references, e.g. 'cashout'. */
function referencedRoutes () {
  return [...source.matchAll(/'\/api\/game\/blackjack\/([a-z]+)'/g)].map(m => m[1])
}

test('every blackjack route the page calls exists as a handler', () => {
  const routes = [...new Set(referencedRoutes())]
  assert.ok(routes.length >= 5, `expected the page to call several routes, saw ${routes.length}`)

  for (const route of routes) {
    const isGet = existsSync(join(API_DIR, `${route}.get.js`))
    const isPost = existsSync(join(API_DIR, `${route}.post.js`))
    assert.ok(isGet || isPost, `page calls /api/game/blackjack/${route}, which has no handler`)
  }
})

test('the POST helper cannot silently fall back to GET', () => {
  // The bug in one line: `body ? { method: 'POST', body } : {}` — no body meant no method,
  // and $fetch defaults to GET.
  const helper = source.match(/function call \(url, body\) \{[\s\S]*?\n\}/)
  assert.ok(helper, 'expected a call() helper in the page')

  assert.ok(
    /method:\s*'POST'/.test(helper[0]),
    'call() must always set method POST'
  )
  // Rejects the ternary `body ? ... : ...` while allowing the nullish default `body ?? {}`.
  assert.ok(
    !/body\s*\?(?!\?)/.test(helper[0]),
    'call() must not choose its HTTP method based on whether a body was passed'
  )
})

test('the read-only route is fetched with GET and the rest with POST', () => {
  // Anything reached through call() must be a POST handler.
  const viaCall = [...source.matchAll(/\bcall\(\s*'\/api\/game\/blackjack\/([a-z]+)'/g)].map(m => m[1])
  assert.ok(viaCall.length >= 4, `expected several call() routes, saw ${viaCall.join(',') || 'none'}`)

  for (const route of new Set(viaCall)) {
    assert.ok(
      existsSync(join(API_DIR, `${route}.post.js`)),
      `call() is POST-only, but /api/game/blackjack/${route} has no .post.js handler`
    )
  }

  // ...and the GET handler must not be reached through it.
  assert.ok(
    !viaCall.includes('status'),
    'status is a GET route and must not go through the POST helper'
  )
  assert.ok(
    /fetchStatus\s*\(\)/.test(source),
    'expected a dedicated fetchStatus() for the one read-only route'
  )
})

test('no mutating route is reachable without a body-independent method', () => {
  // Belt and braces: no bare $fetch to a game route anywhere in the page, which would bypass
  // the helpers and reintroduce the same ambiguity.
  const bare = [...source.matchAll(/\$fetch\(\s*'\/api\/game\/blackjack\/[a-z]+'/g)]
  assert.equal(
    bare.length, 0,
    'call $fetch through request()/call()/fetchStatus() so the method is always explicit'
  )
})
