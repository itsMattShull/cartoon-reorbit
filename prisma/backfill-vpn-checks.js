// scripts/backfill-vpn-checks.js
//
// Backfill VPN checks for all historical (userId, ip) combinations in LoginLog.
//
// Run with: node --env-file=.env scripts/backfill-vpn-checks.js
//
// Processes at most 20 IPs per minute to stay within ip-api.com free tier limits.
// Safe to re-run — already-checked IPs are skipped automatically.

import { prisma } from '../server/prisma.js'
import { encryptIp, decryptIp } from '../server/utils/ip-encrypt.js'
import { isPrivateIp } from '../server/utils/vpn-check.js'

// VPN check using native fetch (cannot use $fetch outside Nuxt runtime)
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
    return {
      isVpn, proxyType,
      isp: res.isp || null, org: res.org || null, asn: res.as || null,
      country: res.country || null, countryCode: res.countryCode || null, reason,
    }
  } catch { return null }
}

async function main() {
  console.log('Fetching distinct (userId, ip) combinations from LoginLog...')
  const logins = await prisma.loginLog.findMany({
    distinct: ['userId', 'ip'],
    select: { userId: true, ip: true },
  })
  console.log(`  Found ${logins.length} unique (userId, ip) combinations`)

  // Decrypt first (handles both plaintext and already-encrypted values),
  // then filter private IPs using the plaintext value
  const pairs = logins
    .map(l => ({ userId: l.userId, plainIp: decryptIp(l.ip) }))
    .filter(l => !isPrivateIp(l.plainIp))
    .map(l => ({ userId: l.userId, plainIp: l.plainIp, encryptedIp: encryptIp(l.plainIp) }))

  console.log(`  Skipping ${logins.length - pairs.length} private/local IPs`)
  console.log(`  Processing ${pairs.length} public IPs\n`)

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
    } catch { /* skip unique constraint races */ }
  }
  console.log(`  Upserted ${userIpInserted} rows into UserIP\n`)

  // Find unchecked combos
  const alreadyChecked = await prisma.vpnLog.findMany({ select: { userId: true, ip: true } })
  const checkedSet = new Set(alreadyChecked.map(r => `${r.userId}:${r.ip}`))
  const toCheck = pairs.filter(p => !checkedSet.has(`${p.userId}:${p.encryptedIp}`))

  console.log(`Queue: ${toCheck.length} to check | ${checkedSet.size} already done | ~${Math.ceil(toCheck.length / 20)} min at 20/min\n`)

  if (toCheck.length === 0) {
    console.log('Nothing to do — all IPs already checked!')
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
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
