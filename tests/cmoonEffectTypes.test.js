import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { CMOON_EFFECT_TYPES } from '../utils/cmoonEffectTypes.js'

// server/utils/cmoon.js (the server-side allow-list) and composables/useFullscreenEffect.js (the
// client-side player) both import CMOON_EFFECT_TYPES from utils/cmoonEffectTypes.js directly, so
// those two can never drift from each other. The one place that still can't share that import —
// prisma/schema.prisma's `enum CMoonEffectType` is its own file format, not JS — is checked here
// instead, by parsing the enum block out of the schema text. Deliberately doesn't import
// server/utils/cmoon.js itself: that module eagerly constructs BullMQ Queue instances on import
// (server/utils/queues.js), which is unnecessary weight/risk for a plain `node --test` run.
const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '../prisma/schema.prisma')

test('CMOON_EFFECT_TYPES matches the CMoonEffectType enum in prisma/schema.prisma', () => {
  const schema = readFileSync(schemaPath, 'utf8')
  const match = schema.match(/enum\s+CMoonEffectType\s*\{([^}]*)\}/)
  assert.ok(match, 'CMoonEffectType enum not found in prisma/schema.prisma')

  const schemaValues = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  assert.deepEqual(
    [...schemaValues].sort(),
    [...CMOON_EFFECT_TYPES].sort(),
    'utils/cmoonEffectTypes.js has drifted from the CMoonEffectType enum in prisma/schema.prisma',
  )
})

test('CMOON_EFFECT_TYPES has no duplicate or empty entries', () => {
  assert.equal(new Set(CMOON_EFFECT_TYPES).size, CMOON_EFFECT_TYPES.length)
  for (const v of CMOON_EFFECT_TYPES) assert.ok(v && typeof v === 'string')
})
