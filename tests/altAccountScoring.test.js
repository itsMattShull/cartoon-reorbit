import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CHANNELS,
  CHANNEL_CAPS,
  rarityBits,
  diminishing,
  normalizeEmail,
  overlap,
  ipSignal,
  fingerprintSignal,
  emailSignal,
  discordTimingSignal,
  clusterContactSignal,
  barcodeSignal,
  coActivitySignal,
  deviceMismatchSignal,
  precedesBanSignal,
  combineSignals,
  tierFor,
  buildCoverage,
  scoreCandidate,
  rankCandidates
} from '../server/utils/altAccountScoring.js'

const POP = 5000

// ── rarityBits ────────────────────────────────────────────────────────────────

test('rarityBits: a feature shared by few users is worth far more than a common one', () => {
  const rare = rarityBits(2, POP)
  const common = rarityBits(1500, POP)
  assert.ok(rare > common * 3, `expected rare(${rare}) >> common(${common})`)
})

test('rarityBits: carrier-grade NAT scale sharing is near worthless', () => {
  // ~3000 of 5000 users behind one egress address
  assert.ok(rarityBits(3000, POP) < 1)
})

test('rarityBits: respects the cap and handles degenerate input', () => {
  assert.equal(rarityBits(2, 10 ** 9, 12), 12)
  assert.equal(rarityBits(0, POP), 0)
  assert.equal(rarityBits(5, 0), 0)
  assert.equal(rarityBits(POP, POP), 0, 'a feature everyone has carries no information')
})

// ── diminishing ───────────────────────────────────────────────────────────────

test('diminishing: repeated observations add sublinearly', () => {
  const single = diminishing([10])
  const five = diminishing([10, 10, 10, 10, 10])
  assert.equal(single, 10)
  assert.ok(five < 50, 'five identical observations must not be worth 5x one')
  assert.ok(five > 10)
})

test('diminishing: ignores non-positive values', () => {
  assert.equal(diminishing([]), 0)
  assert.equal(diminishing([0, -5]), 0)
})

// ── email normalization ───────────────────────────────────────────────────────

test('normalizeEmail: gmail dots and +suffix collapse to one inbox', () => {
  const a = normalizeEmail('Zen.Viking+reorbit@gmail.com')
  const b = normalizeEmail('zenviking@gmail.com')
  assert.equal(a.normalized, b.normalized)
})

test('normalizeEmail: dots are significant outside gmail', () => {
  const a = normalizeEmail('zen.viking@outlook.com')
  const b = normalizeEmail('zenviking@outlook.com')
  assert.notEqual(a.normalized, b.normalized)
})

test('normalizeEmail: rejects malformed input', () => {
  assert.equal(normalizeEmail(null), null)
  assert.equal(normalizeEmail('not-an-email'), null)
  assert.equal(normalizeEmail('@gmail.com'), null)
})

test('emailSignal: exact inbox match outranks a shared handle', () => {
  const exact = emailSignal({
    suspectEmail: 'zen.viking@gmail.com',
    candidateEmail: 'zenviking+alt@gmail.com'
  })
  const handle = emailSignal({
    suspectEmail: 'zenviking@gmail.com',
    candidateEmail: 'zenviking@proton.me'
  })
  assert.equal(exact.channel, CHANNELS.IDENTITY)
  assert.ok(exact.bits > handle.bits)
  assert.equal(emailSignal({ suspectEmail: 'a@b.com', candidateEmail: 'c@d.com' }), null)
})

// ── overlap ───────────────────────────────────────────────────────────────────

test('overlap: reports shared members and a jaccard coefficient', () => {
  const r = overlap(['a', 'b', 'c'], ['b', 'c', 'd'])
  assert.deepEqual(r.shared.sort(), ['b', 'c'])
  assert.equal(r.jaccard, 0.5)
})

// ── IP signal ─────────────────────────────────────────────────────────────────

test('ipSignal: a VPN exit node is discounted to near zero', () => {
  const shared = [{ ip: 'enc1', df: 2, masked: '203.0.113.xxx' }]
  const clean = ipSignal({ sharedIps: shared, userCount: POP, vpnIps: new Set() })
  const vpn = ipSignal({ sharedIps: shared, userCount: POP, vpnIps: new Set(['enc1']) })
  assert.ok(clean.bits > 10)
  assert.ok(vpn.bits <= 0.5, 'sharing a commercial VPN exit is not evidence')
})

test('ipSignal: returns null with no shared IPs', () => {
  assert.equal(ipSignal({ sharedIps: [], userCount: POP }), null)
})

test('ipSignal: exposes only masked addresses', () => {
  const sig = ipSignal({
    sharedIps: [{ ip: 'ciphertext', df: 2, masked: '203.0.113.xxx' }],
    userCount: POP
  })
  const serialized = JSON.stringify(sig)
  assert.ok(serialized.includes('203.0.113.xxx'))
  assert.ok(!serialized.includes('ciphertext'), 'raw IP ciphertext must never reach the payload')
})

// ── fingerprint ───────────────────────────────────────────────────────────────

test('fingerprintSignal: truncates the visitorId and carries a spoofing caveat', () => {
  const sig = fingerprintSignal({
    sharedVisitorIds: [{ visitorId: 'abcdefghijklmnop', df: 2 }],
    userCount: POP
  })
  assert.equal(sig.detail.fingerprints[0].prefix, 'abcdefgh')
  assert.ok(!JSON.stringify(sig).includes('abcdefghijklmnop'))
  assert.match(sig.caveat, /client/i)
})

// ── discord timing ────────────────────────────────────────────────────────────

test('discordTimingSignal: a Discord account made right after the ban is incriminating', () => {
  const banAt = new Date('2026-06-30T00:00:00Z')
  const soon = discordTimingSignal({
    banAt,
    discordCreatedAt: new Date('2026-07-02T00:00:00Z')
  })
  const later = discordTimingSignal({
    banAt,
    discordCreatedAt: new Date('2026-08-10T00:00:00Z')
  })
  assert.ok(soon.bits > later.bits)
  assert.ok(soon.bits > 0 && later.bits > 0)
})

test('discordTimingSignal: an account years older than the ban is exculpatory', () => {
  const sig = discordTimingSignal({
    banAt: new Date('2026-06-30T00:00:00Z'),
    discordCreatedAt: new Date('2021-01-01T00:00:00Z')
  })
  assert.ok(sig.bits < 0, 'a long-established Discord account is evidence against')
})

// ── cluster contact ───────────────────────────────────────────────────────────

test('clusterContactSignal: touching several known mules escalates sharply', () => {
  const one = clusterContactSignal({
    contacts: [{ username: 'LoopyWarriorWarrior', partnerDegree: 4, interactions: 2 }],
    userCount: POP
  })
  const three = clusterContactSignal({
    contacts: [
      { username: 'LoopyWarriorWarrior', partnerDegree: 4, interactions: 2 },
      { username: 'GalaxyJumperDruid', partnerDegree: 5, interactions: 3 },
      { username: 'RockinBotSuperstar', partnerDegree: 3, interactions: 1 }
    ],
    userCount: POP
  })
  assert.ok(three.bits > one.bits + 6)
})

test('clusterContactSignal: trading with a hub counts for little', () => {
  const hub = clusterContactSignal({
    contacts: [{ username: 'PopularTrader', partnerDegree: 2000, interactions: 1 }],
    userCount: POP
  })
  const niche = clusterContactSignal({
    contacts: [{ username: 'QuietMule', partnerDegree: 3, interactions: 1 }],
    userCount: POP
  })
  assert.ok(niche.bits > hub.bits * 2)
})

// ── barcodes ──────────────────────────────────────────────────────────────────

test('barcodeSignal: an obscure product beats a ubiquitous one', () => {
  const obscure = barcodeSignal({
    sharedBarcodes: [{ label: 'niche board game', df: 2 }],
    userCount: POP
  })
  const ubiquitous = barcodeSignal({
    sharedBarcodes: [{ label: 'Coca-Cola can', df: 1200 }],
    userCount: POP
  })
  assert.ok(obscure.bits > ubiquitous.bits * 4)
  assert.equal(obscure.channel, CHANNELS.PHYSICAL)
})

// ── negative evidence ─────────────────────────────────────────────────────────

test('coActivitySignal: constant simultaneous activity is strong evidence AGAINST', () => {
  const sig = coActivitySignal({ concurrentWindows: 90, comparableWindows: 200 })
  assert.ok(sig.bits < -6, 'two people online together is a household, not an alt')
})

test('coActivitySignal: never overlapping is mildly supportive', () => {
  const sig = coActivitySignal({ concurrentWindows: 0, comparableWindows: 300 })
  assert.ok(sig.bits > 0)
})

test('coActivitySignal: stays silent without enough samples', () => {
  assert.equal(coActivitySignal({ concurrentWindows: 0, comparableWindows: 5 }), null)
})

test('deviceMismatchSignal: disjoint platforms subtract', () => {
  const sig = deviceMismatchSignal({
    suspectDevices: ['Mobile · iOS · Safari'],
    candidateDevices: ['Desktop · Windows · Chrome']
  })
  assert.ok(sig.bits < 0)
  assert.equal(
    deviceMismatchSignal({
      suspectDevices: ['Desktop · Windows · Chrome'],
      candidateDevices: ['Desktop · Windows · Chrome']
    }),
    null
  )
})

test('precedesBanSignal: a long-established player is evidence against', () => {
  const sig = precedesBanSignal({
    candidateFirstSeen: new Date('2025-01-01T00:00:00Z'),
    banAt: new Date('2026-06-30T00:00:00Z'),
    activeBeforeBanDays: 400
  })
  assert.ok(sig.bits < 0)
})

// ── combination and tiers ─────────────────────────────────────────────────────

test('combineSignals: same-channel signals do not stack linearly', () => {
  const combined = combineSignals([
    { channel: CHANNELS.NETWORK, key: 'a', label: 'a', bits: 10 },
    { channel: CHANNELS.NETWORK, key: 'b', label: 'b', bits: 10 },
    { channel: CHANNELS.NETWORK, key: 'c', label: 'c', bits: 10 }
  ])
  assert.ok(
    combined.bits < 30,
    'exact IP / subnet / ASN are views of one observation and must not self-corroborate'
  )
})

test('combineSignals: respects per-channel caps', () => {
  const combined = combineSignals([
    { channel: CHANNELS.DEVICE, key: 'a', label: 'a', bits: 100 }
  ])
  assert.equal(combined.bits, CHANNEL_CAPS[CHANNELS.DEVICE])
})

test('combineSignals: negative evidence is applied in full and can zero a case', () => {
  const combined = combineSignals([
    { channel: CHANNELS.NETWORK, key: 'ip', label: 'ip', bits: 12 },
    { channel: CHANNELS.NETWORK, key: 'concurrent', label: 'concurrent', bits: -14 }
  ])
  assert.ok(combined.bits < 0)
  assert.equal(combined.tier, 'noise')
})

test('tierFor: a single uncorroborated channel cannot reach the top tier', () => {
  assert.equal(tierFor(60, 1), 'weak', 'one spoofable signal must never read as proof')
  assert.equal(tierFor(60, 3), 'compelling')
  assert.equal(tierFor(22, 2), 'strong')
})

test('combineSignals: trivial signals across channels do not fake corroboration', () => {
  const combined = combineSignals([
    { channel: CHANNELS.NETWORK, key: 'a', label: 'a', bits: 1 },
    { channel: CHANNELS.DEVICE, key: 'b', label: 'b', bits: 1 },
    { channel: CHANNELS.ECONOMY, key: 'c', label: 'c', bits: 1 }
  ])
  assert.equal(combined.corroboratingChannels, 0)
})

// ── coverage ──────────────────────────────────────────────────────────────────

test('buildCoverage: distinguishes "no data" from "no match"', () => {
  const coverage = buildCoverage({ loginLogs: 40, fingerprints: 0, trades: 12 })
  const device = coverage.find((c) => c.key === 'fingerprints')
  const network = coverage.find((c) => c.key === 'loginLogs')
  assert.equal(device.available, false, 'zero fingerprint rows is missing data, not exoneration')
  assert.equal(network.available, true)
})

// ── end to end ────────────────────────────────────────────────────────────────

const CONTEXT = {
  userCount: POP,
  banAt: new Date('2026-06-30T00:00:00Z'),
  suspectEmail: 'zenviking@gmail.com',
  suspectDevices: ['Desktop · Windows · Chrome'],
  vpnIps: new Set()
}

test('scoreCandidate: a returning alt behind a VPN is still caught by durable signals', () => {
  // No IP or fingerprint overlap at all — the VPN and a fresh browser did their
  // job. What gives him away is the network, the loot, and the physical world.
  const result = scoreCandidate(
    {
      userId: 'u-alt',
      username: 'MegaOtterSage',
      discordCreatedAt: new Date('2026-07-05T00:00:00Z'),
      firstSeenAt: new Date('2026-07-06T00:00:00Z'),
      clusterContacts: [
        { username: 'LoopyWarriorWarrior', partnerDegree: 4, interactions: 3 },
        { username: 'GalaxyJumperDruid', partnerDegree: 6, interactions: 2 }
      ],
      reacquiredMints: [
        { name: 'Rare Toon', mintNumber: 3, rarity: 'Crazy Rare', lowMint: true, circulation: 8 }
      ],
      sharedBarcodes: [{ label: 'niche cereal', df: 2 }]
    },
    CONTEXT
  )
  assert.ok(result.bits >= 20, `expected a strong case, got ${result.bits}`)
  assert.ok(['strong', 'compelling'].includes(result.tier))
  assert.ok(result.corroboratingChannels >= 2)
})

test('scoreCandidate: a sibling on the same connection is not ranked as an alt', () => {
  const result = scoreCandidate(
    {
      userId: 'u-sibling',
      username: 'HappyKoalaScout',
      // Same house: same IP, same subnet, overlapping social circle.
      sharedIps: [{ ip: 'enc-home', df: 2, masked: '192.0.2.xxx' }],
      sharedPartners: [{ username: 'SomeFriend', degree: 20 }],
      // But they play at the same time constantly, and were here long before.
      concurrentWindows: 140,
      comparableWindows: 300,
      firstSeenAt: new Date('2025-03-01T00:00:00Z'),
      activeBeforeBanDays: 400,
      deviceTypes: ['Mobile · Android · Chrome']
    },
    CONTEXT
  )
  assert.ok(
    result.tier === 'noise' || result.tier === 'weak',
    `a co-active long-standing sibling must not rank as an alt (got ${result.tier}, ${result.bits} bits)`
  )
})

test('rankCandidates: orders by bits and drops non-positive cases', () => {
  const ranked = rankCandidates(
    [
      { userId: 'a', username: 'A', sharedBarcodes: [{ label: 'x', df: 2 }] },
      { userId: 'b', username: 'B' },
      {
        userId: 'c',
        username: 'C',
        clusterContacts: [
          { username: 'm1', partnerDegree: 3, interactions: 5 },
          { username: 'm2', partnerDegree: 3, interactions: 5 }
        ],
        sharedBarcodes: [{ label: 'y', df: 2 }]
      }
    ],
    CONTEXT
  )
  assert.equal(ranked[0].userId, 'c')
  assert.ok(!ranked.some((r) => r.userId === 'b'), 'candidates with no evidence are dropped')
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].bits >= ranked[i].bits)
})

test('rankCandidates: an empty investigation ranks nobody', () => {
  const ranked = rankCandidates([{ userId: 'x', username: 'X' }], CONTEXT)
  assert.equal(ranked.length, 0, 'the tool must be able to say the alt is not here')
})
