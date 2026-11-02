import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// An Auction sells a cToon OR a sealed pack; a pack auction has NO userCtoon (see server/utils/auctionItem.js). A read
// like `auction.userCtoon.ctoonId` throws on the first pack in a list. This guard fails when a new unguarded read of
// an AUCTION's userCtoon appears in server/. Reads on other models (tradeOffer.ctoons[].userCtoon, userCtoon rows, …)
// are not auctions and are ignored; the files below were checked by hand and read the cToon side only after
// establishing the auction is kind CTOON.
const ROOT = new URL('../server', import.meta.url).pathname

const ALLOW = new Set([
  'socket-server.js',                // non-pack branch, after `isPack ?` split
  'api/auction/[id].get.js',          // pack branch returns before the cToon reads
  'api/auctions/trending.get.js',     // query filters kind: 'CTOON'
  'utils/dissolveMisfireAudit.js'     // audits cToon auctions only
])

function walk (dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.js')) out.push(p)
  }
  return out
}

test('no unguarded auction.userCtoon.<field> reads outside the reviewed allowlist', () => {
  const offenders = []
  for (const file of walk(ROOT)) {
    const rel = file.slice(ROOT.length + 1)
    if (ALLOW.has(rel)) continue
    const src = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '')
    // `auc.userCtoon.x`, `auction.userCtoon.x`, `a.userCtoon.x` (no `?.`) on an auction-shaped variable.
    const re = /\b(auction|auc|a)\.userCtoon\.[A-Za-z]/g
    let m
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length
      const text = src.split('\n')[line - 1]
      if (/\?\s*.*:|\?\?|\?\./.test(text) && /a(uction|uc)?\.userCtoon\s*\?/.test(text)) continue // ternary-guarded
      offenders.push(`${rel}:${line}  ${text.trim()}`)
    }
  }
  assert.deepEqual(offenders, [], 'unguarded read of an auction\'s userCtoon:\n' + offenders.join('\n'))
})
