// utils/battleEngine.js — v2 (Select → Reveal → Setup)
// -----------------------------------------------------------------------------
//  Public API (returned object):
//    state            – full mutable state (keep private on client!)
//    publicState()    – redacts opponent hand / deck, exposes timer + phase
//    select(side, selections)  – array of { cardId, laneIndex }
//    confirm(side)    – marks that side ready; when both ready → runReveal()
//    tick(now)        – call periodically; returns {timeout:true} when expired
//
//  Turn phases
//    'select' : players compose selections (30‑s timer)
//    'reveal' : engine reveals selections in priority order
//    'setup'  : draws cards, flips next location, toggles priority
//    'gameEnd': final scoring ready
// -----------------------------------------------------------------------------
import { abilityRegistry } from './abilities.js'

const MAX_ENERGY    = 6
const ENERGY_PER_TURN = 1

export function createBattle ({ playerDeck, aiDeck, lanes, battleId }) {
  /* ───────────── config ───────────── */
  const MAX_TURNS     = 6
  const SELECT_WINDOW = 30_000  // 30 seconds

  /* ───────────── helpers ──────────── */
  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5)
  const draw    = (pile, n = 1) => [...Array(n)].map(() => pile.shift()).filter(Boolean)

  /* ───────────── initial state ─────── */
  const _playerDeck = shuffle([...playerDeck])
  const _aiDeck     = shuffle([...aiDeck])

  const state = {
    id:           battleId,
    turn:         1,
    maxTurns:     MAX_TURNS,
    energy:       1,
    priority:     Math.random() < 0.5 ? 'player' : 'ai', // who reveals first
    phase:        'select',
    selectEndsAt: Date.now() + SELECT_WINDOW,

    lanes: shuffle([...lanes]).slice(0, 3).map((l, i) => ({
       ...l,
       // reveal the first lane immediately
       revealed: i === 0,
       player:   [],
       ai:       []
     })),

    playerDeck: _playerDeck,
    aiDeck:     _aiDeck,
    playerHand: draw(_playerDeck, 4),   // 4‑card starting hand feels nicer
    aiHand:     draw(_aiDeck, 4),

    log: []
  }

  // selections pending this turn
  let _pending = { player: null, ai: null }
  let _ready   = { player: false, ai: false }

  const battle = {
    /* ---------- information ---------- */
    state,
    publicState (perspective = 'player') {
      const s = JSON.parse(JSON.stringify(state)) // deep clone OK (small)
      if (perspective === 'player') {
        s.aiHand  = undefined
        s.aiDeck  = undefined
      } else {
        s.playerHand = undefined
        s.playerDeck = undefined
      }
      return s
    },

    /* ---------- selection stage ------ */
    select (side, selections) {
      if (state.phase !== 'select') return { error: 'NotSelectPhase' }
      // rudimentary validation
      if (!Array.isArray(selections)) return { error: 'BadPayload' }
      const hand = side === 'player' ? state.playerHand : state.aiHand
      // ensure ids exist & cost affordable (simplified)
      for (const sel of selections) {
        const card = hand.find(h => h.id === sel.cardId)
        if (!card) return { error: 'CardNotInHand' }
        if (card.cost > state.energy) return { error: 'NotEnoughEnergy' }
        if (sel.laneIndex < 0 || sel.laneIndex > 2) return { error: 'BadLane' }
      }
      _pending[side] = selections
      _ready[side]   = false  // reset until confirm
      return { ok: true }
    },

    confirm (side) {
      if (state.phase !== 'select') return { error: 'NotSelectPhase' }
      if (!_pending[side]) return { error: 'NoSelection' }
      _ready[side] = true
      if (_ready.player && _ready.ai) {
        runReveal()
      }
      return { ok: true }
    },

    /* ---------- timer tick ---------- */
    tick (now = Date.now()) {
      if (state.phase !== 'select') return
      if (now >= state.selectEndsAt) {
        // treat as an early end
        finishGame()
        return { timeout: true }
      }
      return { timeLeft: state.selectEndsAt - now }
    }
  }

  /* ───────────── internal helpers ───────────── */
  function applySelections (side) {
    const selections = _pending[side] || []
    const hand = side === 'player' ? state.playerHand : state.aiHand
    selections.forEach(sel => {
      const idxHand = hand.findIndex(c => c.id === sel.cardId)
      if (idxHand === -1) return
      const [card] = hand.splice(idxHand, 1)
      state.lanes[sel.laneIndex][side].push(card)
      state.energy -= card.cost
    })
  }

  function fireReveal (side) {
    const selections = _pending[side] || []
    selections.forEach(sel => {
      const lane  = state.lanes[sel.laneIndex]
      const card  = lane[side][lane[side].length - 1]
      const def   = abilityRegistry[card.abilityKey]
      if (def?.onReveal) {
        def.onReveal({ game: battle, side, laneIndex: sel.laneIndex, card })
      }
    })
  }

  function runReveal () {
    // move to REVEAL phase
    state.phase = 'reveal'

    // Apply selections but do NOT trigger abilities yet
    applySelections('player')
    applySelections('ai')

    // reveal order: priority first
    fireReveal(state.priority)
    fireReveal(state.priority === 'player' ? 'ai' : 'player')

    // ► NEW: after all card‐level reveals, trigger each lane’s own onReveal
    state.lanes.forEach((lane, laneIndex) => {
      const def = abilityRegistry[lane.abilityKey]
      if (lane.revealed && def?.onReveal) {
        def.onReveal({ game: battle, side: null, laneIndex, card: null })
      }
    })

    // abilities: onTurnEnd triggers after both reveals
    triggerTurnEndAbilities()

    // Proceed to SETUP
    setupNextTurn()
  }

  function triggerTurnEndAbilities () {
    state.lanes.forEach((lane, i) => {
      lane.player.forEach(card => {
        const def = abilityRegistry[card.abilityKey]
        def?.onTurnEnd?.({ game: battle, side: 'player', laneIndex: i, card })
      })
      lane.ai.forEach(card => {
        const def = abilityRegistry[card.abilityKey]
        def?.onTurnEnd?.({ game: battle, side: 'ai', laneIndex: i, card })
      })
    })

    state.lanes.forEach((lane, laneIndex) => {
      const def = abilityRegistry[lane.abilityKey]
      def?.onTurnEnd?.({ game: battle, side: null, laneIndex, card: null })
    })
  }

  function setupNextTurn () {
    // reveal new location if turn 1‑3
    if (state.turn <= 3) {
      state.lanes[state.turn - 1].revealed = true

      // ► NEW: trigger onTurnStart (or onStart) of that newly revealed location
      const lane = state.lanes[state.turn-1]
      const def  = abilityRegistry[lane.abilityKey]
      if (def?.onTurnStart) {
        def.onTurnStart({ game: battle, side: null, laneIndex: state.turn-1, card: null })
      }
    }

    // draw cards
    state.playerHand.push(...draw(state.playerDeck))
    state.aiHand.push(...draw(state.aiDeck))

    // turn increment & energy ramp
    state.turn += 1
    state.energy = state.energy + state.turn+1

    // flip priority
    state.priority = state.priority === 'player' ? 'ai' : 'player'

    // ► NEW: run each lane’s onTurnStart
    state.lanes.forEach((lane, laneIndex) => {
      const def = abilityRegistry[lane.abilityKey]
      def?.onTurnStart?.({ game: battle, side: null, laneIndex, card: null })
    })

    // clear pending
    _pending = { player: null, ai: null }
    _ready   = { player: false, ai: false }

    if (state.turn > MAX_TURNS) {
      finishGame()
      return
    }

    // start next SELECT phase
    state.phase        = 'select'
    state.selectEndsAt = Date.now() + SELECT_WINDOW

    // onTurnStart abilities
    state.lanes.forEach((lane, i) => {
      lane.player.forEach(card => {
        abilityRegistry[card.abilityKey]?.onTurnStart?.({ game: battle, side: 'player', laneIndex: i, card })
      })
      lane.ai.forEach(card => {
        abilityRegistry[card.abilityKey]?.onTurnStart?.({ game: battle, side: 'ai', laneIndex: i, card })
      })
    })
  }

  function finishGame() {
    // simple lane-tally scoring
    let p = 0, a = 0
    state.lanes.forEach(l => {
      const pPow = l.player.reduce((s, c) => s + c.power, 0)
      const aPow = l.ai    .reduce((s, c) => s + c.power, 0)
      if      (pPow > aPow) p++
      else if (aPow > pPow) a++
    })
  
    // record final winner
    state.winner = p > a
      ? 'player'
      : a > p
        ? 'ai'
        : 'tie'
  
    // jump to gameEnd
    state.phase = 'gameEnd'
  
    // attach lane-wins counts so your server sees them
    state.playerLanesWon = p
    state.aiLanesWon     = a
  
    // prepare a tidy result object
    state.result = {
      winner:         state.winner,
      playerLanesWon: p,
      aiLanesWon:     a
    }
  }  

  /* ───────────── initial ability onStart hooks ─────────── */
  ;[...state.playerHand,...state.aiHand].forEach(card=>{
    const side = state.playerHand.includes(card)?'player':'ai'
    abilityRegistry[card.abilityKey]?.onStart?.({ game:battle, side, laneIndex:null, card })
  })

  return battle
}
