import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BOT_DECKS, BOT_DECK_CARD_NAMES, pickBotDeck, botDecksFor } from '../server/utils/ogGtoonBotDecks.js'
import { DIFFICULTIES, chooseBotPlacements, chooseBotDiscards, chooseBotSwap } from '../server/utils/ogGtoonBot.js'
import { OG_GTOON_POWER_CATALOG } from '../server/utils/ogGtoonPowerCatalog.js'
import { assignRandomGoals, slotsForRound, isRealColor } from '../server/utils/ogGtoonEngine.js'
import * as core from '../server/utils/ogGtoonMatchCore.js'
import { buildBotDeckSnapshot } from '../server/utils/ogGtoonBotDeck.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const data = (f) => readFileSync(path.join(here, '..', 'prisma', 'ogGtoonsData', f), 'utf8')

// Card facts from the same CSV the cards are imported from (first row of a name wins, like the importer).
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const header = rows.shift().map(h => h.replace(/^﻿/, '').trim())
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}
const csv = new Map()
for (const r of parseCsv(data('gtoons-cards.csv'))) if (!csv.has(r.Name)) csv.set(r.Name, r)
const packNames = JSON.parse(data('pack-card-names.json'))
const packSet = new Set(packNames)
const effectByPower = new Map(OG_GTOON_POWER_CATALOG.map(e => [e.description, e.effect]))

const facts = (name) => {
  const r = csv.get(name)
  return { name, character: r.Character || name, color: r.Color.toUpperCase(), value: parseInt(r.Points, 10) }
}
const allDecks = DIFFICULTIES.flatMap(level => BOT_DECKS[level].map(deck => ({ level, ...deck })))
const colourCounts = (deck) => {
  const n = {}
  for (const c of deck.cards.map(facts)) if (isRealColor(c.color)) n[c.color] = (n[c.color] || 0) + 1
  return Object.values(n).sort((a, b) => b - a)
}
const avgValue = (deck) => deck.cards.reduce((a, n) => a + facts(n).value, 0) / deck.cards.length
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

test('bot decks: 10 per difficulty, uniquely named', () => {
  assert.deepEqual(Object.keys(BOT_DECKS).sort(), [...DIFFICULTIES].sort())
  for (const level of DIFFICULTIES) assert.equal(BOT_DECKS[level].length, 10)
  const names = allDecks.map(d => d.name)
  assert.equal(new Set(names).size, names.length)
})

test('bot decks: every deck is 12 different gToons, all from the original gToons pack', () => {
  for (const d of allDecks) {
    assert.equal(d.cards.length, 12, `${d.name} size`)
    assert.equal(new Set(d.cards).size, 12, `${d.name} repeats a card`)
    for (const n of d.cards) {
      assert.ok(packSet.has(n), `${d.name}: "${n}" is not in pack-card-names.json`)
      assert.ok(csv.has(n), `${d.name}: "${n}" is not in gtoons-cards.csv`)
    }
  }
  assert.ok(BOT_DECK_CARD_NAMES.every(n => packSet.has(n)))
})

test('bot decks: no two cards share a character (only the lowest of a character would count), and a goal colour exists', () => {
  for (const d of allDecks) {
    const characters = d.cards.map(n => facts(n).character.toLowerCase())
    assert.equal(new Set(characters).size, characters.length, `${d.name} has two cards of one character`)
    assert.ok(d.cards.some(n => isRealColor(facts(n).color)), `${d.name} has no card that can be its goal`)
  }
})

test('bot decks: easy decks scatter their colours and lean on Black, so the colour majority is hard for them to win', () => {
  for (const d of BOT_DECKS.easy) {
    const counts = colourCounts(d)
    assert.ok(counts[0] <= 2, `${d.name}: ${counts[0]} cards of one colour`)
    assert.ok(counts[0] + (counts[1] || 0) <= 4, `${d.name}: top two colours hold ${counts[0] + (counts[1] || 0)} cards`)
    const silver = d.cards.filter(n => facts(n).color === 'SILVER').length
    assert.ok(silver <= 1, `${d.name}: Silver cards count as any colour, which helps the bot`)
  }
})

test('bot decks: hard decks pair a concentrated colour core with the strongest printed values', () => {
  for (const d of BOT_DECKS.hard) {
    const counts = colourCounts(d)
    assert.ok(counts[0] + (counts[1] || 0) >= 4, `${d.name}: weak colour core`)
    assert.ok(avgValue(d) >= 8, `${d.name}: average ${avgValue(d).toFixed(2)}`)
    // Only one or two colours, so the random goal card always names a colour the deck is built around.
    assert.ok(counts.length <= 2, `${d.name}: ${counts.length} colours`)
  }
})

test('bot decks: colour concentration rises easy -> normal -> hard', () => {
  const core = (level) => mean(BOT_DECKS[level].map(d => { const c = colourCounts(d); return c[0] + (c[1] || 0) }))
  assert.ok(core('easy') < core('normal'), `${core('easy')} < ${core('normal')}`)
  assert.ok(core('normal') < core('hard'), `${core('normal')} < ${core('hard')}`)
  const value = (level) => mean(BOT_DECKS[level].map(avgValue))
  assert.ok(value('normal') < value('hard'))
})

test('bot decks: normal and hard decks do not carry powers that work against them', () => {
  const selfHarm = new Set(['Amoeba Boys', 'Cootie Bug', 'Sarah'])
  for (const d of [...BOT_DECKS.normal, ...BOT_DECKS.hard]) {
    for (const n of d.cards) assert.ok(!selfHarm.has(n), `${d.name} contains ${n}`)
    // "-4 to any George Jetson" from Cosmo Spacely.
    assert.ok(!(d.cards.includes('Cosmo Spacely') && d.cards.includes('George Jetson')), `${d.name}: Cosmo Spacely vs George Jetson`)
  }
})

test('pickBotDeck: picks within the difficulty, covers all ten, defaults for unknown levels, honours availability', () => {
  for (const level of DIFFICULTIES) {
    const seen = new Set()
    for (let i = 0; i < 10; i++) {
      const d = pickBotDeck(level, () => i / 10)
      assert.ok(BOT_DECKS[level].includes(d))
      seen.add(d.name)
    }
    assert.equal(seen.size, 10)
  }
  assert.ok(BOT_DECKS.normal.includes(pickBotDeck('nonsense', () => 0.5)))
  assert.deepEqual(botDecksFor(undefined), BOT_DECKS.normal)
  assert.equal(pickBotDeck('easy', () => 0, new Set()), null)
  const onlyFirst = new Set(BOT_DECKS.hard[3].cards)
  assert.equal(pickBotDeck('hard', Math.random, onlyFirst).name, BOT_DECKS.hard[3].name)
})

test('buildBotDeckSnapshot: 12 snapshot cards in list order, or null when a card is missing', () => {
  const def = BOT_DECKS.hard[0]
  const byName = new Map(def.cards.map((name, i) => [name, { id: `id${i}`, name, gtoonColor: 'RED', gtoonValue: 5, characters: [name], assetPath: '/x.png', gtoonEffect: null }]))
  const built = buildBotDeckSnapshot(def, byName)
  assert.equal(built.name, def.name)
  assert.deepEqual(built.cards.map(c => c.position), [...Array(12).keys()])
  assert.deepEqual(built.cards.map(c => c.name), def.cards)
  byName.delete(def.cards[5])
  assert.equal(buildBotDeckSnapshot(def, byName), null)
})

/* ── Every deck plays a full match on the real engine ────────────────────────────────────── */

const GROUPS = { 'Bean Scouts': 'BEAN_SCOUTS', 'Daily Planet': 'DAILY_PLANET', 'G.L.O.B.A.L.': 'GLOBAL', 'Imaginary Friend': 'IMAGINARY_FRIEND', 'Injustice Gang': 'INJUSTICE_GANG', 'Justice Friends': 'JUSTICE_FRIENDS', 'Justice League': 'JUSTICE_LEAGUE', 'Mucha Lucha': 'MUCHA_LUCHA', 'Mystery, Inc.': 'MYSTERY_INC', 'Powerpuff Girls': 'POWERPUFF_GIRLS', 'Squirrel Scouts': 'SQUIRREL_SCOUTS', 'Teen Titans': 'TEEN_TITANS', 'Time Squad': 'TIME_SQUAD', 'WOOHP': 'WOOHP' }
function snapshotDeck(names) {
  return names.map((name, position) => {
    const r = csv.get(name)
    const power = r['Power Description']
    const effect = !power || /^no power$/i.test(power) ? null : effectByPower.get(power)
    assert.ok(!power || /^no power$/i.test(power) || effect, `"${name}": power not in the catalog`)
    return {
      ctoonId: name, name, assetPath: '', characters: [r.Character || name], color: r.Color.toUpperCase(), value: parseInt(r.Points, 10),
      type1: r['Type 1'].toUpperCase() || null, type2: r['Type 2'].toUpperCase() || null, type3: r['Type 3'].toUpperCase() || null,
      group: r.Group ? GROUPS[r.Group] : null, isSlam: false, effect: effect && effect.length ? effect : null, position
    }
  })
}
function seeded(seed) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
const handCards = (m, i, idxs) => idxs.map(k => ({ idx: k, ...m.deckOrder[i][k] }))

/** Plays one match to its end with both sides driven by the bot's choosers. */
function playOut(deckA, deckB, levels, rng) {
  const m = core.initHands({ id: 'm', players: ['a', 'b'], usernames: ['A', 'B'], deckOrder: [deckA, deckB], stake: [0, 0] }, rng)
  assignRandomGoals(m, rng)
  const conclude = () => {
    const colour = core.enterColorPhase(m)
    const end = colour ? null : core.checkMatchEnd(m)
    if (!end && !colour) core.advanceRound(m)
    return end
  }
  for (let guard = 0; guard < 60; guard++) {
    if (m.phase === 'play') {
      for (const i of [0, 1]) {
        const picks = chooseBotPlacements({ difficulty: levels[i], slots: slotsForRound(m.currentRound), hand: handCards(m, i, m.hand[i]), goalColor: m.goalColor[i], rng })
        m.placements[i] = []
        for (const p of picks) assert.equal(core.placeCard(m, i, p).ok, true)
        core.markCommitted(m, i)
      }
      core.revealPlacedCards(m)
      const end = conclude()
      if (end) return end
    } else if (m.phase === 'discard') {
      for (const i of [0, 1]) {
        core.submitDiscard(m, i, { cardIdxs: chooseBotDiscards({ difficulty: levels[i], hand: handCards(m, i, m.hand[i]), undealt: handCards(m, i, [...m.hand[i], ...m.undealt[i]]), goalColor: m.goalColor[i] }) })
      }
      core.resolveDiscardPhase(m)
    } else if (m.phase === 'swap') {
      for (const i of [0, 1]) {
        if (m.swapReady[i]) continue
        const held = m.held?.[i]
        core.recordSwapChoice(m, i, chooseBotSwap({ difficulty: levels[i], slotCard: held ? { value: held.baseValue, color: held.color } : null, undealt: handCards(m, i, [...m.hand[i], ...m.undealt[i]]), goalColor: m.goalColor[i] }))
      }
      if (core.resolveSwapPhase(m, rng)) { const end = conclude(); if (end) return end }
    } else if (m.phase === 'color') {
      for (const i of [0, 1]) if (!m.colorReady[i]) core.submitColor(m, i, { color: core.autoSilverColor(m, i) })
      if (core.resolveColorPhase(m)) { const end = conclude(); if (end) return end }
    }
  }
  return null
}

test('bot decks: all 30 decks, with their real powers, play full matches on the engine without error', () => {
  const opponent = snapshotDeck(BOT_DECKS.normal[0].cards)
  for (const level of DIFFICULTIES) {
    for (const [k, d] of BOT_DECKS[level].entries()) {
      const deck = snapshotDeck(d.cards)
      for (let seed = 1; seed <= 3; seed++) {
        // The deck is as the bot's (side 2) and, mirrored, as the opponent's; neither may throw or stall.
        const end = playOut(opponent, deck, ['normal', level], seeded(seed * 31 + k))
        assert.ok(end && ['PLAYER1', 'PLAYER2', 'TIE'].includes(end.outcome), `${d.name} (seed ${seed}) did not finish`)
      }
    }
  }
})
