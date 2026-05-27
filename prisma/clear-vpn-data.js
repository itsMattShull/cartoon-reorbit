// prisma/clear-vpn-data.js
//
// Removes all VPN-related data from the database:
//   • VpnLog   — all stored VPN check results
//   • User.vpnDetected — resets the flag to false on every user
//
// NOTE: The in-memory vpn-queue (server/utils/vpn-queue.js) is separate and
//       lives only while the server is running. Restart the server to drain or
//       discard any items currently waiting in that queue.
//
// Run with:
//   node --env-file=.env prisma/clear-vpn-data.js

import { prisma } from '../server/prisma.js'

async function main() {
  const del = async (label, fn) => {
    try {
      const res = await fn()
      const count = res?.count ?? '—'
      console.log(`✓ ${label}: ${count} row(s) affected`)
    } catch (err) {
      console.error(`✗ ${label}:`, err.message)
      throw err
    }
  }

  console.log('🧹 Clearing all VPN data…\n')

  // 1. Remove all VPN log entries
  await del('VpnLog (delete all rows)', () => prisma.vpnLog.deleteMany())

  // 2. Reset the vpnDetected flag on every user
  await del('User.vpnDetected → false (all users)', () =>
    prisma.user.updateMany({
      where: { vpnDetected: true },
      data:  { vpnDetected: false },
    })
  )

  console.log('\n✅ VPN data cleared.')
  console.log(
    '\n⚠️  Remember: the server-side in-memory VPN queue is not affected by this script.\n' +
    '   Restart the server if you also need to discard pending queue items.'
  )
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message)
  process.exit(1)
})
