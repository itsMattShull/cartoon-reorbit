import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  encodeUserCtoonId,
  isSyntheticUserCtoonId,
  parseUserCtoonToken,
  userCtoonRowKey,
  groupTokensByUser
} from '../server/utils/userCtoonToken.js'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CTOON = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── parseUserCtoonToken ───────────────────────────────────────────
// Resolution used to run one query per reference, so a malformed token produced
// one broken query and nothing worse. Batched, every token contributes a branch
// to a single `where`, and Prisma drops undefined-valued keys — so a branch
// built from a token with missing segments collapses to `{ burnedAt: null }`
// and matches the entire table. These tests exist to keep that impossible.

test('a well-formed token round-trips through encode', () => {
  assert.deepEqual(parseUserCtoonToken(encodeUserCtoonId(USER, CTOON, 7)), {
    userId: USER, ctoonId: CTOON, mintNumber: 7
  })
  assert.deepEqual(parseUserCtoonToken(encodeUserCtoonId(USER, CTOON, null)), {
    userId: USER, ctoonId: CTOON, mintNumber: null
  })
})

test('a token with a missing or extra segment is rejected outright', () => {
  // Never partially parsed: an undefined segment must not reach a query.
  for (const bad of ['uc', 'uc|', `uc|${USER}`, `uc|${USER}|${CTOON}`, `uc|${USER}|${CTOON}|1|2`]) {
    assert.equal(parseUserCtoonToken(bad), null, `expected ${bad} to be rejected`)
  }
})

test('a token with an empty segment is rejected', () => {
  for (const bad of [`uc||${CTOON}|1`, `uc|${USER}||1`, `uc|${USER}|${CTOON}|`]) {
    assert.equal(parseUserCtoonToken(bad), null, `expected ${bad} to be rejected`)
  }
})

test('mint aliases that parseInt would accept are rejected', () => {
  // parseInt reads every one of these as 1, which would give six spellings of
  // one cToon. They survive the string-level dedupe in normalizeCtoonIdList and
  // would collide only at the unique constraint, rolling back the whole
  // transaction with an opaque P2002 after all the insert work was done.
  for (const mint of ['01', '1e5', '1.9', '+1', ' 1', '1abc', '-1', 'y', '']) {
    assert.equal(
      parseUserCtoonToken(`uc|${USER}|${CTOON}|${mint}`), null,
      `expected mint ${JSON.stringify(mint)} to be rejected`
    )
  }
  // 'x' is the encoding for "no mint number", and plain digits are fine.
  assert.equal(parseUserCtoonToken(`uc|${USER}|${CTOON}|x`).mintNumber, null)
  assert.equal(parseUserCtoonToken(`uc|${USER}|${CTOON}|0`).mintNumber, 0)
  assert.equal(parseUserCtoonToken(`uc|${USER}|${CTOON}|10`).mintNumber, 10)
})

test('non-synthetic references are not tokens', () => {
  for (const raw of ['11111111-1111-4111-8111-111111111111', '', null, undefined, 42, {}, []]) {
    assert.equal(parseUserCtoonToken(raw), null)
    assert.equal(isSyntheticUserCtoonId(raw), false)
  }
  assert.equal(isSyntheticUserCtoonId(`uc|${USER}|${CTOON}|1`), true)
})

// ── userCtoonRowKey ───────────────────────────────────────────────

test('the row key includes the owner', () => {
  // @@unique([ctoonId, mintNumber]) makes the pair globally unique, so keying on
  // it alone would resolve — and would silently discard the only part of the
  // token tying it to a claimed owner, which callers with no ownership check of
  // their own (valuations, modal) rely on.
  assert.notEqual(
    userCtoonRowKey(USER, CTOON, 1),
    userCtoonRowKey('cccccccc-cccc-4ccc-8ccc-cccccccccccc', CTOON, 1)
  )
})

test('a null mint keys the same way it encodes', () => {
  assert.equal(userCtoonRowKey(USER, CTOON, null), `${USER}|${CTOON}|x`)
  assert.equal(userCtoonRowKey(USER, CTOON, undefined), `${USER}|${CTOON}|x`)
  // A row with mint 0 must not collide with a row that has no mint at all.
  assert.notEqual(userCtoonRowKey(USER, CTOON, 0), userCtoonRowKey(USER, CTOON, null))
})

test('a parsed token and the row it matches produce the same key', () => {
  const token = parseUserCtoonToken(encodeUserCtoonId(USER, CTOON, null))
  const row = { userId: USER, ctoonId: CTOON, mintNumber: null }
  assert.equal(
    userCtoonRowKey(token.userId, token.ctoonId, token.mintNumber),
    userCtoonRowKey(row.userId, row.ctoonId, row.mintNumber)
  )
})

// ── groupTokensByUser ─────────────────────────────────────────────

test('tokens collapse to one branch per owner', () => {
  // A trade names at most two owners, so 250 cToons a side has to become two
  // index-driven branches rather than 250.
  const groups = groupTokensByUser([
    { userId: 'u1', ctoonId: 'c1', mintNumber: 1 },
    { userId: 'u1', ctoonId: 'c2', mintNumber: null },
    { userId: 'u1', ctoonId: 'c1', mintNumber: 2 },
    { userId: 'u2', ctoonId: 'c3', mintNumber: 1 }
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.find(g => g.userId === 'u1').ctoonIds, ['c1', 'c2'])
  assert.deepEqual(groups.find(g => g.userId === 'u2').ctoonIds, ['c3'])
})

test('grouping an empty list yields no branches', () => {
  // An empty OR array would match everything, so the caller must skip the query
  // entirely — this asserts the shape that makes that check possible.
  assert.deepEqual(groupTokensByUser([]), [])
})
