// Pokémon: Fire, Water, Grass! — shared rules and cast.
//
// Imported by BOTH the browser (pages/newsite/pokemonfwg.vue, for the AI mode and for rendering
// a resolved round) and the server (server/utils/pokemonFwgRuntime.js, the sole authority for
// anything played for points). It lives in lib/ for the same reason lib/edRps.js does: one
// copy, so the two sides cannot drift.
//
// There are no secrets in here. A three-way simultaneous-choice game has no hidden information
// beyond the opponent's current-round pick, and that lives in the server's match state, never
// in this file. Everything here is public rules.

// Types are indices, not strings, everywhere they cross the wire — same reasoning as
// lib/edRps.js: BEATS below is a flat lookup, and 'fire'/'water'/'grass' are 4/5/5 bytes, so a
// name-shaped payload size is an observable side channel during the pre-reveal window. Only
// 'water' and 'grass' collide at 5, which would leave 'fire' distinguishable on its own.
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

// How long a resolved round stays on screen before the next is armed. The server owns this;
// the client mirrors it so the final round's result is readable before the match-over panel
// covers it. Longer than the RPS game's 2600ms because this game shows a full battle-text line
// ("Charizard used Flamethrower! It's super effective!") that has to be read, not glimpsed.
export const ROUND_BREAK_MS = 3400

// The cast. `id` is the wire value and must round-trip through the DB, so it is a stable
// lowercase token; everything else is presentation.
//
// Art is deliberately NOT bundled here. Every sprite, the logo and the backdrop are uploaded
// through the admin panel (GameConfig columns) so they can be swapped without a deploy, which
// is what the site owner asked for. Until an upload lands, the client draws a typed silhouette
// placeholder rather than a broken image — see resolveArt() below.
export const POKEMON = [
  {
    id: 'charizard',
    name: 'Charizard',
    type: FIRE,
    accent: '#f0803c',
    // Shown in the battle text box. One is picked per round so a long match does not read like
    // a stuck record.
    moves: ['Flamethrower', 'Fire Blast', 'Flare Blitz'],
    lines: {
      win: ['Charizard roars in triumph!', 'The flames burn hotter!'],
      lose: ['Charizard is scorched and reeling!', "Charizard's flame flickers..."],
      tie: ['Both attacks cancel out!', 'Neither side gives ground!']
    }
  },
  {
    id: 'blastoise',
    name: 'Blastoise',
    type: WATER,
    accent: '#4d90d5',
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
    accent: '#5aa858',
    moves: ['Solar Beam', 'Razor Leaf', 'Vine Whip'],
    lines: {
      win: ['Venusaur stands firm!', 'The flower blooms in victory!'],
      lose: ['Venusaur is wilting!', "Venusaur's vines go limp!"],
      tie: ['Both attacks cancel out!', 'The field is churned to nothing!']
    }
  }
]

// Indexed by type, so POKEMON_BY_TYPE[FIRE] is Charizard. The index IS the wire value, so this
// mapping is asserted in tests/pokemonFwgWiring.test.js rather than trusted.
export const POKEMON_BY_TYPE = TYPES.map((_, i) => POKEMON.find(p => p.type === i))

export const pokemonForType = (t) => POKEMON_BY_TYPE[t] || POKEMON_BY_TYPE[0]

/**
 * Battle text for a resolved round, from the perspective of the side that threw `myType`.
 * Returns the attack line plus the effectiveness verdict, which is the whole reason this game
 * reads as Pokémon rather than as rock-paper-scissors with new art.
 */
export function battleText(myType, theirType, moveIndex = 0) {
  const mine = pokemonForType(myType)
  const move = mine.moves[moveIndex % mine.moves.length]
  const cmp = compareTypes(myType, theirType)
  const verdict = cmp === 0
    ? "But it had no effect on the tie!"
    : (cmp > 0 ? "It's super effective!" : "It's not very effective...")
  return { attack: `${mine.name} used ${move}!`, verdict, cmp }
}

/* ── AI ──────────────────────────────────────────────────────────────────────────────────
 * The AI runs entirely in the browser and can never pay points, so there is nothing here to
 * cheat *at* — the only design goal is that it feel like an opponent rather than a coin flip.
 *
 * Each tier mixes a frequency-counter against the player's recent picks with a share of pure
 * randomness. `counterRate` is the probability the AI plays the type that beats whatever the
 * player has thrown most often; otherwise it picks uniformly at random. Capped well below 1 on
 * purpose: a perfect counter-picker is not "hard", it is unbeatable, because the player has no
 * information to work with on a simultaneous throw. */
export const AI_TIERS = [
  { id: 'easy',   label: 'Rookie',      counterRate: 0.00, memory: 0 },
  { id: 'normal', label: 'Gym Leader',  counterRate: 0.35, memory: 5 },
  { id: 'hard',   label: 'Elite Four',  counterRate: 0.55, memory: 8 }
]

export const AI_TIER_IDS = AI_TIERS.map(t => t.id)
export const aiTierById = (id) => AI_TIERS.find(t => t.id === id) || AI_TIERS[1]

/**
 * Picks the AI's type for one round.
 *
 * `history` is the player's own past picks, most recent last. `rand` is injected so tests are
 * deterministic and so the caller can supply a CSPRNG-backed source in the browser.
 */
export function aiPick(history, tierId, rand = Math.random) {
  const tier = aiTierById(tierId)
  const recent = tier.memory > 0 ? history.slice(-tier.memory) : []

  if (recent.length && rand() < tier.counterRate) {
    const counts = [0, 0, 0]
    for (const t of recent) if (isType(t)) counts[t]++
    let best = 0
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i
    // Only counter a real preference. With a flat spread there is nothing to read, and
    // countering anyway just makes the AI predictable in the other direction.
    if (counts[best] > recent.length / TYPES.length) {
      // The type that beats `best` is the one `best` does not beat and is not equal to.
      return TYPES.findIndex((_, i) => compareTypes(i, best) > 0)
    }
  }
  return Math.floor(rand() * TYPES.length) % TYPES.length
}

/* ── Config ──────────────────────────────────────────────────────────────────────────────
 * Mirrored by GameConfig's pokemonFwg* columns. The server clamps to these ranges on every
 * read, so a bad admin value can never break a live match. */
export const CONFIG_LIMITS = {
  roundSeconds: { min: 5, max: 60, default: 20 },
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

/**
 * Remaining HP as a fraction, 0..1. The bar is drawn as ONE continuous fill scaled by this,
 * never as `winsNeeded` discrete segments: at the top of the range a segment would be ~7px
 * wide on a 360px phone with a 1px divider eating 14% of it, and at winsNeeded=1 a "segment"
 * is the entire bar. A fraction degrades gracefully across the whole 1..6 range.
 */
export function hpFraction(losses, winsNeeded) {
  const total = Math.max(1, Number(winsNeeded) || 1)
  const taken = Math.min(total, Math.max(0, Number(losses) || 0))
  return (total - taken) / total
}

// Classic green -> yellow -> red, keyed off the FRACTION rather than a segment count, so the
// thresholds mean the same thing at every winsNeeded. Colour is never the only channel: the
// bar also carries a text HP readout, because a 4px band of colour fails outdoors and for
// deuteranopes alike.
export function hpState(fraction) {
  if (fraction > 0.5) return 'ok'
  if (fraction > 0.2) return 'low'
  return 'critical'
}
