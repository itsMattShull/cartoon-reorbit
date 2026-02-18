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

const norm = s => typeof s === 'string' ? s.trim().toLowerCase() : ''
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const typeHasToken = (type, token) => {
  if (!type || !token) return false
  const rx = new RegExp(`\\b${escapeRegExp(token)}\\b`)
  return rx.test(type)
}
const isType = (c, t) => typeHasToken(norm(c?.gtoonType), norm(t))
const hasType = (c, sub) => typeHasToken(norm(c?.gtoonType), norm(sub))
const isHeroType = c => typeof c?.gtoonType === 'string' && /\bhero\b/i.test(c.gtoonType)
const nameIs = (c, ...names) => names.some(n => norm(c?.name) === norm(n))
const nameHas = (c, token) => norm(c?.name).includes(norm(token))

export const abilityRegistry = {
  /* ----------------------------------------------------------------
   *  Spreadsheet Abilities (one per g‑toon) – keys match admin UI
   * ----------------------------------------------------------------*/

  /** Ed – Always Sneaking Up */
  always_sneaking_up: {
    onStart ({ game, side, card }) {
      // console.log(`${card.name} is always sneaking up for ${side}!`)
      game.log.push(`${card.name} is always sneaking up for ${side}!`)
      const hand = side === 'player' ? game.state.playerHand : game.state.aiHand
      if (!hand.find(c => c.id === card.id)) hand.unshift(card)
    }
  },

  /** Princess Morbucks – Gotcha Now */
  gotcha_now: {
    onReveal({ game, side, laneIndex, card }) {
      // figure out if the lane you’re in is a DOUBLE_ABILITIES lane
      const laneKey = game.state.lanes[laneIndex].abilityKey;
      // if double-abilities, we want to allow up to 2 buffs, otherwise only 1
      const maxTriggers = laneKey === 'DOUBLE_ABILITIES' ? 2 : 1;

      // guard so we never buff more than maxTriggers times
      card._gotchaCount = card._gotchaCount || 0;
      if (card._gotchaCount >= maxTriggers) return;

      // only buff if the opponent also played here
      const opponent      = side === 'player' ? 'ai' : 'player';
      const oppSelections = game._pendingActions?.[opponent] || [];
      if (!oppSelections.some(sel => sel.laneIndex === laneIndex)) return;

      // do the buff
      card.power += 4;
      card._gotchaCount += 1;
      game.log.push(
        `${card.name} gains +4 Power (Gotcha Now) in ${game.state.lanes[laneIndex].name}`
      );
    }
  },

  /** Dexter – Time and Space */
  time_and_space: {
    onReveal ({ game, laneIndex, card }) {
      // pick a random new “template” from your original lane definitions
      const newDef = game._allLanes[Math.floor(Math.random() * game._allLanes.length)]

      // grab the existing lane object and its cards
      const lane = game.state.lanes[laneIndex]
      const oldPlayers = lane.player
      const oldAi      = lane.ai

      // overwrite only the metadata, preserve the arrays
      lane.id         = newDef.id
      lane.name       = newDef.name
      lane.desc       = newDef.desc
      lane.abilityKey = newDef.effect    // assuming your lanes.json uses `effect` → `abilityKey`
      lane.revealed   = true

      // re-attach the cards you had in that lane
      lane.player = oldPlayers
      lane.ai     = oldAi

      game.log.push(`${card.name} replaced the location with ${lane.name}!`)
    }
  },
  take_that: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]
      const laneArr = lane[side]

      // Max triggers this turn: 2 if DOUBLE_ABILITIES lane, otherwise 1
      const maxTriggers = lane.abilityKey === 'DOUBLE_ABILITIES' ? 2 : 1

      // Per-turn guard so we can't exceed maxTriggers
      const turn = game.state.turn
      if (card._takeThatSeenTurn !== turn) {
        card._takeThatSeenTurn = turn
        card._takeThatTriggers = 0
      }
      if (card._takeThatTriggers >= maxTriggers) return

      // +2 to *non-ability* allies in THIS lane, THIS side, right now
      laneArr
        .filter(c => !c.abilityKey) // excludes ability cards (including this one)
        .forEach(c => { c.power += 2 })

      card._takeThatTriggers += 1

      game.log.push(
        `${card.name} shouts “Take that!” — +2 Power to non-ability allies in ${lane.name}`
        + (maxTriggers > 1 ? ' (DOUBLE)' : '')
      )
    }
  },

  /** Mojo Jojo – Watchful Eye */
  watchful_eye: {
    // Single onReveal that both _sets_ the “next‐turn” flag and can cancel it
    onReveal({ game, side, laneIndex, card }) {
      // first time we see it in this turn, schedule a buff next turn
      if (card._watchfulRevealTurn == null) {
        card._watchfulRevealTurn = game.state.turn
        card._watchfulLane       = laneIndex
        card._watchfulCanceled   = false
      }
    },
  },

  /** Helping Hand */
  helping_hands: {
    onTurnEnd ({ game, side, laneIndex, card }) {
      // only apply once per helping_hand
      if (card._helpingApplied) return
      card._helpingApplied = true

      const laneArr = game.state.lanes[laneIndex][side]
        // buff every other toon in the lane
        .filter(c => c.id !== card.id)

      laneArr.forEach(c => c.power += 1)
      game.log.push(
        `${card.name} gives Helping Hand ➞ +1 Power to each other toon`
      )
    }
  },

  heroine_plus: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]
      if (!lane) return

      // debug: show the played card and every card’s gtoonType in this lane
      ;['player','ai'].forEach(who => {
        lane[who].forEach(c => {
          // console.log(`[HeroinePlus] lane=${lane.name} side=${who} card=${c.name} type=${JSON.stringify(c.gtoonType)}`)
        })
      })

      const maxTriggers = lane.abilityKey === 'DOUBLE_ABILITIES' ? 2 : 1
      card._heroinePlusCount = card._heroinePlusCount || 0
      if (card._heroinePlusCount >= maxTriggers) return

      const isFemaleHero = t =>
        typeof t === 'string' && t.trim().toLowerCase() === 'female hero'

      const allies = lane[side].filter(
        c => c.id !== card.id && isFemaleHero(c.gtoonType)
      )

      allies.forEach(c => {
        // console.log(`[HeroinePlus] buff +4 -> ${c.name} (type=${JSON.stringify(c.gtoonType)})`)
        c.power += 4
      })

      card._heroinePlusCount += 1
      if (allies.length) {
        game.log.push(
          `${card.name} activates Heroine Plus: +4 to Female Hero allies in ${lane.name}`
        )
      }
    }
  },

  no_hero_penalty: {
    onReveal({ game, side, laneIndex }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      const opp = side === 'player' ? 'ai' : 'player'

      // trigger only if opponent has a card whose type contains the word "hero"
      const isHeroType = c =>
        typeof c?.gtoonType === 'string' && /\bhero\b/i.test(c.gtoonType)
      const oppHasHero = lane[opp].some(isHeroType)
      if (!oppHasHero) return

      const turn = game.state.turn
      let targets = lane[opp].filter(c => c._playedTurn === turn)
      if (!targets.length && lane[opp].length) {
        targets = [lane[opp][lane[opp].length - 1]]
      }

      targets.forEach(t => { t.power -= 5 })
      if (targets.length) {
        game.log.push(`${lane.name}: opponent has a Hero → ${targets.length} card(s) −5`)
      }
    }
  },

  flash_boost: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      const allies = lane[side].filter(c => c !== card && nameHas(c, 'flash'))
      allies.forEach(a => { a.power += 5 })
      if (allies.length) game.log.push(`${card.name}: +5 to Flash ally/ies in ${lane.name}`)
    }
  },

  female_villains_bonus: {
    onReveal({ game, card }) {
      const count = game.state.lanes
        .flatMap(l => [...l.player, ...l.ai])
        .filter(c => isType(c, 'female villain')).length
      if (!count) return
      card.power += 3 * count
      game.log.push(`${card.name}: +${3*count} (Female Villains in play: ${count})`)
    }
  },

  ppg_allies_boost: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      const patterns = [
        /buttercup/i,
        /blossom/i,
        /ms\.?\s*keane/i,
        /professor\s+utonium/i
      ]
      const targets = lane[side].filter(c =>
        c !== card && patterns.some(rx => rx.test(c.name || ''))
      )
      targets.forEach(t => { t.power += 2 })
      if (targets.length) game.log.push(`${card.name}: +2 to ${targets.length} PPG ally/ies in ${lane.name}`)
    }
  },

  villains_bonus: {
    onReveal({ game, card }) {
      const isVillain = c =>
        typeof c?.gtoonType === 'string' && /\bvillain\b/i.test(c.gtoonType)

      const count = game.state.lanes
        .flatMap(l => [...l.player, ...l.ai])
        .filter(isVillain).length

      if (!count) return
      card.power += count
      game.log.push(`${card.name}: +${count} (Villains in play: ${count})`)
    }
  },

  heroine_rally: {
    onReveal({ game, side, card }) {
      const targets = game.state.lanes
        .flatMap(l => [...l.player, ...l.ai])
        .filter(c => c !== card && isType(c, 'female hero'))
      targets.forEach(a => { a.power += 4 })
      if (targets.length) {
        game.log.push(`${card.name}: +4 to all Female Hero(es) in play`)
      }
    }
  },

  girl_power: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      const allies = lane[side].filter(
        c => c !== card && isType(c, 'female')
      )
      allies.forEach(a => { a.power += 1 })
      if (allies.length) {
        game.log.push(`${card.name}: +1 to all Female allies in ${lane.name}.`)
      }
    }
  },

  dont_think_so: {
    onReveal({ game, side, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      card._dontThinkSoActive = true
      const enemy = side === 'player' ? 'ai' : 'player'
      const targets = lane[enemy].filter(isHeroType)
      if (!targets.length) return
      game.log.push(
        `${card.name}: negates ${targets.length} enemy Hero ability/ies in ${lane.name}`
      )
    }
  },

  keen_for_kean: {
    onReveal({ game, laneIndex, card }) {
      const lanes = game.state.lanes
      const left = lanes[laneIndex - 1]
      const right = lanes[laneIndex + 1]
      const hasMsKean = [left, right]
        .filter(Boolean)
        .some(lane => [...lane.player, ...lane.ai].some(c => nameHas(c, 'kean')))

      if (!hasMsKean) return
      card.power += 5
      game.log.push(`${card.name}: +5 (Keen for Kean)`)
    }
  },

  major_man_weakness: {
    onReveal({ game, laneIndex, card }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      const exists = [...lane.player, ...lane.ai].some(c => nameIs(c, 'Major Man'))
      if (!exists) return
      card.power -= 7
      game.log.push(`${card.name}: −7 (Major Man present in ${lane.name})`)
    }
  },

  anti_batman: {
    onReveal({ game, laneIndex }) {
      const lane = game.state.lanes[laneIndex]; if (!lane) return
      const targets = [...lane.player, ...lane.ai].filter(c => nameHas(c, 'batman'))
      targets.forEach(t => { t.power -= 3 })
      if (targets.length) game.log.push(`${lane.name}: Batman cards −3 (${targets.length})`)
    }
  },

  /* ----------------------------------------------------------------
   *  Lane effects (keys match your lanes.json “effect” field)
   * ----------------------------------------------------------------*/

  /** Dexter’s Lab – trigger a card’s onReveal twice */
  DOUBLE_ABILITIES: {
    onReveal({ game, side, laneIndex, card }) {
      if (!card) return
      const lane = game.state.lanes[laneIndex]
      const enemy = side === 'player' ? 'ai' : 'player'
      const suppressed =
        card._abilityDisabled ||
        (isHeroType(card) &&
          lane?.[enemy]?.some(
            c => c.abilityKey === 'dont_think_so' && c._dontThinkSoActive
          ))
      if (suppressed) return
      const cardDef = abilityRegistry[card.abilityKey]
      if (cardDef?.onReveal) {
        // The card already fired once in fireReveal → fire exactly one *extra* time
        cardDef.onReveal({ game, side, laneIndex, card })
        game.log.push(
          `${card.name} triggers twice in ${game.state.lanes[laneIndex].name}!`
        )
      }
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

  ACME_CANYON: {
    // After both sides reveal, check if both played here; buff only cards played this turn.
    onTurnEnd({ game, laneIndex }) {
      const lane = game.state.lanes[laneIndex]
      if (!lane?.revealed) return
      const pend = game._pendingActions || {}
      const bothPlayed =
        (pend.player || []).some(s => s.laneIndex === laneIndex) &&
        (pend.ai     || []).some(s => s.laneIndex === laneIndex)
      if (!bothPlayed) return
      const turn = game.state.turn
      const playedNow = a => a.filter(c => c._playedTurn === turn)
      const affected = [...playedNow(lane.player), ...playedNow(lane.ai)]
      if (!affected.length) return
      affected.forEach(c => { c.power += 3 })
      game.log.push(`${lane.name}: both sides played → +3 to cards played this turn`)
    }
  },

  STAR_LABS: {
    // When a card with an ability reveals here, buff a random ally here.
    onReveal({ game, side, laneIndex, card }) {
      if (!side || !card?.abilityKey) return
      const lane = game.state.lanes[laneIndex]
      if (!lane?.revealed) return
      const allies = lane[side].filter(c => c !== card)
      if (!allies.length) return
      const r = allies[Math.floor(Math.random() * allies.length)]
      r.power += 2
      game.log.push(`${lane.name}: ${card.name} empowers ${r.name} (+2)`)
    }
  },

  JUMP_CITY: {
    // End of reveal: if YOU played exactly two cards here this turn, buff those two.
    onTurnEnd({ game, laneIndex }) {
      const lane = game.state.lanes[laneIndex]
      if (!lane?.revealed) return
      const turn = game.state.turn
      for (const side of ['player','ai']) {
        const played = lane[side].filter(c => c._playedTurn === turn)
        if (played.length === 2) {
          played.forEach(c => { c.power += 2 })
          game.log.push(`${lane.name}: ${side} played exactly two → both +2`)
        }
      }
    }
  }

  // Note: Tom, The Great Gazoo, Jerry & Buttercup have no abilities in the sheet → no entry needed.
}
