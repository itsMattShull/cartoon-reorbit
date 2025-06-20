// server/utils/abilities.js
// ------------------------------------------------------------------
//  Ability registry – maps `abilityKey` → lifecycle handlers.
//  A handler object can implement any of:
//    onStart(ctx)      – once after opening hands are dealt
//    onReveal(ctx)     – immediately after this card is placed
//    onTurnStart(ctx)  – at the beginning of each turn
//    onTurnEnd(ctx)    – at the end of each turn (after lane effects)
//
//  Context (`ctx`) contains:
//    game        – battle object returned from createBattle()
//    side        – 'player' | 'ai'
//    laneIndex   – number (0‑2) or null if not lane‑specific
//    card        – the card instance executing the ability
// ------------------------------------------------------------------

/** @typedef {import('../utils/battleEngine').BattleCtx} BattleCtx */

export const abilityRegistry = {
  /* ----------------------------------------------------------------
   *  Simple shared abilities (existing)
   * ----------------------------------------------------------------*/

  /** Flame Bug – Deal damage to a random enemy in lane */
  flame_bug: {
    onReveal ({ game, side, laneIndex, card }) {
      const target = side === 'player' ? 'ai' : 'player'
      const laneArr = game.state.lanes[laneIndex][target]
      if (!laneArr.length) return
      const idx  = Math.floor(Math.random() * laneArr.length)
      const dmg  = card.abilityData?.damage ?? 1
      laneArr[idx].power = Math.max(0, laneArr[idx].power - dmg)
      game.log.push(`${card.name} deals ${dmg} dmg to ${laneArr[idx].name}`)
    }
  },

  /** Heal Ally – Heals all friendlies in lane by N (default 1) */
  heal_ally: {
    onReveal ({ game, side, laneIndex, card }) {
      const amt = card.abilityData?.heal ?? 1
      const laneArr = game.state.lanes[laneIndex][side]
      laneArr.forEach(c => { c.power += amt })
      game.log.push(`${card.name} heals allies in lane +${amt}`)
    }
  },

  /* ----------------------------------------------------------------
   *  Spreadsheet Abilities (one per g‑toon) – keys match admin UI
   * ----------------------------------------------------------------*/

  /** Ed – Always Sneaking Up */
  always_sneaking_up: {
    onStart ({ game, side, card }) {
      const hand = side === 'player' ? game.state.playerHand : game.state.aiHand
      if (!hand.find(c => c.id === card.id)) hand.unshift(card)
    }
  },

  /** Pebbles Flintstone – Heals allies by 3 */
  heal_ally_big: {
    onReveal ({ game, side, laneIndex, card }) {
      const amt = 3
      game.state.lanes[laneIndex][side].forEach(c => (c.power += amt))
      game.log.push(`${card.name} heals lane allies +${amt}`)
    }
  },

  /** Princess Morbucks – Gotcha Now */
  gotcha_now: {
    onReveal ({ game, side, laneIndex, card }) {
      const opponent = side === 'player' ? 'ai' : 'player'
      const oppAction = game._pendingActions?.[opponent]
      if (oppAction && oppAction.laneIndex === laneIndex) {
        card.power += 4
        game.log.push(`${card.name} gains +4 Power (Gotcha!)`)
      }
    }
  },

  /** Dexter – Time and Space */
  time_and_space: {
    onReveal ({ game, laneIndex, card }) {
      const newLane = game._allLanes[Math.floor(Math.random() * game._allLanes.length)]
      game.state.lanes[laneIndex] = {
        ...newLane,
        revealed: true,
        player: [],
        ai: []
      }
      game.log.push(`${card.name} replaced the location!`)
    }
  },

  /** Lee Kanker – Take That */
  take_that: {
    onTurnStart ({ game, side }) {
      game.state.lanes.forEach(lane => {
        lane[side]
          .filter(c => !c.abilityKey)
          .forEach(c => (c.power += 2))
      })
    }
  },

  /** Mojo Jojo – Watchful Eye */
  watchful_eye: {
    onReveal ({ laneIndex, card }) {
      card._watchfulLane = laneIndex
      card._watchfulPending = true
    },
    onTurnStart ({ game, side }) {
      // apply +5 if flag still pending
      game.state.lanes.forEach(lane => {
        lane[side].forEach(c => {
          if (c._watchfulPending) {
            c.power += 5
            c._watchfulPending = false
            game.log.push(`${c.name} gains +5 Power (Watchful Eye)`)
          }
        })
      })
    },
    onReveal ({ side, laneIndex, card }) {
      // cancel pending buff if you played here again
      if (card._watchfulLane === laneIndex) card._watchfulPending = false
    }
  },

  /** Raven – Power Up (double lane power each turn) */
  power_up: {
    onTurnEnd ({ game, side, laneIndex }) {
      const laneArr = game.state.lanes[laneIndex][side]
      const total = laneArr.reduce((s, c) => s + c.power, 0)
      laneArr.forEach(c => (c.power += total)) // double total by adding again proportionally
    }
  },

  /** Samurai Jack – Helping Hand */
  helping_hand: {
    onTurnEnd ({ game, side, laneIndex, card }) {
      const laneArr = game.state.lanes[laneIndex][side]
      laneArr.filter(c => c.id !== card.id).forEach(c => (c.power += 1))
    }
  }

  // Note: Tom, The Great Gazoo, Jerry & Buttercup have no abilities in the sheet → no entry needed.
}
