// Usage: node --env-file=.env prisma/get-user-ips.js <username>

import { PrismaClient } from '@prisma/client'
import { decryptIp } from '../server/utils/ip-encrypt.js'

const prisma = new PrismaClient()

const username = process.argv[2]
if (!username) {
  console.error('Usage: node --env-file=.env prisma/get-user-ips.js <username>')
  process.exit(1)
}

const user = await prisma.user.findUnique({
  where: { username },
  select: {
    id: true,
    username: true,
    discordUsername: true,
    ips: { select: { ip: true }, orderBy: { id: 'asc' } },
    logins: { select: { ip: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 },
  },
})

if (!user) {
  console.error(`No user found with username: ${username}`)
  await prisma.$disconnect()
  process.exit(1)
}

console.log(`\nUser: ${user.username} (${user.discordUsername ?? 'no discord username'})`)
console.log(`ID:   ${user.id}\n`)

const knownIps = user.ips.map(r => decryptIp(r.ip))
console.log(`── Known IPs (UserIP table) ─────────────────`)
if (knownIps.length === 0) {
  console.log('  (none)')
} else {
  knownIps.forEach(ip => console.log(' ', ip))
}

console.log(`\n── Recent Login IPs (last ${user.logins.length}) ──────────────`)
if (user.logins.length === 0) {
  console.log('  (none)')
} else {
  user.logins.forEach(l =>
    console.log(`  ${decryptIp(l.ip).padEnd(40)} ${l.createdAt.toISOString()}`)
  )
}

await prisma.$disconnect()
