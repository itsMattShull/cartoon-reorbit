import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isTruthy,
  firstQueryValue,
  parseExclusions,
  buildExclusionSql,
  exclusionCacheKey,
  hasExclusions,
  buildNamePattern,
  buildSearchWhereSql,
  resolveBrowseSort,
  isValidBrowseSort,
  isVolumeSort,
  BROWSE_SORT_KEYS,
  DEFAULT_BROWSE_SORT
} from '../server/utils/economyFilters.js'

test('isTruthy accepts the app\'s flag spellings and nothing else', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', ' Yes ']) {
    assert.equal(isTruthy(v), true, `expected ${JSON.stringify(v)} to be truthy`)
  }
  for (const v of ['0', 'false', 'no', '', 'nope', undefined, null, 1, true, {}, []]) {
    assert.equal(isTruthy(v), false, `expected ${JSON.stringify(v)} to be falsy`)
  }
})

test('firstQueryValue survives repeated params without throwing', () => {
  assert.equal(firstQueryValue({ q: 'bugs' }, 'q'), 'bugs')
  assert.equal(firstQueryValue({ q: ['bugs', 'daffy'] }, 'q'), 'bugs')
  assert.equal(firstQueryValue({}, 'q'), undefined)
  assert.equal(firstQueryValue({ q: 7 }, 'q'), undefined)
  assert.equal(firstQueryValue(undefined, 'q'), undefined)
})

test('parseExclusions handles arrays and non-strings without bypassing the filter', () => {
  assert.deepEqual(parseExclusions({ hideGtoons: '1', hidePokemon: 'true' }), {
    hideGtoons: true,
    hidePokemon: true
  })
  // A repeated param must not silently disable the filter the user asked for.
  assert.deepEqual(parseExclusions({ hideGtoons: ['1', '1'] }), {
    hideGtoons: true,
    hidePokemon: false
  })
  assert.deepEqual(parseExclusions({ hideGtoons: {}, hidePokemon: [] }), {
    hideGtoons: false,
    hidePokemon: false
  })
  assert.deepEqual(parseExclusions({}), { hideGtoons: false, hidePokemon: false })
})

test('exclusionCacheKey is one of four constants and never collides', () => {
  const keys = [
    exclusionCacheKey({ hideGtoons: false, hidePokemon: false }),
    exclusionCacheKey({ hideGtoons: false, hidePokemon: true }),
    exclusionCacheKey({ hideGtoons: true, hidePokemon: false }),
    exclusionCacheKey({ hideGtoons: true, hidePokemon: true })
  ]
  assert.equal(new Set(keys).size, 4)
  for (const k of keys) assert.match(k, /^g[01]p[01]$/)
  // A collision here would serve Pokemon-filtered data to a gToon-filtered request.
  assert.notEqual(keys[1], keys[2])
})

test('exclusionCacheKey cannot be shaped by a request value', () => {
  // Anything non-boolean-true must fall into the "off" slot rather than reach
  // the key string — Economy shares a Redis namespace with the aggregation
  // freshness flag and the per-user rate-limit counters.
  const key = exclusionCacheKey({ hideGtoons: 'economy:aggregate:fresh', hidePokemon: '1' })
  assert.equal(key, 'g0p0')
})

test('hasExclusions only reports real booleans', () => {
  assert.equal(hasExclusions({ hideGtoons: false, hidePokemon: false }), false)
  assert.equal(hasExclusions({ hideGtoons: true, hidePokemon: false }), true)
  assert.equal(hasExclusions({ hideGtoons: 'true', hidePokemon: 'true' }), false)
})

test('buildExclusionSql parameterises the series list and keeps NULL series visible', () => {
  const none = buildExclusionSql({ hideGtoons: false, hidePokemon: false })
  assert.equal(none.strings.join(''), '')
  assert.deepEqual(none.values, [])

  const gtoons = buildExclusionSql({ hideGtoons: true, hidePokemon: false })
  assert.match(gtoons.strings.join('?'), /"isGtoon" = false/)
  assert.deepEqual(gtoons.values, [])

  const pokemon = buildExclusionSql({ hideGtoons: false, hidePokemon: true })
  const sql = pokemon.strings.join('?')
  // COALESCE keeps NULL-series cToons in the result; a bare `<>` would drop them.
  assert.match(sql, /COALESCE\(LOWER\(BTRIM\(c\."series"\)\), ''\)/)
  assert.match(sql, /<> ALL/)
  // The alias list is bound, never inlined.
  assert.ok(pokemon.values.includes('pokemon'))

  const both = buildExclusionSql({ hideGtoons: true, hidePokemon: true })
  assert.match(both.strings.join('?'), /"isGtoon" = false/)
  assert.match(both.strings.join('?'), /BTRIM/)
})

test('buildNamePattern escapes LIKE metacharacters', () => {
  assert.equal(buildNamePattern('bugs'), '%bugs%')
  // Unescaped, `%` would match every cToon and `_` every single character.
  assert.equal(buildNamePattern('%'), '%!%%')
  assert.equal(buildNamePattern('_'), '%!_%')
  // The escape character itself must be escaped, or a trailing `!` would eat
  // the closing wildcard.
  assert.equal(buildNamePattern('!'), '%!!%')
  assert.equal(buildNamePattern('50%_off'), '%50!%!_off%')
})

test('buildSearchWhereSql binds the search term rather than inlining it', () => {
  const empty = buildSearchWhereSql('', { hideGtoons: false, hidePokemon: false })
  assert.match(empty.strings.join('?'), /WHERE TRUE/)
  assert.deepEqual(empty.values, [])

  const injected = "'; DROP TABLE \"Ctoon\"; --"
  const withQ = buildSearchWhereSql(injected, { hideGtoons: false, hidePokemon: false })
  assert.deepEqual(withQ.values, [`%${injected}%`])
  assert.ok(!withQ.strings.join('?').includes('DROP TABLE'))
  assert.match(withQ.strings.join('?'), /ILIKE .* ESCAPE '!'/s)
})

test('browse sort whitelist rejects anything not defined', () => {
  for (const key of BROWSE_SORT_KEYS) assert.equal(isValidBrowseSort(key), true)
  for (const bad of ['', 'volume', 'name; DROP TABLE "Ctoon"', undefined, null, 'constructor', '__proto__', 'toString']) {
    assert.equal(isValidBrowseSort(bad), false, `expected ${JSON.stringify(bad)} to be rejected`)
  }
})

test('resolveBrowseSort falls back to the default instead of reaching SQL', () => {
  const resolved = resolveBrowseSort('ORDER BY 1; DROP TABLE "Ctoon"')
  assert.equal(resolved.key, DEFAULT_BROWSE_SORT)
  assert.equal(resolved.volumeSource, null)
  assert.deepEqual(resolved.orderBy.values, [])
})

test('every sort ends in a unique-column tiebreaker so pagination is stable', () => {
  for (const key of BROWSE_SORT_KEYS) {
    const { orderBy } = resolveBrowseSort(key)
    const sql = orderBy.strings.join('?')
    assert.match(sql, /c\."id" ASC\s*$/, `${key} is missing the c."id" tiebreaker`)
    assert.deepEqual(orderBy.values, [], `${key} should not bind values into ORDER BY`)
  }
})

test('release-date sorts order by the same value the API returns', () => {
  for (const key of ['releaseDesc', 'releaseAsc']) {
    const sql = resolveBrowseSort(key).orderBy.strings.join('?')
    // The endpoint returns `releaseDate || createdAt`; ordering on releaseDate
    // alone would clump every NULL-releaseDate cToon at one end.
    assert.match(sql, /COALESCE\(c\."releaseDate", c\."createdAt"\)/)
  }
})

test('volume sorts are descending-only and resolve to a fixed source', () => {
  assert.equal(resolveBrowseSort('tradeVolume').volumeSource, 'TRADE')
  assert.equal(resolveBrowseSort('auctionVolume').volumeSource, 'AUCTION')
  assert.equal(isVolumeSort('tradeVolume'), true)
  assert.equal(isVolumeSort('nameAsc'), false)
  // An ascending volume sort would surface every single-transaction cToon on
  // page one — the exact disclosure MIN_SAMPLE_SIZE exists to prevent.
  for (const key of BROWSE_SORT_KEYS) {
    if (!isVolumeSort(key)) continue
    assert.match(resolveBrowseSort(key).orderBy.strings.join('?'), /"rankVolume" DESC/)
  }
})
