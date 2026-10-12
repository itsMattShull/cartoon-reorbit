import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const cronParser = require('cron-parser')

// jobs.js is pure data and cronHealth.js is a pure function, so both import without Prisma/Redis.
const { CRON_JOBS, TIER_CRITICAL, TIER_MAINTENANCE, jobsForTier } = await import(join(root, 'server/cron/jobs.js'))
const { computeJobHealth } = await import(join(root, 'server/utils/cronHealth.js'))

test('job names are unique and every job has the required fields', () => {
  const seen = new Set()
  for (const j of CRON_JOBS) {
    assert.ok(!seen.has(j.name), `duplicate job ${j.name}`)
    seen.add(j.name)
    assert.ok([TIER_CRITICAL, TIER_MAINTENANCE].includes(j.tier), `${j.name}: bad tier ${j.tier}`)
    assert.equal(typeof j.pattern, 'string')
    assert.ok(Number.isFinite(j.intervalSec) && j.intervalSec > 0, `${j.name}: intervalSec`)
    assert.ok(j.description && j.description.length > 0, `${j.name}: description`)
  }
  assert.ok(jobsForTier(TIER_CRITICAL).length > 0)
  assert.ok(jobsForTier(TIER_MAINTENANCE).length > 0)
})

test('every cron pattern parses (with its timezone) and fires in the future', () => {
  for (const j of CRON_JOBS) {
    const it = cronParser.parseExpression(j.pattern, { tz: j.tz })
    assert.ok(it.next().getTime() > Date.now() - 1000, `${j.name}: ${j.pattern}`)
  }
})

test('JOB_HANDLERS and the registry list exactly the same jobs', () => {
  const src = readFileSync(join(root, 'server/cron/jobHandlers.js'), 'utf8')
  const block = src.slice(src.indexOf('export const JOB_HANDLERS = {'))
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('\n}'))
  const keys = body.split('\n')
    .map(l => l.trim().replace(/,$/, ''))
    .filter(Boolean)
    .map(l => l.split(':')[0].trim())
  assert.deepEqual([...keys].sort(), CRON_JOBS.map(j => j.name).sort())
})

test('the old single-process cron entry point is gone from the process config', () => {
  const eco = readFileSync(join(root, 'ecosystem.config.cjs'), 'utf8')
  assert.ok(!eco.includes("sync-guild-members"), 'ecosystem still references sync-guild-members.js')
  assert.ok(eco.includes("'cron-critical'") && eco.includes("'cron-maintenance'"))
})

test('computeJobHealth labels never / ok / late / failing / running / stuck', () => {
  const job = { intervalSec: 300 }
  const now = Date.parse('2026-10-12T12:00:00Z')
  const ago = (sec) => new Date(now - sec * 1000)

  assert.equal(computeJobHealth(job, null, now), 'never')
  assert.equal(computeJobHealth(job, { lastStartedAt: ago(60), lastSuccessAt: ago(60), lastStatus: 'SUCCESS' }, now), 'ok')
  // 2x interval (600s) + 120s grace = 720s
  assert.equal(computeJobHealth(job, { lastStartedAt: ago(100), lastSuccessAt: ago(800), lastStatus: 'SKIPPED' }, now), 'late')
  assert.equal(computeJobHealth(job, { lastStartedAt: ago(10), lastSuccessAt: ago(100), lastStatus: 'FAILED' }, now), 'failing')
  assert.equal(computeJobHealth(job, { lastStartedAt: ago(30), lastSuccessAt: ago(100), lastStatus: 'RUNNING' }, now), 'running')
  assert.equal(computeJobHealth(job, { lastStartedAt: ago(4 * 3600), lastSuccessAt: ago(5 * 3600), lastStatus: 'RUNNING' }, now), 'stuck')
  // never succeeded but has run (and was skipped every time) is late, not ok
  assert.equal(computeJobHealth(job, { lastStartedAt: ago(10), lastSuccessAt: null, lastStatus: 'SKIPPED' }, now), 'late')
})
