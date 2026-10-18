// tests/helpers/ogGtoonCsv.js
//
// Loads the archive CSV that prisma/createOgGtoonsFromCsv.js imports and returns ctoon-shaped rows
// ({ id, name, gtoonColor, gtoonValue, ... }), so tests can build the same cards the database holds
// without a database. Mirrors that script's field mapping (it cannot be imported: it runs on load).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { OG_GTOON_POWER_CATALOG } from '../../server/utils/ogGtoonPowerCatalog.js'

const CSV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'prisma', 'ogGtoonsData', 'gtoons-cards.csv')

const GROUPS = {
  'Bean Scouts': 'BEAN_SCOUTS', 'Daily Planet': 'DAILY_PLANET', 'G.L.O.B.A.L.': 'GLOBAL',
  'Imaginary Friend': 'IMAGINARY_FRIEND', 'Injustice Gang': 'INJUSTICE_GANG', 'Justice Friends': 'JUSTICE_FRIENDS',
  'Justice League': 'JUSTICE_LEAGUE', 'Mucha Lucha': 'MUCHA_LUCHA', 'Mystery, Inc.': 'MYSTERY_INC',
  'Powerpuff Girls': 'POWERPUFF_GIRLS', 'Squirrel Scouts': 'SQUIRREL_SCOUTS', 'Teen Titans': 'TEEN_TITANS',
  'Time Squad': 'TIME_SQUAD', 'WOOHP': 'WOOHP'
}

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row) }
  const header = rows.shift().map(h => h.replace(/^﻿/, '').trim())
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const catalog = new Map(OG_GTOON_POWER_CATALOG.map(e => [e.description, e]))

/** Every imported original gToon, keyed by name, shaped like the Ctoon rows the game loads. */
export function loadOgGtoonCtoons() {
  const byName = new Map()
  for (const r of parseCsv(readFileSync(CSV, 'utf8'))) {
    const power = r['Power Description']
    const entry = power && !/^no power$/i.test(power) ? catalog.get(power) : null
    const types = ['Type 1', 'Type 2', 'Type 3'].map(k => r[k].toUpperCase() || null)
    byName.set(r['Name'], {
      id: `csv:${r['Name']}`,
      name: r['Name'],
      assetPath: `/cards/${r['Name']}.png`,
      characters: [r['Character'] || r['Name']],
      rarity: r['Rarity'] || 'Common', // the import script's fallback for the one blank row
      isOgGtoon: true,
      gtoonColor: r['Color'].toUpperCase(),
      gtoonValue: parseInt(r['Points'], 10),
      gtoonType1: types[0], gtoonType2: types[1], gtoonType3: types[2],
      gtoonGroup: r['Group'] ? GROUPS[r['Group']] : null,
      isSlamGtoon: !!(entry && entry.effect.length),
      gtoonEffect: entry && entry.effect.length ? entry.effect : null,
      gtoonCardStyle: null
    })
  }
  return byName
}
