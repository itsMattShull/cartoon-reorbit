// prisma/seedAuthLogs.js
// Seed fake LoginLog rows against existing non-admin users so the Auth
// Logs view has data and the Cheat Finder's Duplicate IPs tab shows cards.
//
// Run:    node prisma/seedAuthLogs.js
// Reset:  node prisma/seedAuthLogs.js --reset
//
// --reset deletes previously seeded logs first (recognized by IPs in the
// SHARED_IPS / UNIQUE_IP_POOL sets defined below).

import 'dotenv/config'
import { randomInt } from 'node:crypto'
import { prisma } from '../server/prisma.js'

// IPs that will host multiple users (drive the Cheat Finder cards).
// These are routable so ip-api.com returns real WHOIS / ISP / geo info.
const SHARED_IPS = [
  '73.231.42.119',
  '24.16.142.55',
  '208.67.222.222'
]

// Additional unique IPs for singletons (populate All Logs).
const UNIQUE_IP_POOL = [
  '8.8.8.8',
  '1.1.1.1',
  '4.4.4.4',
  '9.9.9.9',
  '76.102.34.89',
  '70.176.55.12',
  '174.255.91.7',
  '99.234.18.44'
]

const SEED_IPS = [...SHARED_IPS, ...UNIQUE_IP_POOL]

const DAYS_BACK = 60
const LOGS_PER_USER_IP = 3
const SHARED_MIN_USERS = 2
const SHARED_MAX_USERS = 4

function randomDateWithinDays(days) {
  const ms = randomInt(days * 24 * 60 * 60 * 1000)
  return new Date(Date.now() - ms)
}

function sampleN(arr, n) {
  const a = [...arr]
  const out = []
  const k = Math.min(n, a.length)
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(a.length - i)
    ;[a[i], a[j]] = [a[j], a[i]]
    out.push(a[i])
  }
  return out
}

async function main() {
  const reset = process.argv.includes('--reset')

  const users = await prisma.user.findMany({
    where: { isAdmin: false, username: { not: null } },
    select: { id: true, username: true }
  })

  if (!users.length) {
    console.error('No non-admin users with usernames found. Aborting.')
    process.exit(1)
  }

  if (reset) {
    const deleted = await prisma.loginLog.deleteMany({ where: { ip: { in: SEED_IPS } } })
    console.log(`Cleared ${deleted.count} previously seeded LoginLog rows`)
  }

  // Assignments: each SHARED_IP gets a random 2-4 user subset (sampled
  // independently, so overlap between shared groups is possible).
  const assignments = []
  for (const ip of SHARED_IPS) {
    const desired = SHARED_MIN_USERS + randomInt(SHARED_MAX_USERS - SHARED_MIN_USERS + 1)
    const chosen = sampleN(users, desired)
    for (const u of chosen) {
      assignments.push({ userId: u.id, username: u.username, ip })
    }
  }

  // Every user also gets a unique IP so the All Logs view has variety.
  for (const u of users) {
    const ip = UNIQUE_IP_POOL[randomInt(UNIQUE_IP_POOL.length)]
    assignments.push({ userId: u.id, username: u.username, ip })
  }

  const rows = []
  for (const a of assignments) {
    for (let i = 0; i < LOGS_PER_USER_IP; i++) {
      rows.push({
        userId: a.userId,
        ip: a.ip,
        createdAt: randomDateWithinDays(DAYS_BACK)
      })
    }
  }

  await prisma.loginLog.createMany({ data: rows })

  console.log(`Inserted ${rows.length} LoginLog rows for ${assignments.length} (user, ip) pairs`)
  console.log('Shared IPs (should appear in Cheat Finder):')
  for (const ip of SHARED_IPS) {
    const usernames = Array.from(new Set(
      assignments.filter(a => a.ip === ip).map(a => a.username)
    ))
    console.log(`  ${ip} -> ${usernames.length} users: ${usernames.join(', ')}`)
  }
}

main()
  .catch(e => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => {})
