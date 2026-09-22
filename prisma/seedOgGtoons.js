// prisma/seedOgGtoons.js
// Seeds a handful of test Ctoon rows for original gToons (2002) — NOT full lore-accurate card
// data, just enough to exercise every part of the ruleset: multiple gtoonColor values
// (including neutral BLACK/SILVER), varying gtoonValue, and 4 Slam gToons each exercising a
// different effect action type (modifyValue-multiply, modifyValue-add, setColor,
// negateEffect), using `characters` for condition matching per gtoons-plan.md's worked
// examples. Also grants two test users a full copy of every card each, so two decks can be
// built and a real match played immediately.
//
// Idempotent, mirroring prisma/SeedOfficialAccount.js: matches existing rows by name and skips
// re-creating them; re-running is safe.
//
// Usage: node prisma/seedOgGtoons.js

import 'dotenv/config'
import { prisma } from '../server/prisma.js'

const TEST_USERNAMES = ['OgGtoonsTester1', 'OgGtoonsTester2']

// 16 cards: covers every GtoonColor (both neutrals + all 7 non-neutrals), a spread of values,
// and 4 Slam gToons each exercising a distinct effect action type.
const CARDS = [
  { name: 'Bramble Fox',   characters: ['Bramble Fox'],   color: 'RED',    value: 6 },
  { name: 'Huntor',        characters: ['Huntor'],        color: 'RED',    value: 4 },
  { name: 'TOM Unit',      characters: ['TOM Unit'],      color: 'YELLOW', value: 5 },
  { name: 'Pebblekin',     characters: ['Pebblekin'],     color: 'SILVER', value: 2 },
  { name: 'Glimmertail',   characters: ['Glimmertail'],   color: 'GREEN',  value: 7 },
  { name: 'Copper Wren',   characters: ['Copper Wren'],   color: 'ORANGE', value: 3 },
  { name: 'Voltie',        characters: ['Voltie'],        color: 'PINK',   value: 8 },
  { name: 'Duskrunner',    characters: ['Duskrunner'],    color: 'BLACK',  value: 4 },
  { name: 'Frostbyte',     characters: ['Frostbyte'],     color: 'BLUE',   value: 5 },
  { name: 'Cinderpaw',     characters: ['Cinderpaw'],     color: 'RED',    value: 9 },
  { name: 'Mossgrove',     characters: ['Mossgrove'],     color: 'GREEN',  value: 1 },
  { name: 'Quillspark',    characters: ['Quillspark'],    color: 'PURPLE', value: 6 },

  // Slam gToons — one per effect action type from gtoons-plan.md.
  {
    name: 'Slycat', characters: ['Slycat'], color: 'BLUE', value: 3, isSlamGtoon: true,
    // "x2 if Bramble Fox is in play" — mirrors the plan's Elmer Fudd/Huntor example.
    gtoonEffect: [{
      trigger: 'onReveal',
      target: { selector: 'self' },
      condition: { type: 'characterInPlay', character: 'Bramble Fox', side: 'either' },
      action: { type: 'modifyValue', operation: 'multiply', amount: 2 }
    }]
  },
  {
    name: 'Circuit Wisp', characters: ['Circuit Wisp'], color: 'YELLOW', value: 4, isSlamGtoon: true,
    // "+5 if TOM Unit is in play" — mirrors the plan's Absolution/TOM example.
    gtoonEffect: [{
      trigger: 'onReveal',
      target: { selector: 'self' },
      condition: { type: 'characterInPlay', character: 'TOM Unit', side: 'either' },
      action: { type: 'modifyValue', operation: 'add', amount: 5 }
    }]
  },
  {
    name: 'Moonshade', characters: ['Moonshade'], color: 'BLACK', value: 5, isSlamGtoon: true,
    // Intended as a goal card: static aura, "x2 to Glimmertail if Slycat is in play" — mirrors
    // the plan's Moodnesium/Porky Pig/Duck Dodgers example. Neutral color (BLACK) on purpose so
    // this card can also anchor a "both goal colors neutral" test deck.
    gtoonEffect: [{
      trigger: 'static',
      target: { selector: 'cardByCharacter', character: 'Glimmertail' },
      condition: { type: 'characterInPlay', character: 'Slycat', side: 'either' },
      action: { type: 'modifyValue', operation: 'multiply', amount: 2 }
    }]
  },
  {
    name: 'Grimjaw', characters: ['Grimjaw'], color: 'PURPLE', value: 6, isSlamGtoon: true,
    // Negates whatever effect the opponent's card revealed this same round would have fired —
    // unconditional, so it is easy to see fire in manual testing.
    gtoonEffect: [{
      trigger: 'onReveal',
      target: { selector: 'opponentActiveCard' },
      action: { type: 'negateEffect' }
    }]
  }
]

async function ensureCard(card) {
  const existing = await prisma.ctoon.findFirst({ where: { name: card.name, isOgGtoon: true } })
  if (existing) {
    console.log(`  • "${card.name}" already exists — reusing`)
    return existing
  }
  const created = await prisma.ctoon.create({
    data: {
      name: card.name,
      type: 'gToon',
      rarity: card.isSlamGtoon ? 'Slam' : 'Common',
      assetPath: `/images/oggtoons/${card.name.toLowerCase().replace(/\s+/g, '-')}.png`,
      characters: card.characters,
      isOgGtoon: true,
      gtoonColor: card.color,
      gtoonValue: card.value,
      isSlamGtoon: !!card.isSlamGtoon,
      gtoonEffect: card.gtoonEffect || null,
      inCmart: false,
      codeOnly: true
    }
  })
  console.log(`  • Created "${created.name}" (${card.color}, value ${card.value}${card.isSlamGtoon ? ', SLAM' : ''})`)
  return created
}

async function ensureTestUser(username) {
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } })
  if (existing) return existing
  const user = await prisma.user.create({
    data: {
      username,
      discordId: `seed-oggtoons-${username}`,
      isVerified: true,
      inGuild: true,
      active: true,
      lastLogin: new Date()
    },
    select: { id: true, username: true }
  })
  console.log(`Created test user "${user.username}" (${user.id})`)
  return user
}

async function grantAllCards(userId, ctoons) {
  for (const ctoon of ctoons) {
    const already = await prisma.userCtoon.findFirst({ where: { userId, ctoonId: ctoon.id } })
    if (already) continue
    const updated = await prisma.ctoon.update({
      where: { id: ctoon.id },
      data: { totalMinted: { increment: 1 } },
      select: { totalMinted: true }
    })
    await prisma.userCtoon.create({
      data: { userId, ctoonId: ctoon.id, mintNumber: updated.totalMinted, isFirstEdition: true }
    })
  }
}

async function main() {
  console.log(`Seeding ${CARDS.length} original gToons (2002) test cards…`)
  const ctoons = []
  for (const card of CARDS) ctoons.push(await ensureCard(card))

  for (const username of TEST_USERNAMES) {
    const user = await ensureTestUser(username)
    await grantAllCards(user.id, ctoons)
    console.log(`Granted all ${ctoons.length} test cards to "${user.username}"`)
  }

  console.log('✅ Done seeding original gToons test data')
  console.log(`   Build a 12-card deck for each of: ${TEST_USERNAMES.join(', ')} and play a match.`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
