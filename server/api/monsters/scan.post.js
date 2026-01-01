// server/api/barcode/scan.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { createHmac, randomBytes } from 'node:crypto'

// ---- helpers ----

function canonicalKey(format, rawValue) {
  const fmt = String(format || '').toLowerCase().trim()
  const raw = String(rawValue || '').trim()
  const looksNumeric = /^[0-9\s-]+$/.test(raw)
  const normalized = looksNumeric ? raw.replace(/[^0-9]/g, '') : raw
  return `${fmt}:${normalized}`
}

function hmacHex(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex')
}

function hexToU32(hex, offset) {
  return (parseInt(hex.slice(offset, offset + 8), 16) >>> 0)
}

function u32ToUnitFloat(u32) {
  return u32 / 4294967296 // 0 <= x < 1
}

function normalizeOdds(nothing, item, monster, battle) {
  const n = Number(nothing) || 0
  const i = Number(item) || 0
  const m = Number(monster) || 0
  const b = Number(battle) || 0
  const sum = n + i + m + b
  if (sum <= 0) return { nothing: 0.2, item: 0.3, monster: 0.5, battle: 0.0 }
  return { nothing: n / sum, item: i / sum, monster: m / sum, battle: b / sum }
}

function pickOutcome(r01, odds) {
  if (r01 < odds.nothing) return 'NOTHING'
  if (r01 < odds.nothing + odds.item) return 'ITEM'
  if (r01 < odds.nothing + odds.item + odds.monster) return 'MONSTER'
  return 'BATTLE'
}

function buildRarityThresholds(chancesJson, availability = {}, order = ['CRAZY_RARE', 'VERY_RARE', 'RARE', 'UNCOMMON', 'COMMON']) {
  const c = chancesJson || {}

  function pickVal(obj, key, altTitle) {
    // Accept both TitleCase and UPPER_SNAKE variants
    return Number(obj[altTitle] ?? obj[key]) || 0
  }

  // Build raw weights and zero-out any rarity that has no available rows
  const weights = {}
  for (const k of order) {
    let altTitle
    if (k === 'CRAZY_RARE') altTitle = 'CrazyRare'
    else if (k === 'VERY_RARE') altTitle = 'VeryRare'
    else if (k === 'UNCOMMON') altTitle = 'Uncommon'
    else if (k === 'COMMON') altTitle = 'Common'
    else altTitle = 'Rare'

    const base = pickVal(c, k, altTitle)
    const available = (availability[k] ?? 0) > 0
    weights[k] = available ? base : 0
  }

  let sum = order.reduce((s, k) => s + (Number(weights[k]) || 0), 0)
  const thresholds = []

  // If all weights are zero (e.g., no configured weights), spread uniformly across available rarities
  if (sum <= 0) {
    const availOrder = order.filter(k => (availability[k] ?? 0) > 0)
    const n = availOrder.length
    if (n === 0) {
      // Fallback: at least return a single bucket to avoid empty thresholds
      return [{ rarity: order[order.length - 1], t: 1.0 }]
    }
    let acc = 0
    for (let i = 0; i < n; i++) {
      acc += 1 / n
      thresholds.push({ rarity: availOrder[i], t: i === n - 1 ? 1.0 : acc })
    }
    return thresholds
  }

  // Normalize positive weights
  let acc = 0
  for (const k of order) {
    const w = Number(weights[k]) || 0
    if (w <= 0) continue
    acc += w / sum
    thresholds.push({ rarity: k, t: acc })
  }
  if (thresholds.length) thresholds[thresholds.length - 1].t = 1.0
  return thresholds
}

function pickRarity(r01, thresholds) {
  for (const { rarity, t } of thresholds) {
    if (r01 < t) return rarity
  }
  return 'COMMON'
}

function rarityToDisplay(r) {
  if (r === 'VERY_RARE') return 'Very Rare'
  if (r === 'CRAZY_RARE') return 'Crazy Rare'
  // COMMON / UNCOMMON / RARE
  return r.charAt(0) + r.slice(1).toLowerCase()
}

function itemToDisplayRarity(r) {
  return r === 'CRAZY_RARE' ? 'Crazy Rare' : (r.charAt(0) + r.slice(1).toLowerCase())
}

function clampVariancePct(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return 0.12
  return Math.max(0, Math.min(x, 0.5)) // cap at ±50%
}

function varyStat(base, rand01, variancePct) {
  const delta = (rand01 * 2 - 1) * variancePct
  const val = Math.round(Number(base) * (1 + delta))
  return Math.max(1, val)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function getChicagoOffsetMinutes(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit'
  })
  const parts = fmt.formatToParts(date)
  const tz = parts.find(p => p.type === 'timeZoneName')?.value || ''
  const match = tz.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/)
  if (match) {
    const hours = Number(match[1])
    const minutes = Number(match[2] || 0)
    return hours * 60 + (hours >= 0 ? minutes : -minutes)
  }
  const shortTz = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
    hour: '2-digit'
  }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value
  if (shortTz === 'CDT') return -300
  if (shortTz === 'CST') return -360
  return 0
}

function chicagoLocalToUtcMs(year, month, day, hour, minute, second) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  let offset = getChicagoOffsetMinutes(new Date(utcGuess))
  let adjusted = utcGuess - offset * 60 * 1000
  const recheckOffset = getChicagoOffsetMinutes(new Date(adjusted))
  if (recheckOffset !== offset) {
    offset = recheckOffset
    adjusted = utcGuess - offset * 60 * 1000
  }
  return adjusted
}

function getChicagoParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = fmt.formatToParts(date)
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

function getDailyScanWindowCst(now = new Date()) {
  const nowParts = getChicagoParts(now)
  const isBeforeCutoff = nowParts.hour < 8
  const startBase = isBeforeCutoff ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now
  const startParts = getChicagoParts(startBase)
  const startMs = chicagoLocalToUtcMs(startParts.year, startParts.month, startParts.day, 8, 0, 0)
  const nextBase = new Date(startBase.getTime() + 24 * 60 * 60 * 1000)
  const nextParts = getChicagoParts(nextBase)
  const endMs = chicagoLocalToUtcMs(nextParts.year, nextParts.month, nextParts.day, 8, 0, 0)
  return {
    start: new Date(startMs),
    resetAt: new Date(endMs),
  }
}

function buildItemResult(itemRow) {
  return {
    type: 'item',
    itemCode: itemRow.code,
    name: itemRow.name,
    rarity: itemToDisplayRarity(itemRow.rarity),
    effect: itemRow.effect || null,
    image: itemRow.itemImage0Path || itemRow.itemImage1Path || itemRow.itemImage2Path || null,
    stat: { power: itemRow.power },
  }
}

// Mapping monster result is a TEMPLATE (no rolled stats)
function buildMonsterTemplate(speciesRow) {
  return {
    type: 'monster',
    speciesIndex: speciesRow.speciesIndex,
    name: speciesRow.name,
    monsterType: speciesRow.type,
    rarityKey: speciesRow.rarity, // enum key
    rarity: rarityToDisplay(speciesRow.rarity),
    standingStillImagePath: speciesRow.standingStillImagePath || null,
    baseStats: {
      hp: speciesRow.baseHp,
      atk: speciesRow.baseAtk,
      def: speciesRow.baseDef,
    },
  }
}

function rollInstanceStats(baseStats, variancePct) {
  const seed = randomBytes(32).toString('hex')

  const hpRand01 = u32ToUnitFloat(hexToU32(seed, 0))
  const atkRand01 = u32ToUnitFloat(hexToU32(seed, 8))
  const defRand01 = u32ToUnitFloat(hexToU32(seed, 16))

  return {
    seed,
    rolled: {
      hp: varyStat(baseStats.hp, hpRand01, variancePct),
      atk: varyStat(baseStats.atk, atkRand01, variancePct),
      def: varyStat(baseStats.def, defRand01, variancePct),
    },
  }
}

// ---- handler ----

export default defineEventHandler(async (event) => {
  // Require an authenticated user (same pattern as your reference)
  let me
  try {
    const cookie = getRequestHeader(event, 'cookie') || ''
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {}
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { format, rawValue } = body || {}

  if (!format || !rawValue) {
    throw createError({ statusCode: 400, statusMessage: 'Missing format/rawValue' })
  }
  if (!process.env.BARCODE_SECRET) {
    throw createError({ statusCode: 500, statusMessage: 'Missing BARCODE_SECRET' })
  }

  // Active config + items + species (uses your NEW model name: BarcodeGameConfig)
  const config = await db.barcodeGameConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { orderBy: { code: 'asc' } },
      species: { orderBy: { speciesIndex: 'asc' } },
    },
  })

  if (!config) throw createError({ statusCode: 500, statusMessage: 'No active BarcodeGameConfig found' })
  // Allow any positive number of items (no longer require exactly 20)
  if (!config.items || config.items.length < 1) {
    throw createError({ statusCode: 500, statusMessage: 'Active config must define at least 1 item' })
  }
  if (!config.species || config.species.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Active config must have at least 1 species' })
  }

  const userId = String(me.id)

  const dailyLimit = Number(config.monsterDailyScanLimit ?? 20)
  const scanPointsValue = Number.isFinite(Number(config.scanPoints))
    ? Math.max(0, Math.floor(Number(config.scanPoints)))
    : 0
  if (Number.isFinite(dailyLimit) && dailyLimit > 0) {
    const { start, resetAt } = getDailyScanWindowCst()
    const scansToday = await db.userBarcodeScan.count({
      where: {
        userId,
        lastScannedAt: { gte: start }
      }
    })
    if (scansToday >= dailyLimit) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Daily scan limit reached.',
        data: { code: 'DailyScanLimit', limit: dailyLimit, resetAt: resetAt.toISOString() }
      })
    }
  }

  const barcodeKey = canonicalKey(format, rawValue)

  // 1) Get or create canonical mapping for this barcode in this config/version
  let mapping = await db.barcodeMapping.findUnique({
    where: { barcodeKey_configId: { barcodeKey, configId: config.id } },
  })

  if (!mapping) {
    const seedHex = hmacHex(process.env.BARCODE_SECRET, `${config.version}:${barcodeKey}`)

    const odds = normalizeOdds(config.oddsNothing, config.oddsItem, config.oddsMonster, config.oddsBattle)
    const outcomeRoll01 = u32ToUnitFloat(hexToU32(seedHex, 0))
    const outcome = pickOutcome(outcomeRoll01, odds) // ScanOutcome enum key

    let result = null

    if (outcome === 'ITEM') {
      // Weighted by item rarity distribution, then uniform among chosen rarity (exclude empty buckets)
      const itemAvailability = {
        CRAZY_RARE: config.items.filter(it => it.rarity === 'CRAZY_RARE').length,
        RARE:       config.items.filter(it => it.rarity === 'RARE').length,
        UNCOMMON:   0,
        VERY_RARE:  0,
        COMMON:     config.items.filter(it => it.rarity === 'COMMON').length,
      }
      const itemOrder = ['CRAZY_RARE', 'RARE', 'COMMON']
      const itemThresholds = buildRarityThresholds(config.itemRarityChances, itemAvailability, itemOrder)
      const rarityRoll01 = u32ToUnitFloat(hexToU32(seedHex, 24))
      const chosenItemRarity = pickRarity(rarityRoll01, itemThresholds) // ItemRarity enum key expected

      let candidates = config.items.filter((it) => it.rarity === chosenItemRarity)
      if (!candidates.length) candidates = config.items // fallback to all
      const idx = hexToU32(seedHex, 32) % candidates.length
      result = buildItemResult(candidates[idx])
    } else if (outcome === 'MONSTER') {
      // Exclude monster rarity buckets that have no species rows
      const monsterAvailability = {
        CRAZY_RARE: config.species.filter(s => s.rarity === 'CRAZY_RARE').length,
        VERY_RARE:  config.species.filter(s => s.rarity === 'VERY_RARE').length,
        RARE:       config.species.filter(s => s.rarity === 'RARE').length,
        UNCOMMON:   config.species.filter(s => s.rarity === 'UNCOMMON').length,
        COMMON:     config.species.filter(s => s.rarity === 'COMMON').length,
      }
      const monsterOrder = ['CRAZY_RARE', 'VERY_RARE', 'RARE', 'UNCOMMON', 'COMMON']
      const thresholds = buildRarityThresholds(config.monsterRarityChances, monsterAvailability, monsterOrder)
      const rarityRoll01 = u32ToUnitFloat(hexToU32(seedHex, 8))
      const chosenRarity = pickRarity(rarityRoll01, thresholds) // MonsterRarity enum key

      const candidates = config.species.filter((s) => s.rarity === chosenRarity)
      const pool = candidates.length ? candidates : config.species

      const speciesPick = hexToU32(seedHex, 16) % pool.length
      const speciesRow = pool[speciesPick]

      result = buildMonsterTemplate(speciesRow)
    } else if (outcome === 'BATTLE') {
      result = { type: 'battle' }
    }

    mapping = await db.barcodeMapping.upsert({
      where: { barcodeKey_configId: { barcodeKey, configId: config.id } },
      create: { barcodeKey, configId: config.id, outcome, result },
      update: {},
    })
  }

  // 2) Enforce cooldown per user per mapping
  const now = new Date()
  const cooldownDays = Math.max(0, Number(config.barcodeCooldownDays ?? 7))
  const scanRecord = await db.userBarcodeScan.findUnique({
    where: { userId_mappingId: { userId, mappingId: mapping.id } },
  })

  const lastScannedAt = scanRecord?.lastScannedAt
  const nextAllowed = lastScannedAt ? addDays(lastScannedAt, cooldownDays) : addDays(now, cooldownDays)
  if (lastScannedAt && cooldownDays > 0 && nextAllowed > now) {
    throw createError({
      statusCode: 429,
      statusMessage: `Barcode on cooldown until ${nextAllowed.toISOString()}`,
      data: { retryAt: nextAllowed.toISOString() },
    })
  }

  // 3) If monster, create a NEW owned instance with per-instance rolled stats
  let ownedMonster = null
  let awardedItem = null
  let scanPointsAwarded = 0

  if (mapping.outcome === 'MONSTER' && mapping.result) {
    const tpl = mapping.result
    const baseStats = tpl.baseStats

    const variancePct = clampVariancePct(config.monsterStatVariancePct)
    const { seed, rolled } = rollInstanceStats(baseStats, variancePct)

    // If this is the user's first monster, flag it as lastSelected = true
    const existingCount = await db.userMonster.count({ where: { userId } })
    const isFirstForUser = existingCount === 0

    ownedMonster = await db.userMonster.create({
      data: {
        userId,
        mappingId: mapping.id,
        configId: config.id,

        speciesIndex: tpl.speciesIndex,
        name: tpl.name,
        monsterType: tpl.monsterType,
        rarity: tpl.rarityKey, // MonsterRarity

        seed,
        hp: rolled.hp,
        maxHealth: rolled.hp,
        atk: rolled.atk,
        def: rolled.def,
        lastSelected: isFirstForUser,
      },
    })
  }
  // 3b) If item, grant an owned item row for the user
  if (mapping.outcome === 'ITEM' && mapping.result) {
    try {
      const itemCode = Number(mapping.result?.itemCode)
      if (Number.isInteger(itemCode)) {
        const itemDef = await db.itemDefinition.findUnique({
          where: { configId_code: { configId: config.id, code: itemCode } },
          select: { id: true }
        })
        if (itemDef) {
          awardedItem = await db.userMonsterItem.create({
            data: { userId, configId: config.id, itemId: itemDef.id, isUsed: false }
          })
        }
      }
    } catch (e) {
      console.warn('Failed to award item to user:', e?.message || e)
    }
  }

  // 4) Record/update scan cooldown (even for item/nothing)
  await db.userBarcodeScan.upsert({
    where: { userId_mappingId: { userId, mappingId: mapping.id } },
    create: {
      userId,
      mappingId: mapping.id,
      configId: config.id,
      lastScannedAt: now,
    },
    update: {
      configId: config.id,
      lastScannedAt: now,
    },
  })

  if (scanPointsValue > 0) {
    const updatedPoints = await db.userPoints.upsert({
      where: { userId },
      update: { points: { increment: scanPointsValue } },
      create: { userId, points: scanPointsValue },
    })
    await db.pointsLog.create({
      data: { userId, points: scanPointsValue, total: updatedPoints.points, method: 'Barcode Scan', direction: 'increase' }
    })
    scanPointsAwarded = scanPointsValue
  }

  let battleInfo = null
  if (mapping.outcome === 'BATTLE') {
    let selected = await db.userMonster.findFirst({
      where: { userId, lastSelected: true },
      select: { id: true }
    })
    if (!selected) {
      const fallback = await db.userMonster.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      })
      if (fallback) {
        await db.userMonster.updateMany({
          where: { userId, lastSelected: true },
          data: { lastSelected: false }
        })
        await db.userMonster.update({
          where: { id: fallback.id },
          data: { lastSelected: true }
        })
        selected = fallback
      }
    }
    battleInfo = {
      type: 'AI',
      monsterId: selected?.id ?? null
    }
  }

  return {
    outcome: mapping.outcome, // MONSTER | ITEM | NOTHING | BATTLE
    result: mapping.result,   // monster template | item payload | null
    mappingId: mapping.id,
    barcodeKey,
    cooldown: {
      days: cooldownDays,
      nextAvailableAt: nextAllowed.toISOString(),
    },
    ownedMonsterId: ownedMonster?.id ?? null,
    ownedStats: ownedMonster ? { hp: ownedMonster.hp, atk: ownedMonster.atk, def: ownedMonster.def } : null,
    awardedItemId: awardedItem?.id ?? null,
    pointsAwarded: scanPointsAwarded,
    battle: battleInfo,
  }
})
