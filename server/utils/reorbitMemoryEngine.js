// Server-only ReOrbit Memory game engine. Never import this from pages/ or components/.
//
// Game model: classic face-down card matching. Unlike ReOrbit Match / Tower Stack, every
// flip necessarily reveals ground truth to the client, so this game cannot use the
// "replay a client move-log against a server-generated board" pattern. Instead the server
// holds the full board (card → cToon) in a Redis session and reveals exactly the card(s)
// touched by each validated /flip call. `moves` (a pair evaluated, match or not) is
// incremented ONLY inside the atomic flip script below — never accepted from the client.
//
// Anti-cheat: FLIP_SCRIPT below is a single atomic Redis Lua script (one round trip, no
// app-level lock needed) that enforces the whole state machine — bounds checking, at most
// one pending face-up card, no re-flipping an already-matched/pending card, and a minimum
// interval between flips — so a race of parallel requests can't desync the "one pending
// card" invariant or let a client peek at cards without ever completing (and paying for) a
// pair.

// Grid presets are capped at 4 columns so the smallest phones (~360px wide) keep card
// touch-targets above the ~44px accessibility minimum, even at the largest pair count.
const GRID_PRESETS = {
  6: { cols: 3, rows: 4 },
  8: { cols: 4, rows: 4 },
  10: { cols: 4, rows: 5 },
  12: { cols: 4, rows: 6 }
}
const DEFAULT_PAIRS = 8
const MIN_FLIP_INTERVAL_MS = 150 // no human flips two cards faster than this

function gridDimsForPairs(pairs) {
  return GRID_PRESETS[pairs] || GRID_PRESETS[DEFAULT_PAIRS]
}

// splitmix32 seeded PRNG — identical construction to reorbitMatchEngine's makePRNG.
function makePRNG(seedHex) {
  const hi = parseInt(seedHex.slice(0, 8), 16) >>> 0
  const lo = parseInt(seedHex.slice(8, 16), 16) >>> 0
  let s0 = hi >>> 0
  let s1 = lo >>> 0
  return function () {
    s0 = (s0 + 0x9e3779b9) >>> 0
    let z = s0
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    z = (z ^ (z >>> 16)) >>> 0
    s1 = (s1 + 0x6c62272e) >>> 0
    let w = s1
    w = Math.imul(w ^ (w >>> 16), 0x85ebca6b) >>> 0
    w = Math.imul(w ^ (w >>> 13), 0xc2b2ae35) >>> 0
    w = (w ^ (w >>> 16)) >>> 0
    return ((z ^ w) >>> 0) / 4294967296
  }
}

// Fisher–Yates using the seeded PRNG so the shuffle is reproducible from the secret token
// (not that reproducibility matters here — the board never leaves the server — but it keeps
// the RNG usage consistent with the other two games' engines).
function shuffle(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Build the shuffled board: an array of cToon IDs, each appearing exactly twice.
function buildPositions(ctoonIds, seedHex) {
  const rng = makePRNG(seedHex)
  const doubled = [...ctoonIds, ...ctoonIds]
  return shuffle(doubled, rng)
}

// Atomic flip: KEYS[1] = session key. ARGV[1] = card index. ARGV[2] = min flip interval (ms).
// Returns a JSON string (decoded by the caller) describing either an error or the reveal.
const FLIP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({error='no_session'}) end

local session = cjson.decode(raw)
local idx = tonumber(ARGV[1])
local minInterval = tonumber(ARGV[2])
local n = session.pairs * 2

if idx == nil or idx < 0 or idx >= n then
  return cjson.encode({error='bad_index'})
end

local t = redis.call('TIME')
local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)

if session.lastFlipAt and session.lastFlipAt > 0 and (now - session.lastFlipAt) < minInterval then
  return cjson.encode({error='too_fast'})
end

local matched = session.matched
if matched[idx + 1] == 1 then
  return cjson.encode({error='already_matched'})
end

local pendingIdx = session.pendingIndex
if pendingIdx == idx then
  return cjson.encode({error='already_pending'})
end

local positions = session.positions
local assets = session.assetByCtoon
local result

if pendingIdx == -1 then
  session.pendingIndex = idx
  session.lastFlipAt = now
  local ctoonId = positions[idx + 1]
  result = {
    firstFlip = true,
    index = idx,
    ctoonId = ctoonId,
    assetPath = assets[ctoonId],
    moves = session.moves,
    gameOver = false
  }
else
  local firstIdx = pendingIdx
  local ctoonId = positions[idx + 1]
  local firstCtoonId = positions[firstIdx + 1]
  local isMatch = (ctoonId == firstCtoonId)

  session.moves = session.moves + 1
  session.lastFlipAt = now
  session.pendingIndex = -1

  if isMatch then
    matched[idx + 1] = 1
    matched[firstIdx + 1] = 1
    session.matched = matched
  end

  local allMatched = true
  for i = 1, n do
    if matched[i] ~= 1 then allMatched = false break end
  end

  result = {
    firstFlip = false,
    index = idx,
    ctoonId = ctoonId,
    assetPath = assets[ctoonId],
    firstIndex = firstIdx,
    firstCtoonId = firstCtoonId,
    firstAssetPath = assets[firstCtoonId],
    matched = isMatch,
    moves = session.moves,
    gameOver = allMatched
  }
end

redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
return cjson.encode(result)
`

export {
  GRID_PRESETS,
  DEFAULT_PAIRS,
  MIN_FLIP_INTERVAL_MS,
  gridDimsForPairs,
  buildPositions,
  FLIP_SCRIPT
}
