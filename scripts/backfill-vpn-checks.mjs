/**
 * Backfill VPN checks for all historical (userId, ip) combinations in LoginLog.
 *
 * Run with: node scripts/backfill-vpn-checks.mjs
 *
 * Requires IP_ENCRYPTION_KEY to be set in .env or the environment.
 * Processes at most 20 IPs per minute to stay within ip-api.com free tier limits.
 * Safe to re-run — already-checked IPs are skipped automatically.
 */

// ── Load .env manually (outside Nuxt runtime) ────────────────────────────────
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createCipheriv, createDecipheriv, createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')

try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.warn('Could not load .env file — relying on environment variables')
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Inline encryption (cannot import Nuxt server utils outside runtime) ───────
function getKeyAndIV() {
  const keyHex = process.env.IP_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'IP_ENCRYPTION_KEY must be a 64-char hex string.\n' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    )
  }
  const key = Buffer.from(keyHex, 'hex')
  const iv = createHash('sha256').update(key).digest().slice(0, 16)
  return { key, iv }
}

function encryptIp(ip) {
  const { key, iv } = getKeyAndIV()
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  return cipher.update(ip, 'utf8', 'hex') + cipher.final('hex')
}

// ── IP helpers ────────────────────────────────────────────────────────────────
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/i
function isPrivateIp(ip) { return !ip || PRIVATE_IP_RE.test(ip) }

// ── VPN check via ip-api.com (free, 45 req/min) ───────────────────────────────
async function checkVpn(ip) {
  try {
    const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,isp,org,as,proxy,hosting,query`
    const res = await fetch(url).then(r => r.json())
    if (!res || res.status !== 'success') return null
    const isVpn = !!(res.proxy || res.hosting)
    let proxyType = null, reason = null
    if (res.hosting) {
      proxyType = 'Datacenter/Hosting'
      reason = 'IP flagged as datacenter/hosting by ip-api.com'
    } else if (res.proxy) {
      proxyType = 'VPN/Proxy'
      reason = 'IP flagged as VPN/Proxy by ip-api.com'
    }
    return { isVpn, proxyType, isp: res.isp || null, org: res.org || null,
             asn: res.as || null, country: res.country || null,
             countryCode: res.countryCode || null, reason }
  } catch { return null }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  getKeyAndIV() // Verify key is valid before doing any work

  console.log('Fetching distinct (userId, ip) combinations from LoginLog...')
  const logins = await prisma.loginLog.findMany({
    distinct: ['userId', 'ip'],
    select: { userId: true, ip: true },
  })
  console.log(`  Found ${logins.length} unique (userId, ip) combinations`)

  const publicLogins = logins.filter(l => !isPrivateIp(l.ip))
  console.log(`  Skipping ${logins.length - publicLogins.length} private/local IPs`)
  console.log(`  Processing ${publicLogins.length} public IPs\n`)

  const pairs = publicLogins.map(l => ({
    userId: l.userId,
    encryptedIp: encryptIp(l.ip),
    plainIp: l.ip,
  }))

  // Upsert into UserIP
  console.log('Upserting into UserIP table...')
  let userIpInserted = 0
  for (const { userId, encryptedIp } of pairs) {
    try {
      await prisma.userIP.upsert({
        where: { userId_ip: { userId, ip: encryptedIp } },
        update: {},
        create: { userId, ip: encryptedIp },
      })
      userIpInserted++
    } catch { /* skip */ }
  }
  console.log(`  Upserted ${userIpInserted} rows into UserIP\n`)

  // Find unchecked combos
  const alreadyChecked = await prisma.vpnLog.findMany({ select: { userId: true, ip: true } })
  const checkedSet = new Set(alreadyChecked.map(r => `${r.userId}:${r.ip}`))
  const toCheck = pairs.filter(p => !checkedSet.has(`${p.userId}:${p.encryptedIp}`))

  console.log(`Queue: ${toCheck.length} to check | ${checkedSet.size} already done | ~${Math.ceil(toCheck.length / 20)} min at 20/min\n`)

  if (toCheck.length === 0) {
    console.log('Nothing to do — all IPs already checked!')
    await prisma.$disconnect()
    return
  }

  let processed = 0, flagged = 0, errors = 0

  for (const { userId, encryptedIp, plainIp } of toCheck) {
    await new Promise(r => setTimeout(r, 3000)) // 1 per 3s = 20/min

    try {
      const exists = await prisma.vpnLog.findFirst({ where: { userId, ip: encryptedIp } })
      if (exists) { processed++; continue }

      const result = await checkVpn(plainIp)

      await prisma.vpnLog.create({
        data: {
          userId, ip: encryptedIp,
          isVpn: result?.isVpn ?? false,
          proxyType: result?.proxyType ?? null,
          isp: result?.isp ?? null,
          org: result?.org ?? null,
          asn: result?.asn ?? null,
          country: result?.country ?? null,
          countryCode: result?.countryCode ?? null,
          reason: result?.reason ?? (result === null ? 'API check failed' : null),
        },
      })

      if (result?.isVpn) {
        flagged++
        await prisma.user.update({ where: { id: userId }, data: { vpnDetected: true } })
      }

      processed++
      const pct = Math.round((processed / toCheck.length) * 100)
      process.stdout.write(`\r  Progress: ${processed}/${toCheck.length} (${pct}%) — ${flagged} VPN flags`)
    } catch (err) {
      errors++
      console.error(`\n  Error for user ${userId}: ${err.message}`)
    }
  }

  console.log(`\n\nDone! Processed: ${processed} | VPN flags set: ${flagged} | Errors: ${errors}`)
  await prisma.$disconnect()
}

main().catch(async err => {
  console.error('Fatal:', err.message)
  await prisma.$disconnect()
  process.exit(1)
})
