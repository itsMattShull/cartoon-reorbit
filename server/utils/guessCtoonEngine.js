// Server-only "Guess that cToon!" engine. Never import this from pages/ or components/.
//
// Game model: the player is shown a cToon image and picks its name from N choices.
// Every correct answer extends a streak; the first wrong answer (or a timeout) ends the
// run, and the streak is the leaderboard score.
//
// Two things drive the whole design:
//
// 1. The image IS the question, and `Ctoon.assetPath` spells the answer out loud —
//    paths look like `/images/cToons/Ed Edd n Eddy/space_outlaw_ed.gif`, so the filename
//    is the name and the directory is the series. Sending an assetPath to the client
//    would make the game a DOM-reading exercise. Questions therefore carry an opaque
//    per-run image token instead, resolved server-side by image/[token].get.js, and the
//    real path/name are only revealed for a question the player has already answered.
//
// 2. A run is a fixed batch of questions generated up front (see MAX_QUESTIONS). There is
//    deliberately no mid-run refill: refilling would mean a GET → build-in-Node → SET
//    read-modify-write around the DB, and the ANSWER_SCRIPT's atomicity guarantee does not
//    survive that window (two in-flight answers could clobber the cursor, rewind to an
//    already-answered question, or resurrect a session that was already banked). Answering
//    the whole batch correctly is a "perfect run" win state instead.
//
// Anti-cheat: ANSWER_SCRIPT is a single atomic Redis Lua script (one round trip, no
// app-level lock needed — Redis's single-threaded execution IS the lock, same reasoning as
// reorbitMemoryEngine's FLIP_SCRIPT). It owns the entire state machine: cursor validation,
// the minimum inter-answer interval, the per-question deadline, streak accounting, and the
// one-way flip to `banked` that guarantees exactly one caller can ever record a run.

const DEFAULTS = {
  playsPerPeriod: 3,
  pointsPerGame: 50,
  secondsPerQuestion: 12,
  choices: 4,
  maxQuestions: 25,
  minStreakForPoints: 3
}

// Below this, two taps came from something that is not a pair of human thumbs. Kept well
// above the ~250ms "ghost click" floor because the player also has to READ four names.
const MIN_ANSWER_INTERVAL_MS = 400

// Slack on top of the per-question countdown, covering the round trip on a bad mobile
// connection. Deliberately modest: every extra millisecond is a free bonus that helps a
// scripted client (never near the deadline) more than a slow human.
const DEADLINE_GRACE_MS = 2000

// A choice longer than this gets ellipsised in the fixed-height answer button, which would
// make two choices visually indistinguishable — a correctness bug, not a cosmetic one.
const MAX_CHOICE_LEN = 44

// Hard floor on how many distinct cToons must be eligible before a run can be built.
const MIN_POOL_SIZE = 40

const CHOICES_MIN = 3
const CHOICES_MAX = 6

// Poses that read as plausible alternates for a "(Running)"-style suffix.
const POSE_VOCAB = [
  'Run', 'Running', 'Jump', 'Jumping', 'Fly', 'Flying', 'Standing', 'Sitting',
  'Waving', 'Dancing', 'Posing', 'Sleeping', 'Walking', 'Falling'
]

// Names ending in a position word are slices of one larger image (Bat Signal
// (Top)/(Middle)/(Bottom)); asking which third of a picture you're looking at is a coin
// flip. Names ending in a bare integer are numbered item sets (Christmas Present 1..4) —
// same problem. Both are barred from being the ANSWER but stay usable as wrong answers.
const POSITIONAL_SUFFIX_RE = /\((?:top|middle|bottom|left|right|upper|lower|center|centre)\)\s*$/i
const TRAILING_ORDINAL_RE = /\s+\d+\s*$/
const POSE_SUFFIX_RE = /\s*\(([^)]+)\)\s*$/

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

// ── Name handling ─────────────────────────────────────────────────────────────

// Collision key. Strips case, accents, curly quotes and every non-alphanumeric, so
// "Dexter's Lab" ≡ "Dexters Lab" ≡ "DEXTERS  LAB". Used to guarantee no two choices in a
// question are the same string wearing different punctuation.
function normalizeName (name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

// Splits "Space Outlaw Eddy" into modifiers ["Space","Outlaw"] + head "Eddy", and peels off
// a trailing "(Pose)". The head is the token the player is actually identifying, so it is
// the only part orthographic mutation is ever allowed to touch.
function parseName (name) {
  const raw = String(name || '').trim()
  let base = raw
  let pose = null

  const poseMatch = base.match(POSE_SUFFIX_RE)
  if (poseMatch) {
    pose = poseMatch[1].trim()
    base = base.slice(0, poseMatch.index).trim()
  }

  const tokens = base.split(/\s+/).filter(Boolean)
  const head = tokens.length ? tokens[tokens.length - 1] : base
  const modifiers = tokens.slice(0, -1)

  return { raw, base, pose, tokens, head, modifiers }
}

function levenshtein (a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = curr; curr = tmp
  }
  return prev[n]
}

// Rejects mutations that produce unpronounceable letter soup ("Skltor", "Chaeiard").
function isPronounceable (word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '')
  if (w.length < 2) return false
  let consonants = 0
  let vowels = 0
  for (const ch of w) {
    if (VOWELS.has(ch)) { vowels++; consonants = 0 } else { consonants++; vowels = 0 }
    if (consonants >= 3 || vowels >= 3) return false
  }
  return true
}

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
// splitmix32, identical construction to reorbitMatchEngine/reorbitMemoryEngine's makePRNG.
// The questions never leave the server, so reproducibility isn't load-bearing here — it
// just keeps RNG usage consistent across the three game engines.

function makePRNG (seedHex) {
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

function shuffle (arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick (arr, rng) {
  if (!arr || !arr.length) return null
  return arr[Math.floor(rng() * arr.length)]
}

// ── Answer-pool eligibility & fame ────────────────────────────────────────────

// A cToon can be the ANSWER only if its picture is a fair question on its own.
function isEligibleAnswer (row) {
  if (!row || !row.name || !row.assetPath) return false
  if (row.guessCtoonExcluded) return false
  if (row.isSecondEdition) return false
  if (POSITIONAL_SUFFIX_RE.test(row.name)) return false
  if (TRAILING_ORDINAL_RE.test(row.name)) return false
  if (row.name.length > MAX_CHOICE_LEN) return false
  return true
}

// How likely a player is to have seen this cToon. Used to keep the opening questions
// recognizable, so a run doesn't die on question 2 to a 1-of-1 nobody owns.
function fameScore (row) {
  const minted = Number(row.totalMinted || 0)
  let score = Math.log10(1 + minted)
  if (row.inCmart) score += 0.5
  if (row.rarity === 'Common' || row.rarity === 'Uncommon') score += 0.5
  return score
}

// Difficulty ramps through the DISTRACTORS, not through answer obscurity. Ramping
// obscurity is what makes a streak game feel like a slot machine; ramping distractor
// quality is what makes it feel like a test of knowledge.
function tierForIndex (index) {
  if (index < 5) return 1
  if (index < 15) return 2
  if (index < 30) return 3
  return 4
}

// Per-tier sourcing quota for the wrong answers. Each slot still falls back down the chain
// (sameSeries → sameSet → cross → mutation) when the catalog can't supply it, but the quota
// stops question #1 from being as brutal as question #40 just because the answer happened
// to come from a well-stocked series.
function quotaForTier (tier, slots) {
  const base = {
    1: ['sameSeries', 'cross', 'cross'],
    2: ['sameSeries', 'sameSeries', 'cross'],
    3: ['sameSeries', 'sameSeries', 'sameSeries'],
    4: ['sameSeries', 'sameSeries', 'sameSet']
  }[tier] || ['sameSeries', 'cross', 'cross']

  const out = base.slice(0, slots)
  while (out.length < slots) out.push('cross')
  return out
}

// ── Distractor generation ─────────────────────────────────────────────────────

// Family A — recombination. Grafts real catalog vocabulary onto the answer's structure, so
// the result reads exactly like a cToon that could plausibly exist. These are the good
// distractors and they are always tried first.
function familyAMutations (answerParsed, ctx, rng) {
  const out = []
  const seriesNames = ctx.namesBySeries.get(answerParsed.seriesKey) || []
  const others = seriesNames.filter(n => normalizeName(n) !== normalizeName(answerParsed.raw))
  const parsedOthers = others.map(parseName)

  // A1 — modifier swap: keep the character, borrow another costume/rank word.
  //      "Watcher Yogi" → "Lazy Yogi"
  const donorMods = parsedOthers.filter(p => p.modifiers.length).map(p => p.modifiers.join(' '))
  if (answerParsed.modifiers.length && donorMods.length) {
    const mod = pick(donorMods, rng)
    if (mod) out.push(withPose(`${mod} ${answerParsed.head}`, answerParsed.pose))
  }

  // A2 — head swap: keep the costume, swap the character.
  //      "Lazy Scooby" → "Lazy Shaggy". Forces actual character identification.
  const donorHeads = parsedOthers.map(p => p.head).filter(h => h && h.toLowerCase() !== answerParsed.head.toLowerCase())
  if (answerParsed.modifiers.length && donorHeads.length) {
    const head = pick(donorHeads, rng)
    if (head) out.push(withPose(`${answerParsed.modifiers.join(' ')} ${head}`, answerParsed.pose))
  }

  // A3 — pose swap, only meaningful when the answer actually has a pose suffix.
  if (answerParsed.pose) {
    const alt = pick(POSE_VOCAB.filter(p => p.toLowerCase() !== answerParsed.pose.toLowerCase()), rng)
    if (alt) out.push(`${answerParsed.base} (${alt})`)
  }

  // A5a — modifier drop: "Cybersuit Dexter" → "Dexter". Clean and believable.
  if (answerParsed.modifiers.length) {
    out.push(withPose(answerParsed.head, answerParsed.pose))
  }

  // A5b — modifier add, for bare names: "Charizard" → "Watcher Charizard".
  if (!answerParsed.modifiers.length && donorMods.length) {
    const mod = pick(donorMods, rng)
    if (mod) out.push(withPose(`${mod} ${answerParsed.head}`, answerParsed.pose))
  }

  return out
}

function withPose (base, pose) {
  return pose ? `${base} (${pose})` : base
}

// Family B — orthographic noise ("Skeletor" → "Skelator"). Weak by nature: on a famous
// character it's a free elimination, on an obscure one it's a coin flip with no signal.
// Emergency fallback only, capped at one per question by the caller, and never applied to a
// short head where a one-letter edit becomes an eye test.
function familyBMutations (answerParsed, rng) {
  const head = answerParsed.head
  if (!head || head.length < 5) return []

  const out = []
  const lower = head.toLowerCase()

  // Vowel substitution.
  const vowelIdxs = []
  for (let i = 1; i < head.length; i++) if (VOWELS.has(lower[i])) vowelIdxs.push(i)
  if (vowelIdxs.length) {
    const i = pick(vowelIdxs, rng)
    const alt = pick(['a', 'e', 'i', 'o', 'u'].filter(v => v !== lower[i]), rng)
    if (alt != null) out.push(head.slice(0, i) + alt + head.slice(i + 1))
  }

  // Adjacent transposition, away from the first letter so the word stays recognizable.
  if (head.length >= 5) {
    const i = 1 + Math.floor(rng() * (head.length - 3))
    if (lower[i] !== lower[i + 1]) {
      out.push(head.slice(0, i) + head[i + 1] + head[i] + head.slice(i + 2))
    }
  }

  // Doubled consonant.
  const consIdxs = []
  for (let i = 1; i < head.length - 1; i++) if (!VOWELS.has(lower[i]) && /[a-z]/.test(lower[i])) consIdxs.push(i)
  if (consIdxs.length) {
    const i = pick(consIdxs, rng)
    out.push(head.slice(0, i + 1) + head[i] + head.slice(i + 1))
  }

  return out
    .filter(isPronounceable)
    .map(h => withPose(
      answerParsed.modifiers.length ? `${answerParsed.modifiers.join(' ')} ${h}` : h,
      answerParsed.pose
    ))
}

// A cross-series name is usually a free elimination because it obviously comes from a
// different show. Matching the answer's shape — token count, presence of a pose suffix,
// rough length — makes it read as a plausible sibling instead.
function shapeMatches (candidateParsed, answerParsed) {
  if (Boolean(candidateParsed.pose) !== Boolean(answerParsed.pose)) return false
  if (Math.abs(candidateParsed.tokens.length - answerParsed.tokens.length) > 1) return false
  const a = candidateParsed.raw.length
  const b = answerParsed.raw.length
  return Math.abs(a - b) <= Math.max(8, Math.round(b * 0.6))
}

/**
 * Builds one question: the answer plus `choiceCount - 1` wrong answers, shuffled.
 *
 * `ctx` is the prepared catalog context from buildCatalogContext(). `index` is the
 * question's position in the run, which selects the difficulty tier.
 *
 * Returns null when no honest question can be built for this answer (the caller skips it).
 */
function buildQuestion (answerRow, ctx, rng, { index = 0, choiceCount = DEFAULTS.choices } = {}) {
  const slots = Math.max(CHOICES_MIN, Math.min(CHOICES_MAX, choiceCount)) - 1
  const answerParsed = parseName(answerRow.name)
  answerParsed.seriesKey = seriesKey(answerRow.series)

  const answerNorm = normalizeName(answerRow.name)
  const answerHeadNorm = normalizeName(answerParsed.head)

  const chosen = []
  const usedNorms = new Set([answerNorm])
  let headSharers = 0
  let familyBUsed = 0

  // Every candidate runs this gauntlet. A candidate that turns out to be a real catalog
  // name is NOT rejected — a real name is the best possible distractor — it just has to be
  // a different cToon than the answer.
  const accept = (candidate) => {
    if (!candidate) return false
    const text = String(candidate).trim()
    if (!text || text.length > MAX_CHOICE_LEN) return false

    const norm = normalizeName(text)
    if (!norm || usedNorms.has(norm)) return false

    // An edit-distance-1 near-miss on a short name is an eye test, not a question.
    if (answerNorm.length <= 8 && levenshtein(norm, answerNorm) <= 1) return false

    // At most one wrong answer may be another variant of the same character, or the
    // question degenerates into costume memorization.
    const sharesHead = normalizeName(parseName(text).head) === answerHeadNorm
    if (sharesHead && headSharers >= 1) return false
    if (sharesHead) headSharers++

    usedNorms.add(norm)
    chosen.push(text)
    return true
  }

  const fromNames = (names, requireShape) => {
    if (!names || !names.length) return false
    const candidates = shuffle(names, rng)
    for (const n of candidates) {
      if (requireShape && !shapeMatches(parseName(n), answerParsed)) continue
      if (accept(n)) return true
    }
    return false
  }

  const sources = {
    sameSeries: () => fromNames(ctx.namesBySeries.get(answerParsed.seriesKey), false),
    sameSet: () => fromNames(ctx.namesBySet.get(setKey(answerRow.set)), false),
    cross: () => fromNames(ctx.allNames, true) || fromNames(ctx.allNames, false)
  }

  const quota = quotaForTier(tierForIndex(index), slots)

  for (const want of quota) {
    if (sources[want] && sources[want]()) continue
    // Degrade toward real names before ever reaching for a generated mutation.
    if (want !== 'sameSet' && sources.sameSet()) continue
    if (want !== 'cross' && sources.cross()) continue
    if (want !== 'sameSeries' && sources.sameSeries()) continue

    // Family A first — recombined real vocabulary still reads like a real cToon.
    let filled = false
    for (const m of shuffle(familyAMutations(answerParsed, ctx, rng), rng)) {
      if (accept(m)) { filled = true; break }
    }
    if (filled) continue

    // Family B last, and at most once per question.
    if (familyBUsed < 1) {
      for (const m of shuffle(familyBMutations(answerParsed, rng), rng)) {
        if (accept(m)) { familyBUsed++; filled = true; break }
      }
    }
    if (!filled) return null
  }

  if (chosen.length !== slots) return null

  const choices = shuffle([answerRow.name, ...chosen], rng)
  const correctIndex = choices.findIndex(c => normalizeName(c) === answerNorm)
  if (correctIndex < 0) return null

  return {
    ctoonId: answerRow.id,
    name: answerRow.name,
    assetPath: answerRow.assetPath,
    choices,
    correctIndex
  }
}

function seriesKey (series) { return normalizeName(series) || '__none__' }
function setKey (set) { return normalizeName(set) || '__none__' }

/**
 * Prepares the lookup structures buildQuestion needs from a flat list of catalog rows.
 *
 * Answer eligibility and distractor eligibility are deliberately different: a cToon barred
 * from being the answer (an image slice, a numbered item, an admin exclusion) is still a
 * perfectly good wrong answer.
 *
 * The answer pool is deduped by assetPath because make-second-edition copies both `name`
 * and `assetPath` verbatim from the original — two rows can be the same picture with the
 * same name, which would produce a question with two identical correct choices.
 */
function buildCatalogContext (rows) {
  const namesBySeries = new Map()
  const namesBySet = new Map()
  const allNames = []
  const seenNames = new Set()

  const answerRows = []
  const seenAssets = new Set()

  for (const row of rows) {
    if (!row || !row.name) continue

    const nameNorm = normalizeName(row.name)
    if (nameNorm && !seenNames.has(nameNorm)) {
      seenNames.add(nameNorm)
      allNames.push(row.name)

      const sk = seriesKey(row.series)
      if (!namesBySeries.has(sk)) namesBySeries.set(sk, [])
      namesBySeries.get(sk).push(row.name)

      const stk = setKey(row.set)
      if (!namesBySet.has(stk)) namesBySet.set(stk, [])
      namesBySet.get(stk).push(row.name)
    }

    if (!isEligibleAnswer(row)) continue
    if (seenAssets.has(row.assetPath)) continue
    seenAssets.add(row.assetPath)
    answerRows.push(row)
  }

  return { namesBySeries, namesBySet, allNames, answerRows }
}

/**
 * Picks the run's answers, fame-weighting the early questions so the opening of a run is
 * recognizable and the ramp lives in the distractors instead.
 */
function selectAnswers (ctx, rng, count) {
  const scored = ctx.answerRows.map(r => ({ row: r, fame: fameScore(r) }))
  const byFame = scored.slice().sort((a, b) => b.fame - a.fame)

  const topQuartile = byFame.slice(0, Math.max(1, Math.ceil(byFame.length * 0.25))).map(s => s.row)
  const topHalf = byFame.slice(0, Math.max(1, Math.ceil(byFame.length * 0.5))).map(s => s.row)
  const all = ctx.answerRows

  const poolForIndex = (i) => {
    const tier = tierForIndex(i)
    if (tier === 1) return topQuartile
    if (tier === 2) return topHalf
    return all
  }

  const used = new Set()
  const out = []
  for (let i = 0; i < count; i++) {
    const pool = poolForIndex(i)
    let choice = null
    // Bounded probing — a run never repeats a cToon, and we'd rather return a short batch
    // than spin when the eligible pool is small.
    for (let attempt = 0; attempt < 40 && !choice; attempt++) {
      const cand = pick(pool, rng)
      if (cand && !used.has(cand.id)) choice = cand
    }
    if (!choice) choice = all.find(r => !used.has(r.id)) || null
    if (!choice) break
    used.add(choice.id)
    out.push(choice)
  }
  return out
}

/**
 * Builds the whole run: up to `count` questions, skipping answers for which no honest
 * question could be assembled.
 */
function buildRun (ctx, seedHex, { count = DEFAULTS.maxQuestions, choiceCount = DEFAULTS.choices } = {}) {
  const rng = makePRNG(seedHex)
  // Over-draw so skipped answers don't shorten the run.
  const answers = selectAnswers(ctx, rng, Math.ceil(count * 1.5))
  const questions = []
  for (const answerRow of answers) {
    if (questions.length >= count) break
    const q = buildQuestion(answerRow, ctx, rng, { index: questions.length, choiceCount })
    if (q) questions.push(q)
  }
  return questions
}

// ── Cadence analysis ──────────────────────────────────────────────────────────

/**
 * Server-measured answer latencies are the one signal a DOM-reading bot can't fake: it has
 * no reason to hesitate, so its intervals are both very fast and very regular. Humans on a
 * 12-second timer scatter across hundreds of milliseconds.
 *
 * This flags rather than rejects. A false positive should cost a player their leaderboard
 * slot, not their run or their points.
 */
function scoreCadence (latencies) {
  const vals = (Array.isArray(latencies) ? latencies : [])
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 0)

  if (vals.length < 5) {
    return { median: vals.length ? median(vals) : null, stdDev: null, suspicious: false }
  }

  const med = median(vals)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
  const stdDev = Math.sqrt(variance)

  // Near-zero spread means a machine metronome; a sub-600ms median is faster than a human
  // can read four names and move a thumb.
  const suspicious = stdDev < 50 || med < 600

  return { median: Math.round(med), stdDev: Math.round(stdDev), suspicious }
}

function median (vals) {
  const s = vals.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ── Atomic answer state machine ───────────────────────────────────────────────
//
// KEYS[1] = session key
// ARGV[1] = questionIndex the client believes it is answering
// ARGV[2] = chosen index, or -1 for a client-reported timeout
// ARGV[3] = minimum inter-answer interval (ms)
// ARGV[4] = deadline grace (ms)
// ARGV[5] = TTL (seconds) to leave on a banked session
//
// All timestamps come from redis.call('TIME') and are only ever compared against other
// TIME-derived values. Nothing the app server or the client stamps is trusted for timing —
// app and Redis are separate hosts, and a few seconds of NTP skew would otherwise either
// gift free time or expire every question instantly.
//
// The questions array is never mutated; a cursor advances instead. Mutating it would risk
// cjson re-encoding an emptied or holed Lua table as a JSON *object*, silently corrupting
// the session.
const ANSWER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({error='no_session'}) end

local s = cjson.decode(raw)
if s.state ~= 'live' then return cjson.encode({error='no_session'}) end

local qi = tonumber(ARGV[1])
local choice = tonumber(ARGV[2])
local minInterval = tonumber(ARGV[3])
local grace = tonumber(ARGV[4])
local bankedTtl = tonumber(ARGV[5])

if qi == nil or choice == nil then return cjson.encode({error='bad_request'}) end

-- A cursor mismatch and a missing session return the SAME error, so a client cannot use
-- the response to probe where a session actually is.
if qi ~= s.i then return cjson.encode({error='no_session'}) end

local t = redis.call('TIME')
local now = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)

if s.lastAnswerAt and s.lastAnswerAt > 0 and (now - s.lastAnswerAt) < minInterval then
  return cjson.encode({error='too_fast'})
end

local q = s.qs[s.i + 1]
if not q then return cjson.encode({error='no_session'}) end

local elapsed = now - s.issuedAt
local timedOut = elapsed > ((s.secs * 1000) + grace)
local correct = (choice == q.k) and (not timedOut)

s.lat[#s.lat + 1] = math.floor(elapsed)
s.lastAnswerAt = now

local total = #s.qs

if correct then
  s.streak = s.streak + 1
  local nextI = s.i + 1

  if nextI >= total then
    -- Perfect run: the whole batch answered correctly. Same terminal path as a wrong
    -- answer, so banking stays single-winner.
    s.state = 'banked'
    redis.call('SET', KEYS[1], cjson.encode(s), 'EX', bankedTtl)
    return cjson.encode({
      correct=true, correctIndex=q.k, correctName=q.n, assetPath=q.a,
      streak=s.streak, gameOver=true, perfect=true,
      latencies=s.lat, startedAt=s.startedAt
    })
  end

  s.i = nextI
  s.issuedAt = now
  local nq = s.qs[nextI + 1]
  local following = s.qs[nextI + 2]
  redis.call('SET', KEYS[1], cjson.encode(s), 'KEEPTTL')

  return cjson.encode({
    correct=true, correctIndex=q.k, correctName=q.n, assetPath=q.a,
    streak=s.streak, gameOver=false,
    nextQuestion={
      questionIndex=nextI,
      imageToken=nq.t,
      choices=nq.c,
      prefetchToken=(following and following.t or nil)
    },
    remainingMs=(s.secs * 1000)
  })
end

-- Wrong answer or timeout: the run is over.
s.state = 'banked'
redis.call('SET', KEYS[1], cjson.encode(s), 'EX', bankedTtl)
return cjson.encode({
  correct=false, correctIndex=q.k, correctName=q.n, assetPath=q.a,
  timedOut=timedOut, streak=s.streak, gameOver=true, perfect=false,
  latencies=s.lat, startedAt=s.startedAt
})
`

// Flips a live session to `banked` and returns its final streak — the "cash out / abandon"
// path. Atomic so that a concurrent /answer game-over and a /end can never both record the
// same run. Unlike GETDEL this leaves the session readable for a short TTL, which makes the
// bank idempotent instead of losing the run if the DB write fails.
//
// KEYS[1] = session key, ARGV[1] = TTL (seconds) for the banked session.
const BANK_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({error='no_session'}) end

local s = cjson.decode(raw)
if s.state ~= 'live' then return cjson.encode({error='already_banked'}) end

s.state = 'banked'
redis.call('SET', KEYS[1], cjson.encode(s), 'EX', tonumber(ARGV[1]))

return cjson.encode({
  streak=s.streak, latencies=s.lat, startedAt=s.startedAt, answered=#s.lat
})
`

export {
  DEFAULTS,
  MIN_ANSWER_INTERVAL_MS,
  DEADLINE_GRACE_MS,
  MAX_CHOICE_LEN,
  MIN_POOL_SIZE,
  CHOICES_MIN,
  CHOICES_MAX,
  ANSWER_SCRIPT,
  BANK_SCRIPT,
  normalizeName,
  parseName,
  isEligibleAnswer,
  fameScore,
  tierForIndex,
  quotaForTier,
  buildCatalogContext,
  buildQuestion,
  buildRun,
  selectAnswers,
  scoreCadence,
  makePRNG,
  shuffle
}
