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
//    'select' : players compose selections (60‑s timer)
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
  const SELECT_WINDOW = 60_000  // 60 seconds

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
    playerEnergy: 1,
    aiEnergy:     1,
    priority:     Math.random() < 0.5 ? 'player' : 'ai', // who reveals first
    phase:        'select',
    selectEndsAt: Date.now() + SELECT_WINDOW,

    lanes: shuffle(lanes).slice(0,3).map((l,i) => ({
      id:         l.id,
      name:       l.name,
      desc:       l.desc,
      abilityKey: l.effect,    // ← turn your “effect” into the key the registry expects
      revealed:   i===0,
      player:     [], ai:[]
    })),

    playerDeck: _playerDeck,
    aiDeck:     _aiDeck,
    playerHand: draw(_playerDeck, 4),   // 4‑card starting hand feels nicer
    aiHand:     draw(_aiDeck, 4),

    log: []
  }

  // selections pending this turn
  let _pending = {}
  let _ready   = {}
  _pending.player = null
  _pending.ai     = null
  _ready.player   = false
  _ready.ai       = false

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
        if (card.cost > state[ side + 'Energy' ]) return { error: 'NotEnoughEnergy' }
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

  battle._allLanes = lanes
  battle._pendingActions = _pending
  battle.log = state.log

  // 2) now that `battle` exists, do your “always_sneaking_up” deck scan
  for (const side of ['player', 'ai']) {
    const deck = state[side + 'Deck'];
    const hand = state[side + 'Hand'];
    deck
      .filter(c => c.abilityKey === 'always_sneaking_up')
      .forEach(card => {
        const idx = deck.findIndex(c2 => c2.id === card.id);
        deck.splice(idx, 1);
        hand.unshift(card);
        state.log.push(`${card.name} sneaks into your starting hand!`);
      });
  }

  // 3) and only now fire every card’s onStart
  ;[...state.playerHand, ...state.aiHand].forEach(card => {
    const side = state.playerHand.includes(card) ? 'player' : 'ai';
    abilityRegistry[card.abilityKey]?.onStart?.({
      game: battle,
      side,
      laneIndex: null,
      card
    });
  });

  /* ───────────── internal helpers ───────────── */
  function applySelections (side) {
    const selections = _pending[side] || []
    const hand = side === 'player' ? state.playerHand : state.aiHand
    selections.forEach(sel => {
      const idxHand = hand.findIndex(c => c.id === sel.cardId)
      if (idxHand === -1) return
      const [orig] = hand.splice(idxHand, 1)
      const card = { ...orig }
      state.lanes[sel.laneIndex][side].push(card)
      state[ side + 'Energy' ] -= card.cost
    })
  }

  // --- aiChooseSelections ---
  function aiChooseSelections(battle) {
    // pull from battle.state.aiEnergy, not a shared “energy” field
    const { aiEnergy, aiHand } = battle.state
    const playable = aiHand.filter(c => c.cost <= aiEnergy)
    if (!playable.length) return []
    const card = playable.sort((a, b) => b.cost - a.cost)[0]
    const laneIndex = Math.floor(Math.random() * 3)
    return [{ cardId: card.id, laneIndex }]
  }

  function fireReveal(side) {
    const selections = _pending[side] || []
    selections.forEach(sel => {
      const laneIndex = sel.laneIndex
      const lane = state.lanes[laneIndex]
      const pile      = lane[side]
      const card      = pile && pile.length > 0
                          ? pile[pile.length - 1]
                          : null
  
      if (!card) return                // ← bail out if somehow nothing was pushed

      // 1) Card’s own ability
      const cardDef = abilityRegistry[card.abilityKey]
      if (cardDef?.onReveal) {
        cardDef.onReveal({ game: battle, side, laneIndex, card })
      }

      // 2) Lane’s reaction to that placement
      const laneDef = abilityRegistry[lane.abilityKey]
      if (laneDef?.onReveal) {
        laneDef.onReveal({ game: battle, side, laneIndex, card })
      }
    })
  }


  function runReveal () {
    // move to REVEAL phase
    state.phase = 'reveal'
    // ─── Watchful Eye “delayed buff” from last turn ───
    state.lanes.forEach((lane, laneIndex) => {
      const isDouble = lane.abilityKey === 'DOUBLE_ABILITIES'
      for (const side of ['player','ai']) {
        lane[side].forEach(card => {
          if (
            card.abilityKey === 'watchful_eye' &&
            card._watchfulRevealTurn === state.turn - 1
          ) {
            // ← new guard: did any OTHER card (not this one) land here this turn?
            const playedThisTurn =
              (_pending.player  || []).some(s => s.laneIndex === laneIndex && s.cardId !== card.id) ||
              (_pending.ai      || []).some(s => s.laneIndex === laneIndex && s.cardId !== card.id)

            if (!playedThisTurn) {
              const times = isDouble ? 2 : 1
              for (let i = 0; i < times; i++) {
                card.power += 5
              }
              state.log.push(
                `${card.name} gains +${5*times} Power (Watchful Eye${isDouble?'×2':''})`
              )
            }
            // clear flags so it never fires again
            delete card._watchfulRevealTurn
            delete card._watchfulLane
          }
        })
      }
    })

    // Apply selections but do NOT trigger abilities yet
    applySelections('player')
    applySelections('ai')

    // reveal order: priority first
    fireReveal(state.priority)
    fireReveal(state.priority === 'player' ? 'ai' : 'player')

    // ► NEW: after all card‐level reveals, trigger each lane’s own onReveal
    state.lanes.forEach((lane, i) => {
      const def = abilityRegistry[lane.abilityKey]
      // only run onReveal if we just flipped this turn
      if (lane.revealed && !lane._hasRevealedOnce && def?.onReveal) {
        def.onReveal({ game: battle, side: null, laneIndex: i, card: null })
        lane._hasRevealedOnce = true
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

  function triggerTurnStartAbilities() {
    // 1) lane-level onTurnStart (side=null)
    state.lanes.forEach((lane, laneIndex) => {
      const laneDef = abilityRegistry[lane.abilityKey]
      laneDef?.onTurnStart?.({
        game: battle,
        side: null,
        laneIndex,
        card: null
      })
    })

    // 2) card-level onTurnStart for both sides
    state.lanes.forEach((lane, laneIndex) => {
      for (const side of ['player','ai']) {
        lane[side].forEach(card => {
          const def = abilityRegistry[card.abilityKey]
          def?.onTurnStart?.({
            game: battle,
            side,
            laneIndex,
            card
          })
        })
      }
    })
  }


  function setupNextTurn () {
    // 1) increment the turn counter
    state.turn += 1

    state.lanes.forEach((lane, i) => {
      if (lane.revealed && lane.abilityKey === 'RANDOMIZE_POWER') {
        const def = abilityRegistry[lane.abilityKey]
        def?.onTurnStart?.({
          game:       battle,
          side:       null,
          laneIndex:  i,
          card:       null
        })
        // (optional) you could set a flag here if you want to avoid double-firing
      }
    })

    // ─── 1.5) trigger all cards' onTurnStart ───
    state.lanes.forEach((lane, laneIndex) => {
      // player-side
      lane.player.forEach(card => {
        const def = abilityRegistry[card.abilityKey]
        def?.onTurnStart?.({
          game: battle,
          side: 'player',
          laneIndex,
          card
        })
      })
      // ai-side
      lane.ai.forEach(card => {
        const def = abilityRegistry[card.abilityKey]
        def?.onTurnStart?.({
          game: battle,
          side: 'ai',
          laneIndex,
          card
        })
      })
    })

    // 2) if we're now on turn 2 or 3, reveal that lane
    if (state.turn >= 2 && state.turn <= 3) {
      const laneIndex = state.turn - 1   // turn 2 → index 1, turn 3 → index 2
      state.lanes[laneIndex].revealed = true

      // trigger that lane's onTurnStart hook if you have one
      const def = abilityRegistry[state.lanes[laneIndex].abilityKey]
      def?.onTurnStart?.({
        game: battle,
        side: null,
        laneIndex,
        card: null
      })
    }

    // 3) draw cards for each side
    state.playerHand.push(...draw(state.playerDeck, 1))
    state.aiHand    .push(...draw(state.aiDeck,     1))

    // 4) ramp up energy
    // 4) ramp up each side’s energy by a fixed amount

    state.playerEnergy = Math.min(state.playerEnergy + MAX_ENERGY, state.playerEnergy + state.turn)
    state.aiEnergy     = Math.min(state.aiEnergy + MAX_ENERGY, state.aiEnergy     + state.turn)

    // 5) flip priority
    state.priority = state.priority === 'player' ? 'ai' : 'player'

    // 6) reset pending / ready flags
    _pending.player = null
    _pending.ai     = null
    _ready.player   = false
    _ready.ai       = false

    // 7) check for game end
    if (state.turn > MAX_TURNS) {
      finishGame()
      return
    }

    // 8) start the next select phase
    state.phase        = 'select'
    state.selectEndsAt = Date.now() + SELECT_WINDOW

    triggerTurnStartAbilities()
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
