// Pokémon: Fire, Water, Grass! — shared rules, cast and timing.
//
// Imported by BOTH the browser (pages/newsite/pokemonbattle.vue, for the AI mode and for
// rendering a resolved round) and the server (server/utils/pokemonBattleRuntime.js, the sole
// authority for anything played for points). It lives in lib/ for the same reason lib/edRps.js
// does: one copy, so the two sides cannot drift.
//
// There are no secrets in here. A three-way simultaneous-choice game has no hidden information
// beyond the opponent's current-round pick, and that lives in the server's match state, never
// in this file. Everything here is public rules.
//
// NOTE ON TEXT: every string in this file that can reach the screen is ASCII. The early-2000s
// Cartoon Network look is set in the self-hosted Futura Bold Condensed at
// /newwinball/fonts/84_Futura BdCn BT.ttf, whose cmap covers 336 codepoints and contains
// neither U+2026 (…) nor U+2019 (’) nor U+00E9 (é). A missing glyph is drawn by a per-glyph
// fallback mid-word, at the wrong weight and width. The accent in "Pokemon" lives in the
// uploaded logo art, not in Futura-set copy. tests/pokemonBattleWiring.test.js enforces this.

// Types are indices, not strings, everywhere they cross the wire — same reasoning as
// lib/edRps.js: BEATS below is a flat lookup, and a name-shaped payload has an observable
// length during the pre-reveal window.
export const TYPES = ['fire', 'water', 'grass']
export const FIRE = 0
export const WATER = 1
export const GRASS = 2

export const isType = (t) => Number.isInteger(t) && t >= 0 && t < TYPES.length

// BEATS[a] is the type that `a` defeats. Water beats Fire, Fire beats Grass, Grass beats Water.
const BEATS = [GRASS, FIRE, WATER]

/**
 * Scores one round. Returns 0 for a tie, 1 if `a` wins, -1 if `b` wins.
 * A tie replays the round — it does not count toward either player.
 */
export function compareTypes(a, b) {
  if (a === b) return 0
  return BEATS[a] === b ? 1 : -1
}

/** The type that beats `t`. */
export const counterOf = (t) => TYPES.findIndex((_, i) => compareTypes(i, t) > 0)

/* ── Reveal timing ───────────────────────────────────────────────────────────────────────
 * The RPS game pauses a flat 2600ms between rounds, which is enough to read a one-line banner
 * and not enough to read three lines of battle text. Timed at 35 chars/sec (the classic "fast"
 * text speed) plus a dwell after each line, a decisive round needs ~4.1s and a tie ~3.2s.
 *
 * So the pause is variable, and the SERVER owns it: it ships an absolute `nextRoundAt` in the
 * reveal payload exactly as it already ships `deadlineAt`. The client then fits its text to the
 * real window instead of guessing at it. If these two ever drift, the next round's timer starts
 * while the loser is still reading — which costs them rounds, not just polish. */
export const TEXT_CHARS_PER_SEC = 35
export const TEXT_LINE_DWELL_MS = 450
export const TEXT_VERDICT_DWELL_MS = 600
// Extra beat after the final round so the faint animation and "<mon> fainted!" are readable
// before the match-over panel covers them.
export const FAINT_MS = 1500

// A tie still shows BOTH attack lines before its verdict, so it is only marginally cheaper
// than a decisive round — an earlier 3200 here overflowed its own text budget by ~590ms, which
// is exactly the drift this pair of constants exists to prevent. The wiring test recomputes
// both budgets from the real move names and fails if either stops fitting.
export const TIE_BREAK_MS = 3900
export const DECISIVE_BREAK_MS = 4200

/** Intermission for a round with this result. `cmp` is the output of compareTypes. */
export const intermissionMs = (cmp) => (cmp === 0 ? TIE_BREAK_MS : DECISIVE_BREAK_MS)

// The longest intermission any round can take — what the sweeper and the client's match-end
// hold budget against.
export const MAX_BREAK_MS = DECISIVE_BREAK_MS

/** How long the typewriter needs for one line, at the configured speed. */
export const lineBudgetMs = (text, dwell = TEXT_LINE_DWELL_MS) =>
  Math.ceil((String(text).length / TEXT_CHARS_PER_SEC) * 1000) + dwell

// The cast. `id` is the wire value and must round-trip through the DB, so it is a stable
// lowercase token; everything else is presentation.
//
// Art is deliberately NOT bundled here. Every sprite, the logo and the backdrop are uploaded
// through the admin panel so they can be swapped without a deploy. Intrinsic dimensions are
// likewise absent on purpose: hardcoding them while the art is admin-supplied guarantees a
// mismatch, and every mismatch is a layout-shift event. The config endpoint reports each
// asset's real dimensions from sharp metadata instead.
export const POKEMON = [
  {
    id: 'charizard',
    name: 'Charizard',
    type: FIRE,
    moves: ['Flamethrower', 'Fire Blast', 'Flare Blitz'],
    lines: {
      win: ['Charizard roars in triumph!', 'The flames burn hotter!'],
      lose: ['Charizard is scorched and reeling!', "Charizard's flame flickers!"],
      tie: ['Both attacks cancel out!', 'Neither side gives ground!']
    }
  },
  {
    id: 'blastoise',
    name: 'Blastoise',
    type: WATER,
    moves: ['Hydro Pump', 'Surf', 'Water Gun'],
    lines: {
      win: ['Blastoise holds the field!', 'The cannons find their mark!'],
      lose: ['Blastoise is driven back!', 'Blastoise withdraws into its shell!'],
      tie: ['Both attacks cancel out!', 'The torrents crash together!']
    }
  },
  {
    id: 'venusaur',
    name: 'Venusaur',
    type: GRASS,
    moves: ['Solar Beam', 'Razor Leaf', 'Vine Whip'],
    lines: {
      win: ['Venusaur stands firm!', 'The flower blooms in victory!'],
      lose: ['Venusaur is wilting!', "Venusaur's vines go limp!"],
      tie: ['Both attacks cancel out!', 'The field is churned to nothing!']
    }
  }
]

// Indexed by type, so POKEMON_BY_TYPE[FIRE] is Charizard. The index IS the wire value, so this
// mapping is asserted in tests rather than trusted.
export const POKEMON_BY_TYPE = TYPES.map((_, i) => POKEMON.find(p => p.type === i))
export const pokemonForType = (t) => POKEMON_BY_TYPE[t] || POKEMON_BY_TYPE[0]

/**
 * Battle text for a resolved round, from the perspective of the side that threw `myType`.
 *
 * Deliberately carries NO username. The text box is a fixed-height grid track — it has to be,
 * or it reflows the move buttons under the player's thumb the instant a round resolves — and a
 * fixed box needs a bounded string. The Pokemon names and move names are both closed sets, so
 * the longest possible line here is computable and is asserted in the wiring test. Splicing in
 * a username makes it unbounded.
 */
export function battleText(myType, theirType, moveIndex = 0) {
  const mine = pokemonForType(myType)
  const move = mine.moves[moveIndex % mine.moves.length]
  const cmp = compareTypes(myType, theirType)
  const verdict = cmp === 0
    ? 'Both moves collided!'
    : (cmp > 0 ? "It's super effective!" : "It's not very effective...")
  return { attack: `${mine.name} used ${move}!`, verdict, cmp }
}

/* ── HP ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Remaining HP as a fraction, 0..1. The bar is ONE continuous fill scaled by this, never
 * `winsNeeded` discrete segments: at the top of the range a segment is ~7px wide on a 360px
 * phone with a 1px divider eating 14% of it, and at winsNeeded=1 a "segment" is the whole bar.
 */
export function hpFraction(losses, winsNeeded) {
  const total = Math.max(1, Number(winsNeeded) || 1)
  const taken = Math.min(total, Math.max(0, Number(losses) || 0))
  return (total - taken) / total
}

// Classic green -> yellow -> red, keyed off the FRACTION so the thresholds mean the same thing
// at every winsNeeded. Colour is never the only channel: the bar carries a "3/4" numeral and a
// hatch pattern too, because green/red is the deuteranopia confusion pair and this bar is the
// primary score readout.
export function hpState(fraction) {
  if (fraction > 0.5) return 'ok'
  if (fraction > 0.2) return 'low'
  return 'critical'
}

/* ── Palette ─────────────────────────────────────────────────────────────────────────────
 * Exported as data so tests/pokemonBattleWiring.test.js can compute real contrast ratios over
 * it. The repo's two existing contrast tests scan Tailwind class literals, which cannot see
 * this page at all — it is scoped CSS. Without a computed check nothing catches a bad HP
 * palette. Pairs are [foreground, background]. */
// The HP fills are the authentic GBA colours; the track is a dark recess rather than the
// mid-grey a first pass used, which could not carry any of the three states at 3:1. As a
// bonus the three fills land at luminance 0.27 / 0.52 / 0.65 — far enough apart to be told
// apart by lightness alone, which is what makes them survive deuteranopia at all.
export const PALETTE = {
  boxBg: '#f8f8f8',
  boxText: '#383838',
  boxBorder: '#383838',
  hpOk: '#58d858',
  hpLow: '#f8d030',
  hpCritical: '#f85838',
  hpTrack: '#282828'
}

// Minimum lightness gap between adjacent HP states, so the bar stays readable with hue
// stripped out entirely. Asserted in the wiring test alongside the contrast ratios.
export const HP_LUMINANCE_GAP = 0.1

// Every pair here must clear WCAG AA. Text pairs need 4.5:1; the HP fills are non-text
// indicators against the bar track and need 3:1.
export const CONTRAST_PAIRS = [
  { name: 'box text on box', fg: PALETTE.boxText, bg: PALETTE.boxBg, min: 4.5 },
  { name: 'hp ok on track', fg: PALETTE.hpOk, bg: PALETTE.hpTrack, min: 3 },
  { name: 'hp low on track', fg: PALETTE.hpLow, bg: PALETTE.hpTrack, min: 3 },
  { name: 'hp critical on track', fg: PALETTE.hpCritical, bg: PALETTE.hpTrack, min: 3 }
]

/* ── AI ──────────────────────────────────────────────────────────────────────────────────
 * Runs entirely in the browser and can never pay points, so there is nothing here to cheat at.
 * The only design goal is that it feel like an opponent rather than a coin flip — and, just as
 * importantly, that it not feel like a cheat.
 *
 * Two structural rules, both of which exist because the obvious implementation violates them:
 *
 *   1. The AI commits its move when the round is ARMED, from history that excludes the current
 *      round. The RPS game's cpuResolve(myHand) takes the player's hand as an argument and then
 *      draws its own — harmless for a uniform random pick, literal cheating for a predictive
 *      one. chooseAiMove() cannot see the current pick because it is never passed it.
 *   2. A streak cap. Three straight losses in a blind simultaneous game reads as cheating
 *      whether or not it is, so after `streakCap` consecutive AI wins the next pick is forced
 *      uniform.
 *
 * The model is an order-1/order-2 frequency count blended with a win-stay/lose-shift detector
 * (the strongest single signal in human RPS play), mixed with pure randomness at `epsilon`. A
 * perfect counter-picker is not "hard", it is unbeatable, because the player has no information
 * to act on. */
export const AI_TIERS = [
  { id: 'rookie', label: 'Rookie', epsilon: 1.00, order: 0, minSamples: 0, streakCap: Infinity },
  { id: 'ace', label: 'Ace Trainer', epsilon: 0.45, order: 1, minSamples: 3, streakCap: 2 },
  { id: 'champion', label: 'Champion', epsilon: 0.20, order: 2, minSamples: 2, streakCap: 3 }
]

export const AI_TIER_IDS = AI_TIERS.map(t => t.id)
export const aiTierById = (id) => AI_TIERS.find(t => t.id === id) || AI_TIERS[0]

const DECAY = 0.85

/**
 * Picks the AI's move for the coming round.
 *
 * `history` is the PLAYER's past picks, oldest first, ties included — a match replays ties
 * without scoring them, so filtering them out would train the model on a sequence the player
 * never actually threw. `winStreak` is the AI's current consecutive-win count. `rand` is
 * injected so tests are deterministic and the browser can pass a CSPRNG-backed source.
 *
 * Never takes the current round's player pick. There is no parameter for it by design.
 */
export function chooseAiMove(history = [], tierId = 'rookie', winStreak = 0, rand = Math.random) {
  const tier = aiTierById(tierId)
  const picks = history.filter(isType)

  const uniform = () => Math.min(TYPES.length - 1, Math.floor(rand() * TYPES.length))

  if (picks.length < tier.minSamples) return uniform()
  if (winStreak >= tier.streakCap) return uniform()
  if (rand() < tier.epsilon) return uniform()

  // Exponentially-decayed frequency over the player's picks, most recent weighted heaviest.
  const scores = [0, 0, 0]
  for (let i = 0; i < picks.length; i++) {
    scores[picks[i]] += Math.pow(DECAY, picks.length - 1 - i)
  }

  // Order-2: if the player's last pick has followed a recognisable pair before, weight what
  // followed it. Cheap to compute and it is what catches a player cycling F,W,G,F,W,G.
  if (tier.order >= 2 && picks.length >= 3) {
    const a = picks[picks.length - 2]
    const b = picks[picks.length - 1]
    for (let i = 2; i < picks.length; i++) {
      if (picks[i - 2] === a && picks[i - 1] === b) scores[picks[i]] += 1.5
    }
  }

  // Win-stay / lose-shift. After losing a round humans overwhelmingly change their throw, and
  // after winning they repeat it. `history` alone cannot say who won, so this reads the shape
  // of the sequence: a repeat of the last pick is the "stay" hypothesis.
  if (picks.length >= 2) {
    const last = picks[picks.length - 1]
    const prev = picks[picks.length - 2]
    if (last === prev) scores[last] += 1.0
    else for (let i = 0; i < TYPES.length; i++) if (i !== last) scores[i] += 0.35
  }

  let predicted = 0
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[predicted]) predicted = i
  return counterOf(predicted)
}

/* ── Config ──────────────────────────────────────────────────────────────────────────────
 * Mirrored by GameConfig's pokemonBattle* columns. The server clamps to these ranges on every
 * read, so a bad admin value can never break a live match.
 *
 * roundSeconds defaults to 12 rather than the RPS game's 15 because the intermission here is
 * up to 4.2s instead of 2.6s. At 15s a best-of-5 would run ~40s longer than an RPS match for
 * no added play. */
export const CONFIG_LIMITS = {
  roundSeconds: { min: 5, max: 60, default: 12 },
  winsNeeded: { min: 1, max: 6, default: 3 },
  maxRounds: { min: 1, max: 21, default: 9 },
  pairDailyAwardLimit: { min: 0, max: 50, default: 2 }
}

export function clampConfig(raw = {}) {
  const pick = (key, value) => {
    const { min, max, default: dflt } = CONFIG_LIMITS[key]
    const n = Math.floor(Number(value))
    if (!Number.isFinite(n)) return dflt
    return Math.min(max, Math.max(min, n))
  }
  const winsNeeded = pick('winsNeeded', raw.winsNeeded)
  // A first-to-N match needs at least 2N-1 rounds for both sides to be able to reach N wins.
  // An admin value that violates this would hang a match at match point until the sweeper
  // killed it.
  const maxRounds = Math.max(pick('maxRounds', raw.maxRounds), winsNeeded * 2 - 1)
  return {
    roundSeconds: pick('roundSeconds', raw.roundSeconds),
    winsNeeded,
    maxRounds,
    pairDailyAwardLimit: pick('pairDailyAwardLimit', raw.pairDailyAwardLimit)
  }
}
