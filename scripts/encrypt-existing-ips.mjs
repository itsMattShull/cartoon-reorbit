/**
 * One-time migration: encrypt plaintext IP addresses already stored in the
 * UserIP, VpnLog, LoginLog, and DeviceFingerprintLog tables.
 *
 * Run ONCE on each environment (staging, production) BEFORE deploying the
 * new middleware code and BEFORE running backfill-vpn-checks.mjs.
 *
 * Run with: node scripts/encrypt-existing-ips.mjs
 *
 * Requires IP_ENCRYPTION_KEY to be set in .env or the environment.
 * Safe to re-run — rows that are already encrypted are detected and skipped.
 *
 * Tables updated:
 *   UserIP.ip                  — encrypted in-place (unique constraint handled)
 *   VpnLog.ip                  — encrypted in-place
 *   LoginLog.ip                — encrypted in-place
 *   DeviceFingerprintLog.ip    — encrypted in-place
 */

// ── Load .env manually (outside Nuxt runtime) ────────────────────────────────
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createCipheriv, createHash } from 'crypto'

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

// ── Encryption ────────────────────────────────────────────────────────────────
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

// A value is already encrypted if it's a long lowercase hex string.
// Plaintext IPs (e.g. "203.0.113.42") contain dots/colons and are never
// pure hex, so this reliably distinguishes the two.
function isAlreadyEncrypted(value) {
  return /^[0-9a-f]{32,}$/i.test(value)
}

// ── UserIP migration ──────────────────────────────────────────────────────────
async function encryptUserIPs() {
  console.log('\n── UserIP ───────────────────────────────────────────────')

  const rows = await prisma.userIP.findMany({ select: { id: true, userId: true, ip: true } })
  console.log(`  Total rows: ${rows.length}`)

  const plaintext = rows.filter(r => !isAlreadyEncrypted(r.ip))
  const alreadyDone = rows.length - plaintext.length
  console.log(`  Already encrypted: ${alreadyDone}`)
  console.log(`  Need encrypting:   ${plaintext.length}`)

  if (plaintext.length === 0) {
    console.log('  Nothing to do.')
    return
  }

  let updated = 0, skippedConflict = 0, errors = 0

  for (const row of plaintext) {
    const encryptedIp = encryptIp(row.ip)

    try {
      // Check if an encrypted row for this (userId, encryptedIp) already exists.
      // This can happen if the new middleware ran briefly before this script,
      // creating an encrypted row alongside the old plaintext one.
      const conflict = await prisma.userIP.findUnique({
        where: { userId_ip: { userId: row.userId, ip: encryptedIp } },
      })

      if (conflict) {
        // Encrypted version already exists — delete the stale plaintext row.
        await prisma.userIP.delete({ where: { id: row.id } })
        skippedConflict++
      } else {
        // No conflict — update in-place.
        await prisma.userIP.update({
          where: { id: row.id },
          data: { ip: encryptedIp },
        })
        updated++
      }
    } catch (err) {
      errors++
      console.error(`  Error on row ${row.id}: ${err.message}`)
    }
  }

  console.log(`  Updated:          ${updated}`)
  console.log(`  Deleted (conflict existed): ${skippedConflict}`)
  console.log(`  Errors:           ${errors}`)
}

// ── VpnLog migration ──────────────────────────────────────────────────────────
async function encryptVpnLogs() {
  console.log('\n── VpnLog ───────────────────────────────────────────────')

  const rows = await prisma.vpnLog.findMany({ select: { id: true, ip: true } })
  console.log(`  Total rows: ${rows.length}`)

  const plaintext = rows.filter(r => !isAlreadyEncrypted(r.ip))
  const alreadyDone = rows.length - plaintext.length
  console.log(`  Already encrypted: ${alreadyDone}`)
  console.log(`  Need encrypting:   ${plaintext.length}`)

  if (plaintext.length === 0) {
    console.log('  Nothing to do.')
    return
  }

  let updated = 0, errors = 0

  for (const row of plaintext) {
    try {
      await prisma.vpnLog.update({
        where: { id: row.id },
        data: { ip: encryptIp(row.ip) },
      })
      updated++
    } catch (err) {
      errors++
      console.error(`  Error on row ${row.id}: ${err.message}`)
    }
  }

  console.log(`  Updated: ${updated}`)
  console.log(`  Errors:  ${errors}`)
}

// ── LoginLog migration ────────────────────────────────────────────────────────
async function encryptLoginLogs() {
  console.log('\n── LoginLog ─────────────────────────────────────────────')

  const rows = await prisma.loginLog.findMany({ select: { id: true, ip: true } })
  console.log(`  Total rows: ${rows.length}`)

  const plaintext = rows.filter(r => !isAlreadyEncrypted(r.ip))
  const alreadyDone = rows.length - plaintext.length
  console.log(`  Already encrypted: ${alreadyDone}`)
  console.log(`  Need encrypting:   ${plaintext.length}`)

  if (plaintext.length === 0) {
    console.log('  Nothing to do.')
    return
  }

  let updated = 0, errors = 0

  for (const row of plaintext) {
    try {
      await prisma.loginLog.update({
        where: { id: row.id },
        data: { ip: encryptIp(row.ip) },
      })
      updated++
    } catch (err) {
      errors++
      console.error(`  Error on row ${row.id}: ${err.message}`)
    }
  }

  console.log(`  Updated: ${updated}`)
  console.log(`  Errors:  ${errors}`)
}

// ── DeviceFingerprintLog migration ────────────────────────────────────────────
async function encryptDeviceFingerprintLogs() {
  console.log('\n── DeviceFingerprintLog ─────────────────────────────────')

  const rows = await prisma.deviceFingerprintLog.findMany({ select: { id: true, ip: true } })
  console.log(`  Total rows: ${rows.length}`)

  const plaintext = rows.filter(r => !isAlreadyEncrypted(r.ip))
  const alreadyDone = rows.length - plaintext.length
  console.log(`  Already encrypted: ${alreadyDone}`)
  console.log(`  Need encrypting:   ${plaintext.length}`)

  if (plaintext.length === 0) {
    console.log('  Nothing to do.')
    return
  }

  let updated = 0, errors = 0

  for (const row of plaintext) {
    try {
      await prisma.deviceFingerprintLog.update({
        where: { id: row.id },
        data: { ip: encryptIp(row.ip) },
      })
      updated++
    } catch (err) {
      errors++
      console.error(`  Error on row ${row.id}: ${err.message}`)
    }
  }

  console.log(`  Updated: ${updated}`)
  console.log(`  Errors:  ${errors}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  getKeyAndIV() // Validate key before doing any work

  console.log('Encrypting existing IP addresses in UserIP, VpnLog, LoginLog, and DeviceFingerprintLog...')

  await encryptUserIPs()
  await encryptVpnLogs()
  await encryptLoginLogs()
  await encryptDeviceFingerprintLogs()

  console.log('\nDone. You can now deploy the new middleware and run backfill-vpn-checks.mjs.')
  await prisma.$disconnect()
}

main().catch(async err => {
  console.error('Fatal:', err.message)
  await prisma.$disconnect()
  process.exit(1)
})
