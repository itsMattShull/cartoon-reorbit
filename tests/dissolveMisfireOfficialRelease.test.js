import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Source-text checks for the audit/remediation wiring (same approach as
// dissolveMisfireRemediationActiveAuction.test.js — those modules import the Prisma client).
const __dirname = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(__dirname, '../server/utils', f), 'utf8')
const auditSrc = read('dissolveMisfireAudit.js')
const remediationSrc = read('dissolveMisfireRemediation.js')

// The helper is pure, so extract and run it directly.
const helperSrc = read('dissolveMisfire.js')
const m = helperSrc.match(/export function findLastOfficialHoldIndex[\s\S]*?\n}\n/)
const DISSOLVE_METHODS = ['DISSOLVE', 'DISSOLVE_INACTIVE']
const findLastOfficialHoldIndex = new Function('DISSOLVE_METHODS', m[0].replace('export ', '') + '; return findLastOfficialHoldIndex')(DISSOLVE_METHODS)

test('release event is found for dissolves and for direct grants to official', () => {
  const grant = [{ userId: 'off', method: 'ADMIN_GRANT' }, { userId: 'u1', method: 'AUCTION' }, { userId: 'u2', method: 'AUCTION' }]
  assert.equal(findLastOfficialHoldIndex(grant, 'off'), 0)
  const dissolved = [{ userId: 'x', method: 'MINT' }, { userId: 'off', method: 'DISSOLVE' }, { userId: 'u1', method: 'AUCTION' }]
  assert.equal(findLastOfficialHoldIndex(dissolved, 'off'), 1)
  assert.equal(findLastOfficialHoldIndex([{ userId: 'u1', method: 'MINT' }], 'off'), -1)
})

test('the scan accepts any official-held release, not only DISSOLVE', () => {
  assert.match(auditSrc, /findOfficialReleaseBefore/)
  assert.doesNotMatch(auditSrc, /hasDissolveEventBefore/)
  assert.match(auditSrc, /releaseMethod/)
})

test('remediation anchors on the last official-held row instead of requiring a dissolve', () => {
  assert.match(remediationSrc, /findLastOfficialHoldIndex\(history/)
  assert.doesNotMatch(remediationSrc, /No DISSOLVE ownership event found/)
})
