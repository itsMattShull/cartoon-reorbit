import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Read as text rather than imported — dissolveMisfireRemediation.js pulls in the Prisma client,
// which this suite must not connect. Same approach as dissolveAuctionLaunchOwnershipCheck.test.js.
const __dirname = dirname(fileURLToPath(import.meta.url))
const remediationSrc = readFileSync(join(__dirname, '../server/utils/dissolveMisfireRemediation.js'), 'utf8')
const auditSrc = readFileSync(join(__dirname, '../server/utils/dissolveMisfireAudit.js'), 'utf8')

test('"owner already correct" does not short-circuit while the bogus auction is still ACTIVE', () => {
  // The auction-close worker moves the cToon to the top bidder regardless of who owns it then, so
  // resolving as "already correct" without cancelling the auction lets the misfire complete anyway.
  const start = remediationSrc.indexOf('currentOwnerId === originalWinner.userId')
  assert.ok(start > -1, 'the owner-matches branch is missing — has computeRemediationPlan been restructured?')
  const branch = remediationSrc.slice(start, remediationSrc.indexOf('const compensationMap', start))
  assert.match(branch, /misfire\.bogusAuctionId/, 'must look for this misfire\'s own bogus auction')
  assert.match(branch, /restoreItem:\s*false/, 'must return a cancel-only plan when that auction is still live')
  assert.match(branch, /cancelAuctions:\s*\[/, 'the cancel-only plan must actually cancel the bogus auction')
})

test('a misfire detected while ACTIVE still gets the exact refund once its auction has closed', () => {
  assert.match(remediationSrc, /bogusAuctionRow\?\.status === 'CLOSED'/, 'wrong winner must be derived from the live auction')
  assert.doesNotMatch(remediationSrc, /misfire\.wrongWinnerUserId\s*&&/, 'compensation must not rely only on the stale logged snapshot')
})

test('the scan re-opens rows that were closed out as alreadyCorrect before their auction sold', () => {
  assert.match(auditSrc, /resolutionSummary\?\.alreadyCorrect/)
  assert.match(auditSrc, /resolvedAt:\s*null/)
})
