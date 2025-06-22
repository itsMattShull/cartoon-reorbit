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
  },

  /* ----------------------------------------------------------------
   *  Lane effects (keys match your lanes.json “effect” field)
   * ----------------------------------------------------------------*/

  DOUBLE_ABILITIES: {
    onReveal({ game, laneIndex }) {
      const lane = game.state.lanes[laneIndex]
      // apply twice per card on both sides
      for (const side of ['player','ai']) {
        lane[side].forEach(card => {
          const def = abilityRegistry[card.abilityKey]
          if (def?.onReveal) {
            def.onReveal({ game, side, laneIndex, card })
            def.onReveal({ game, side, laneIndex, card })
          }
        })
      }
      game.log.push(`${lane.name}: Abilities triggered twice`)
    }
  },

  PLUS_TWO_POWER: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex];
      if (!lane) return;

      // STATIC FLIP: buff every existing card in *this* lane once
      if (!side && !card) {
        if (lane._plusTwoLaneHandled) return;
        lane._plusTwoLaneHandled = true;

        // only cards in this lane, no other lanes touched
        ;[...lane.player, ...lane.ai].forEach(c => {
          if (!c._plusTwoApplied) {
            c.power += 2;
            c._plusTwoApplied = true;
          }
        });

        game.log.push(`${lane.name}: +2 power to all pre-existing cToons`);
        return;
      }

      // PER-CARD PLACEMENT: only buff the one you just dropped
      if (!side || !card) return;
      if (!lane.revealed)    return;
      if (card._plusTwoApplied) return;

      card.power += 2;
      card._plusTwoApplied = true;
      game.log.push(
        `${card.name} gains +2 Power (Plus Two) in ${lane.name} for ${side}`
      );
    }
  },

  SPAWN_TOKEN: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]
      if (!lane) return

      // Token factory
      const makeToken = () => ({
        id:           'imaginary_friend',
        name:         'Imaginary Friend',
        power:        1,
        cost:         0,
        abilityKey:   null,
        abilityData:  null,
        assetPath:    '/images/cToons/imaginaryfriend.png'
      })

      // 1) Static lane-flip: side=null & card=null
      if (!side && !card) {
        // only do this once
        if (lane._spawnedInitialTokens) return
        lane._spawnedInitialTokens = true

        for (const who of ['player','ai']) {
          // count only real cards (exclude existing tokens)
          const realCards = lane[who].filter(c => c.id !== 'imaginary_friend')
          // count how many tokens already exist
          const existingTokens = lane[who].filter(c => c.id === 'imaginary_friend').length
          // how many more we can add without exceeding 4 total
          const room = 4 - lane[who].length
          // how many tokens to spawn = min(realCards, room) minus already present tokens
          const toSpawn = Math.min(realCards.length - existingTokens, room)
          for (let i = 0; i < toSpawn; i++) {
            lane[who].push(makeToken())
          }
        }

        game.log.push(
          `${lane.name}: spawned initial Imaginary Friends for pre-existing cards`
        )
        return
      }

      // 2) Per-card placement: only when a real card is played
      if (!side || !card) return
      if (!lane.revealed) return

      // don’t exceed 4 cards on that side
      if (lane[side].length >= 4) return

      lane[side].push(makeToken())
      game.log.push(
        `${card.name} triggered ${lane.name}: spawned Imaginary Friend for ${side}`
      )
    }
  },

  RANDOMIZE_POWER: {
    // “Cards here roll a new random power (0–10) each turn.”
    onTurnStart ({ game, laneIndex }) {
      const lane = game.state.lanes[laneIndex]
      if (!lane?.revealed) return
      ;[...lane.player, ...lane.ai].forEach(c => {
        c.power = Math.floor(Math.random() * 11)
      })
      game.log.push(`${lane.name}: randomized power of all cToons`)
    }
  },

  CHEAP_BUFF: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex];
      if (!lane) return;

      // STATIC FLIP: buff existing 1-costs in this lane once
      if (!side && !card) {
        if (lane._cheapBuffLaneHandled) return;
        lane._cheapBuffLaneHandled = true;

        ;[...lane.player, ...lane.ai]
          .filter(c => c.cost === 1 && !c._cheapBuffApplied)
          .forEach(c => {
            c.power += 1;
            c._cheapBuffApplied = true;
          });

        game.log.push(`${lane.name}: +1 power to all pre-existing 1-cost cToons`);
        return;
      }

      // PER-CARD PLACEMENT: only buff that new 1-cost card
      if (!side || !card) return;
      if (!lane.revealed)    return;
      if (card.cost !== 1)   return;
      if (card._cheapBuffApplied) return;

      card.power += 1;
      card._cheapBuffApplied = true;
      game.log.push(
        `${card.name} gains +1 Power (Cheap Buff) in ${lane.name} for ${side}`
      );
    }
  },

  // Note: Tom, The Great Gazoo, Jerry & Buttercup have no abilities in the sheet → no entry needed.
}
