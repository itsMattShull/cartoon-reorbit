// prisma/alt-finder.js
//
// Alt Account Investigator, command line edition. Given a banned account (and
// optionally its already-known alts), ranks other accounts by how much evidence
// says they are the same person.
//
// Usage:
//   node --env-file=.env prisma/alt-finder.js --suspect ZenVikingGuru
//   node --env-file=.env prisma/alt-finder.js --suspect ZenVikingGuru \
//        --known-alts LoopyWarriorWarrior,GalaxyJumperDruid --limit 25
//   node --env-file=.env prisma/alt-finder.js --suspect ZenVikingGuru --json --out ~/report.json
//
// Output is masked by default (no full IPs, no emails, no raw fingerprints).
// The tool refuses to write a report anywhere inside the repository so a
// `git add .` can never publish player identity data.

import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'
import { resolve, sep } from 'path'
import { gatherEvidence } from '../server/utils/altAccountEvidence.js'

const prisma = new PrismaClient()

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const suspect = arg('suspect')
const knownAlts = String(arg('known-alts', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const limit = Number.parseInt(arg('limit', '25'), 10) || 25
const asJson = !!arg('json', false)
const outPath = arg('out', null)
const calibrate = !!arg('calibrate', false)

if (!suspect) {
  console.error('Usage: node --env-file=.env prisma/alt-finder.js --suspect <username> [--known-alts a,b,c] [--limit N] [--json] [--out FILE] [--calibrate]')
  console.error('')
  console.error('  --calibrate  Seed with the suspect ALONE and report where the accounts')
  console.error('               passed via --known-alts actually rank. Use this to check the')
  console.error('               scoring weights against accounts you already know are guilty')
  console.error('               before trusting a number about an account you do not.')
  process.exit(1)
}

// A report is full of player identity evidence. Writing it into the working
// tree is how that ends up on GitHub.
function assertSafeOutputPath(p) {
  const abs = resolve(String(p))
  const repoRoot = resolve(new URL('..', import.meta.url).pathname)
  if (abs === repoRoot || abs.startsWith(repoRoot + sep)) {
    console.error(`\nRefusing to write inside the repository: ${abs}`)
    console.error('Pick a path outside the working tree (e.g. ~/alt-report.json).')
    process.exit(1)
  }
  return abs
}

const TIER_LABEL = {
  compelling: 'COMPELLING',
  strong: 'STRONG',
  possible: 'POSSIBLE',
  weak: 'weak',
  noise: '-'
}

function renderText(report) {
  const lines = []
  const s = report.suspect
  lines.push('')
  lines.push(`Alt Account Investigation — ${s.username}`)
  lines.push('='.repeat(60))
  lines.push(`Banned:            ${s.banned ? 'yes' : 'no'}`)
  lines.push(`Ban recorded:      ${s.banAt ? new Date(s.banAt).toISOString() : 'unknown (no ban note)'}`)
  if (s.banReason) lines.push(`Ban reason:        ${s.banReason}`)
  lines.push(`Seed cluster:      ${[s.username, ...s.knownAlts].join(', ')}`)
  lines.push(`Users on site:     ${report.userCount}`)
  lines.push(`Candidates scored: ${report.candidatesConsidered}`)
  lines.push('')

  lines.push('Evidence coverage for the seed cluster')
  lines.push('-'.repeat(60))
  for (const c of report.coverage) {
    const state = c.available ? `${c.rows} rows` : 'NO DATA — absence here is not exoneration'
    lines.push(`  ${c.label.padEnd(24)} ${state}`)
  }
  lines.push('')

  if (!report.results.length) {
    lines.push('No candidate met the evidence threshold.')
    lines.push('This is a real result: it means the evidence does not support naming anyone.')
    lines.push('')
    return lines.join('\n')
  }

  lines.push(`Ranked candidates (top ${Math.min(limit, report.results.length)} of ${report.results.length})`)
  lines.push('-'.repeat(60))
  for (const [i, r] of report.results.slice(0, limit).entries()) {
    lines.push('')
    lines.push(`${String(i + 1).padStart(2)}. ${r.username}  —  ${r.bits} bits  [${TIER_LABEL[r.tier] || r.tier}]`)
    lines.push(`    channels corroborating: ${r.corroboratingChannels}`)
    lines.push(`    surfaced by: ${r.surfacedBy.join(', ') || 'n/a'}`)
    for (const [channel, data] of Object.entries(r.channels)) {
      lines.push(`    [${channel}] ${data.bits} bits`)
      for (const sig of data.signals) {
        lines.push(`        ${sig.bits >= 0 ? '+' : ''}${sig.bits}  ${sig.label}`)
        if (sig.caveat) lines.push(`               ! ${sig.caveat}`)
      }
    }
  }
  lines.push('')
  lines.push('Bits are log2 likelihood ratios: 20 bits ~ a million to one against coincidence.')
  lines.push('Negative signals argue AGAINST a match. Review evidence before acting.')
  lines.push('')
  return lines.join('\n')
}

/**
 * Calibration: seed with the suspect alone and see where accounts we ALREADY
 * know are alts land in the ranking. If known-guilty accounts don't reach the
 * top tiers, the weights are wrong — and shipping a number about an unknown
 * account would be guesswork dressed up as arithmetic.
 */
function renderCalibration(report, expected) {
  const lines = []
  lines.push('')
  lines.push(`Calibration — seeded with ${report.suspect.username} alone`)
  lines.push('='.repeat(60))
  lines.push(`Scored ${report.candidatesConsidered} candidates.`)
  lines.push('')

  const rankByName = new Map()
  report.results.forEach((r, i) => rankByName.set(r.username, { rank: i + 1, ...r }))

  let found = 0
  let topTier = 0
  for (const name of expected) {
    const hit = rankByName.get(name)
    if (!hit) {
      lines.push(`  MISS      ${name} — not surfaced as a candidate at all`)
      continue
    }
    found++
    const strong = hit.tier === 'compelling' || hit.tier === 'strong'
    if (strong) topTier++
    lines.push(
      `  ${(strong ? 'OK  ' : 'WEAK').padEnd(9)} ${name.padEnd(26)} rank #${String(hit.rank).padStart(3)}  ${String(hit.bits).padStart(7)} bits  [${hit.tier}]`
    )
  }

  lines.push('')
  lines.push(`Recall:    ${found}/${expected.length} known alts surfaced as candidates`)
  lines.push(`Precision: ${topTier}/${expected.length} reached the Strong or Compelling tier`)
  if (found < expected.length) {
    lines.push('')
    lines.push('Known alts that were not surfaced mean candidate generation is too narrow —')
    lines.push('the same blind spot would hide a new alt. Investigate before trusting results.')
  }
  lines.push('')
  return lines.join('\n')
}

try {
  const report = await gatherEvidence(prisma, {
    username: suspect,
    // In calibration mode the known alts are the answer key, not an input.
    extraUsernames: calibrate ? [] : knownAlts
  })
  if (!report) {
    console.error(`No user found with username: ${suspect}`)
    process.exit(1)
  }

  if (calibrate && !knownAlts.length) {
    console.error('--calibrate needs --known-alts: the accounts you already know are alts.')
    process.exit(1)
  }

  const output = asJson
    ? JSON.stringify(report, null, 2)
    : calibrate
      ? renderCalibration(report, knownAlts)
      : renderText(report)

  if (outPath && outPath !== true) {
    const abs = assertSafeOutputPath(outPath)
    writeFileSync(abs, output, { mode: 0o600 })
    console.log(`Report written to ${abs} (mode 0600). It contains player identity evidence — delete it when done.`)
  } else {
    console.log(output)
  }
} catch (err) {
  console.error('Investigation failed:', err?.message || err)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
