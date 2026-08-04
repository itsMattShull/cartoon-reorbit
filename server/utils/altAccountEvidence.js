/**
 * Alt Account Investigator — evidence gathering.
 *
 * Takes a Prisma client as an argument rather than importing one, so the Nitro
 * endpoint and the CLI in prisma/ can both use it.
 *
 * Two phases:
 *   1. CANDIDATE GENERATION — several independent, individually capped
 *      generators, each stamping provenance onto the candidates it surfaced.
 *      Scoring every user on the site against every signal is neither
 *      affordable nor useful; scoring ~500 plausible ones is both.
 *   2. SCORING — a bounded set of aggregate queries over the candidate set
 *      only. Never per-candidate queries in a loop.
 *
 * Deliberately NOT here: VPN ASN grouping as a candidate generator. The suspect
 * is known to use a VPN, and a commercial VPN ASN is shared by every
 * privacy-minded player, so it produces thousands of strangers and then the cap
 * silently truncates the true positives the precise generators found. VpnLog is
 * used only to DISCOUNT IP matches (see vpnIps below).
 */

import { encryptIp, decryptIp } from './ip-encrypt.js'
import { normalizeIp, isNonIdentifyingIp, subnetPrefix, maskIp } from './requestIp.js'
import { rankCandidates, buildCoverage } from './altAccountScoring.js'

// Caps per generator. Generous enough not to lose real leads, tight enough that
// phase 2 stays a fixed number of indexed aggregates.
const CAPS = {
  ip: 300,
  subnet: 300,
  fingerprint: 150,
  cluster: 250,
  provenance: 200,
  recall: 200,
  physical: 150,
  total: 600
}

// Only enumerate this many distinct /24s. Each costs 256 encrypt calls.
const MAX_SUBNETS = 12

/**
 * Resolve the seed cluster: the banned account plus any accounts already known
 * to belong to it. Scoring against the whole cluster rather than one username
 * is what makes the tool work on someone who knows he was caught — he can
 * change his IP, browser and Discord account, but reconnecting with his network
 * and his items is the entire reason he came back.
 */
export async function resolveSeedCluster(prisma, { username, userId, extraUsernames = [] }) {
  const where = userId ? { id: userId } : { username }
  const primary = await prisma.user.findFirst({
    where,
    select: {
      id: true,
      username: true,
      email: true,
      discordId: true,
      discordCreatedAt: true,
      createdAt: true,
      banned: true
    }
  })
  if (!primary) return null

  const extras = extraUsernames.length
    ? await prisma.user.findMany({
        where: { username: { in: extraUsernames } },
        select: { id: true, username: true }
      })
    : []

  // Ban time anchors every temporal signal. Prefer the ban note over any
  // last-activity heuristic: a banned user holding a valid 30-day JWT keeps
  // writing LoginLog rows, because only /api/auth/me checks the banned flag.
  const banNote = await prisma.userBanNote.findFirst({
    where: { userId: primary.id, action: 'BAN' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, reason: true }
  })

  return {
    primary,
    seedIds: [primary.id, ...extras.map((e) => e.id)],
    seedUsernames: [primary.username, ...extras.map((e) => e.username)],
    knownAlts: extras,
    banAt: banNote?.createdAt || null,
    banReason: banNote?.reason || null
  }
}

/**
 * Every stored form of the seed cluster's IPs.
 *
 * Returns plaintext addresses plus the set of stored representations to match
 * against. Both encodings are included because UserIP historically received
 * plaintext from the OAuth callback while the login middleware wrote
 * ciphertext — matching on one form alone silently halves the overlap count.
 */
async function loadSeedIps(prisma, seedIds) {
  const [userIps, loginIps, fpIps] = await Promise.all([
    prisma.userIP.findMany({ where: { userId: { in: seedIds } }, select: { ip: true } }),
    prisma.loginLog.findMany({
      where: { userId: { in: seedIds } },
      select: { ip: true },
      distinct: ['ip']
    }),
    prisma.deviceFingerprintLog.findMany({
      where: { userId: { in: seedIds } },
      select: { ip: true },
      distinct: ['ip']
    })
  ])

  const plaintext = new Set()
  for (const row of [...userIps, ...loginIps, ...fpIps]) {
    // decryptIp passes non-hex values through unchanged, which normalizes the
    // legacy plaintext rows onto the same footing as encrypted ones.
    const ip = normalizeIp(decryptIp(row.ip))
    if (ip && !isNonIdentifyingIp(ip)) plaintext.add(ip)
  }

  return { plaintext: [...plaintext], storedForms: storedFormsFor([...plaintext]) }
}

/**
 * Every representation an IP may have been stored under.
 *
 * Three variants exist in the data, and matching on one alone loses history:
 *   - ciphertext (what server/middleware/login-log.js writes),
 *   - plaintext (what the OAuth callback wrote until this was fixed),
 *   - the IPv4-mapped IPv6 form `::ffff:1.2.3.4`, which is what Node reports
 *     for a socket peer and which predates normalization.
 */
function storedFormsFor(ips) {
  const forms = new Set()
  for (const ip of ips) {
    const variants = [ip]
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) variants.push(`::ffff:${ip}`)
    for (const v of variants) {
      forms.add(v)
      const enc = encryptIp(v)
      if (enc) forms.add(enc)
    }
  }
  return [...forms]
}

/**
 * Subnet matching without decrypting the world.
 *
 * IPs are encrypted as whole strings with a deterministic key, so there is no
 * SQL prefix match — the obvious implementation is to SELECT every LoginLog row
 * and decrypt it in Node, which is seconds of blocked event loop and hundreds
 * of megabytes of heap. Instead: decrypt only the SEED's addresses, enumerate
 * the 256 addresses of each of its /24s, encrypt those, and hand the result to
 * an ordinary indexed `IN`. Bounded work, no table scan.
 *
 * IPv4 only — a /64 has 2^64 addresses, so IPv6 seeds fall back to exact match.
 */
function enumerateSubnetForms(plaintextIps) {
  const prefixes = new Set()
  for (const ip of plaintextIps) {
    const prefix = subnetPrefix(ip)
    if (prefix && prefix.includes('.')) prefixes.add(prefix)
  }

  const limited = [...prefixes].slice(0, MAX_SUBNETS)
  const forms = []
  const byForm = new Map()
  for (const prefix of limited) {
    for (let octet = 0; octet < 256; octet++) {
      const ip = `${prefix}.${octet}`
      const enc = encryptIp(ip)
      forms.push(ip)
      byForm.set(ip, prefix)
      if (enc) {
        forms.push(enc)
        byForm.set(enc, prefix)
      }
    }
  }
  return { forms, byForm, prefixes: limited }
}

/** Distinct-user count per stored IP form, used for rarity weighting. */
async function ipUserCounts(prisma, storedForms) {
  if (!storedForms.length) return new Map()
  const rows = await prisma.userIP.findMany({
    where: { ip: { in: storedForms } },
    select: { ip: true, userId: true }
  })
  const byIp = new Map()
  for (const row of rows) {
    if (!byIp.has(row.ip)) byIp.set(row.ip, new Set())
    byIp.get(row.ip).add(row.userId)
  }
  return byIp
}

/** Phase 1 — candidate generation. */
async function generateCandidates(prisma, seed, seedIps, banAt) {
  const seedSet = new Set(seed.seedIds)
  const surfaced = new Map() // userId -> Set<generator>

  const add = (userId, generator, cap, counter) => {
    if (!userId || seedSet.has(userId)) return
    if (counter.n >= cap && !surfaced.has(userId)) return
    if (!surfaced.has(userId)) {
      surfaced.set(userId, new Set())
      counter.n++
    }
    surfaced.get(userId).add(generator)
  }

  const subnet = enumerateSubnetForms(seedIps.plaintext)

  const [
    ipRows,
    loginRows,
    subnetRows,
    fpRows,
    clusterRows,
    barcodeRows
  ] = await Promise.all([
    // Exact IP overlap
    seedIps.storedForms.length
      ? prisma.userIP.findMany({
          where: { ip: { in: seedIps.storedForms }, userId: { notIn: seed.seedIds } },
          select: { userId: true, ip: true }
        })
      : [],
    seedIps.storedForms.length
      ? prisma.loginLog.findMany({
          where: { ip: { in: seedIps.storedForms }, userId: { notIn: seed.seedIds } },
          select: { userId: true, ip: true },
          distinct: ['userId', 'ip']
        })
      : [],
    // /24 overlap
    subnet.forms.length
      ? prisma.userIP.findMany({
          where: { ip: { in: subnet.forms }, userId: { notIn: seed.seedIds } },
          select: { userId: true, ip: true }
        })
      : [],
    // Shared browser fingerprint
    (async () => {
      const seedFps = await prisma.deviceFingerprintLog.findMany({
        where: { userId: { in: seed.seedIds } },
        select: { visitorId: true },
        distinct: ['visitorId']
      })
      const ids = seedFps.map((f) => f.visitorId).filter(Boolean)
      if (!ids.length) return []
      return prisma.deviceFingerprintLog.findMany({
        where: { visitorId: { in: ids }, userId: { notIn: seed.seedIds } },
        select: { userId: true, visitorId: true },
        distinct: ['userId', 'visitorId']
      })
    })(),
    // Anyone who transacted with the cluster, in either direction
    prisma.ctoonOwnerLog.findMany({
      where: {
        OR: [
          { userId: { in: seed.seedIds }, counterpartyUserId: { notIn: seed.seedIds } },
          { counterpartyUserId: { in: seed.seedIds }, userId: { notIn: seed.seedIds } }
        ]
      },
      select: { userId: true, counterpartyUserId: true, createdAt: true }
    }),
    // Same physical barcodes
    (async () => {
      const seedScans = await prisma.userBarcodeScan.findMany({
        where: { userId: { in: seed.seedIds } },
        select: { mappingId: true },
        distinct: ['mappingId']
      })
      const ids = seedScans.map((s) => s.mappingId)
      if (!ids.length) return []
      return prisma.userBarcodeScan.findMany({
        where: { mappingId: { in: ids }, userId: { notIn: seed.seedIds } },
        select: { userId: true, mappingId: true }
      })
    })()
  ])

  const counters = {
    ip: { n: 0 },
    subnet: { n: 0 },
    fingerprint: { n: 0 },
    cluster: { n: 0 },
    physical: { n: 0 },
    recall: { n: 0 }
  }

  const exactForms = new Set(seedIps.storedForms)
  for (const r of ipRows) add(r.userId, 'sharedIp', CAPS.ip, counters.ip)
  for (const r of loginRows) add(r.userId, 'sharedIp', CAPS.ip, counters.ip)
  for (const r of subnetRows) {
    if (exactForms.has(r.ip)) continue // already counted as an exact match
    add(r.userId, 'sharedSubnet', CAPS.subnet, counters.subnet)
  }
  for (const r of fpRows) add(r.userId, 'sharedFingerprint', CAPS.fingerprint, counters.fingerprint)
  for (const r of clusterRows) {
    const other = seedSet.has(r.userId) ? r.counterpartyUserId : r.userId
    add(other, 'clusterContact', CAPS.cluster, counters.cluster)
  }
  for (const r of barcodeRows) add(r.userId, 'sharedBarcode', CAPS.physical, counters.physical)

  // Recall floor: accounts created in the window after the ban. Without this,
  // an alt that shares nothing measurable with the seed is never even scored.
  if (banAt) {
    const windowStart = new Date(banAt)
    const windowEnd = new Date(new Date(banAt).getTime() + 120 * 86400000)
    const fresh = await prisma.user.findMany({
      where: { createdAt: { gte: windowStart, lte: windowEnd }, id: { notIn: seed.seedIds } },
      select: { id: true },
      take: CAPS.recall
    })
    for (const u of fresh) add(u.id, 'createdAfterBan', CAPS.recall, counters.recall)
  }

  return surfaced
}

/**
 * Phase 2 — gather per-candidate evidence with a fixed number of aggregate
 * queries scoped to the candidate set.
 */
export async function gatherEvidence(prisma, options = {}) {
  const seed = await resolveSeedCluster(prisma, options)
  if (!seed) return null

  const banAt = options.banAt || seed.banAt
  const seedIps = await loadSeedIps(prisma, seed.seedIds)

  const surfaced = await generateCandidates(prisma, seed, seedIps, banAt)
  let candidateIds = [...surfaced.keys()].slice(0, CAPS.total)
  if (!candidateIds.length) {
    return emptyResult(seed, banAt, prisma)
  }

  const subnet = enumerateSubnetForms(seedIps.plaintext)
  const seedFingerprints = await prisma.deviceFingerprintLog.findMany({
    where: { userId: { in: seed.seedIds } },
    select: { visitorId: true, deviceType: true },
    distinct: ['visitorId']
  })
  const seedVisitorIds = seedFingerprints.map((f) => f.visitorId).filter(Boolean)
  const seedDeviceTypes = [...new Set(seedFingerprints.map((f) => f.deviceType).filter(Boolean))]

  const [
    userCount,
    users,
    candidateUserIps,
    candidateLoginIps,
    candidateFps,
    ipCounts,
    vpnRows,
    clusterLogs,
    seedOwned,
    candidateBarcodes,
    seedBarcodes,
    candidateWishlist,
    seedWishlist
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        username: true,
        email: true,
        discordCreatedAt: true,
        createdAt: true,
        banned: true,
        active: true,
        isAdmin: true,
        lastLogin: true
      }
    }),
    prisma.userIP.findMany({
      where: { userId: { in: candidateIds } },
      select: { userId: true, ip: true }
    }),
    prisma.loginLog.findMany({
      where: { userId: { in: candidateIds }, ip: { in: seedIps.storedForms } },
      select: { userId: true, ip: true },
      distinct: ['userId', 'ip']
    }),
    seedVisitorIds.length
      ? prisma.deviceFingerprintLog.findMany({
          where: { userId: { in: candidateIds } },
          select: { userId: true, visitorId: true, deviceType: true },
          distinct: ['userId', 'visitorId']
        })
      : [],
    ipUserCounts(prisma, [...seedIps.storedForms, ...subnet.forms]),
    prisma.vpnLog.findMany({
      where: { ip: { in: seedIps.storedForms }, isVpn: true },
      select: { ip: true },
      distinct: ['ip']
    }),
    prisma.ctoonOwnerLog.findMany({
      where: {
        OR: [
          { userId: { in: seed.seedIds }, counterpartyUserId: { in: candidateIds } },
          { counterpartyUserId: { in: seed.seedIds }, userId: { in: candidateIds } }
        ]
      },
      select: { userId: true, counterpartyUserId: true, createdAt: true }
    }),
    prisma.ctoonOwnerLog.findMany({
      where: { userId: { in: seed.seedIds }, userCtoonId: { not: null } },
      select: { userCtoonId: true },
      distinct: ['userCtoonId']
    }),
    prisma.userBarcodeScan.findMany({
      where: { userId: { in: candidateIds } },
      select: { userId: true, mappingId: true }
    }),
    prisma.userBarcodeScan.findMany({
      where: { userId: { in: seed.seedIds } },
      select: { mappingId: true },
      distinct: ['mappingId']
    }),
    prisma.wishlistItem.findMany({
      where: { userId: { in: candidateIds } },
      select: { userId: true, ctoonId: true }
    }),
    prisma.wishlistItem.findMany({
      where: { userId: { in: seed.seedIds } },
      select: { ctoonId: true },
      distinct: ['ctoonId']
    })
  ])

  // Items the cluster once owned that a candidate now holds — the strongest
  // "he came back for his stuff" signal. Bounded by the seed's own history.
  const seedOwnedIds = seedOwned.map((r) => r.userCtoonId).filter(Boolean)
  const reacquired = seedOwnedIds.length
    ? await prisma.ctoonOwnerLog.findMany({
        where: {
          userCtoonId: { in: seedOwnedIds },
          userId: { in: candidateIds },
          ...(banAt ? { createdAt: { gte: new Date(banAt) } } : {})
        },
        select: {
          userId: true,
          mintNumber: true,
          createdAt: true,
          ctoon: { select: { name: true, rarity: true } }
        }
      })
    : []

  // Barcode rarity: how many distinct users scanned each shared product.
  const seedMappingIds = seedBarcodes.map((b) => b.mappingId)
  const barcodeCounts = new Map()
  if (seedMappingIds.length) {
    const rows = await prisma.userBarcodeScan.findMany({
      where: { mappingId: { in: seedMappingIds } },
      select: { mappingId: true, userId: true }
    })
    for (const r of rows) {
      if (!barcodeCounts.has(r.mappingId)) barcodeCounts.set(r.mappingId, new Set())
      barcodeCounts.get(r.mappingId).add(r.userId)
    }
  }

  // Wishlist rarity: how many users want each shared cToon.
  const seedWishIds = seedWishlist.map((w) => w.ctoonId)
  const wishCounts = new Map()
  if (seedWishIds.length) {
    const grouped = await prisma.wishlistItem.groupBy({
      by: ['ctoonId'],
      where: { ctoonId: { in: seedWishIds } },
      _count: { _all: true }
    })
    for (const g of grouped) wishCounts.set(g.ctoonId, g._count._all)
  }

  // Degree of each seed account: a mule who deals with three people makes
  // contact far more meaningful than a hub who deals with three hundred.
  const seedDegrees = new Map()
  {
    const rows = await prisma.ctoonOwnerLog.findMany({
      where: { userId: { in: seed.seedIds }, counterpartyUserId: { not: null } },
      select: { userId: true, counterpartyUserId: true }
    })
    for (const r of rows) {
      if (!seedDegrees.has(r.userId)) seedDegrees.set(r.userId, new Set())
      seedDegrees.get(r.userId).add(r.counterpartyUserId)
    }
  }

  // ── Fold everything into per-candidate evidence objects ────────────────────
  const seedUsernameById = new Map(
    [{ id: seed.primary.id, username: seed.primary.username }, ...seed.knownAlts].map((u) => [
      u.id,
      u.username
    ])
  )
  const vpnIpForms = new Set(vpnRows.map((r) => r.ip))
  const exactForms = new Set(seedIps.storedForms)
  const subnetByForm = subnet.byForm

  const byUser = new Map()
  const ensure = (userId) => {
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        sharedIps: [],
        sharedSubnets: [],
        sharedVisitorIds: [],
        clusterContacts: [],
        reacquiredMints: [],
        sharedBarcodes: [],
        sharedWishlist: [],
        deviceTypes: [],
        surfacedBy: [...(surfaced.get(userId) || [])]
      })
    }
    return byUser.get(userId)
  }

  const dfFor = (form) => (ipCounts.get(form)?.size ?? 2)

  const seenIp = new Set()
  for (const row of [...candidateUserIps, ...candidateLoginIps]) {
    const key = `${row.userId}|${row.ip}`
    if (seenIp.has(key)) continue
    seenIp.add(key)
    const ev = ensure(row.userId)
    if (exactForms.has(row.ip)) {
      const plain = normalizeIp(decryptIp(row.ip))
      ev.sharedIps.push({ ip: row.ip, df: dfFor(row.ip), masked: maskIp(plain) })
    } else if (subnetByForm.has(row.ip)) {
      ev.sharedSubnets.push({ subnet: subnetByForm.get(row.ip), df: dfFor(row.ip) })
    }
  }

  const seedVisitorSet = new Set(seedVisitorIds)
  const fpUserCounts = new Map()
  for (const row of candidateFps) {
    if (!seedVisitorSet.has(row.visitorId)) continue
    if (!fpUserCounts.has(row.visitorId)) fpUserCounts.set(row.visitorId, new Set())
    fpUserCounts.get(row.visitorId).add(row.userId)
  }
  for (const row of candidateFps) {
    const ev = ensure(row.userId)
    if (row.deviceType && !ev.deviceTypes.includes(row.deviceType)) ev.deviceTypes.push(row.deviceType)
    if (!seedVisitorSet.has(row.visitorId)) continue
    ev.sharedVisitorIds.push({
      visitorId: row.visitorId,
      df: (fpUserCounts.get(row.visitorId)?.size ?? 1) + seed.seedIds.length
    })
  }

  const contactTally = new Map()
  for (const log of clusterLogs) {
    const seedSide = seedUsernameById.has(log.userId) ? log.userId : log.counterpartyUserId
    const otherSide = seedUsernameById.has(log.userId) ? log.counterpartyUserId : log.userId
    if (!otherSide || !seedUsernameById.has(seedSide)) continue
    const key = `${otherSide}|${seedSide}`
    contactTally.set(key, (contactTally.get(key) || 0) + 1)
  }
  for (const [key, interactions] of contactTally) {
    const [otherSide, seedSide] = key.split('|')
    ensure(otherSide).clusterContacts.push({
      username: seedUsernameById.get(seedSide),
      interactions,
      partnerDegree: seedDegrees.get(seedSide)?.size ?? 1
    })
  }

  for (const row of reacquired) {
    ensure(row.userId).reacquiredMints.push({
      name: row.ctoon?.name || 'unknown',
      rarity: row.ctoon?.rarity || null,
      mintNumber: row.mintNumber,
      lowMint: Number.isFinite(row.mintNumber) && row.mintNumber <= 10,
      circulation: 50,
      acquiredAt: row.createdAt
    })
  }

  const seedMappingSet = new Set(seedMappingIds)
  for (const row of candidateBarcodes) {
    if (!seedMappingSet.has(row.mappingId)) continue
    ensure(row.userId).sharedBarcodes.push({
      label: `barcode ${String(row.mappingId).slice(0, 8)}`,
      df: barcodeCounts.get(row.mappingId)?.size ?? 2
    })
  }

  const seedWishSet = new Set(seedWishIds)
  for (const row of candidateWishlist) {
    if (!seedWishSet.has(row.ctoonId)) continue
    ensure(row.userId).sharedWishlist.push({
      name: row.ctoonId,
      wantedBy: wishCounts.get(row.ctoonId) ?? 2
    })
  }

  for (const u of users) {
    const ev = ensure(u.id)
    ev.username = u.username
    ev.email = u.email
    ev.discordCreatedAt = u.discordCreatedAt
    ev.firstSeenAt = u.createdAt
    ev.banned = u.banned
    ev.active = u.active
    ev.isAdmin = u.isAdmin
    ev.activeBeforeBanDays =
      banAt && u.createdAt < new Date(banAt)
        ? Math.floor((new Date(banAt) - u.createdAt) / 86400000)
        : 0
  }

  const context = {
    userCount,
    banAt,
    suspectEmail: seed.primary.email,
    suspectDevices: seedDeviceTypes,
    vpnIps: vpnIpForms
  }

  const ranked = rankCandidates([...byUser.values()], context)

  const coverage = await suspectCoverage(prisma, seed.seedIds)

  return {
    suspect: {
      id: seed.primary.id,
      username: seed.primary.username,
      banned: seed.primary.banned,
      banAt,
      banReason: seed.banReason,
      knownAlts: seed.knownAlts.map((a) => a.username)
    },
    coverage,
    candidatesConsidered: candidateIds.length,
    userCount,
    results: ranked
  }
}

/** Row counts behind each channel, so "no match" is distinguishable from "no data". */
async function suspectCoverage(prisma, seedIds) {
  const [loginLogs, fingerprints, survey, trades, barcodes] = await Promise.all([
    prisma.loginLog.count({ where: { userId: { in: seedIds } } }),
    prisma.deviceFingerprintLog.count({ where: { userId: { in: seedIds } } }),
    prisma.surveyAnswers.count({ where: { userId: { in: seedIds } } }),
    prisma.ctoonOwnerLog.count({ where: { userId: { in: seedIds } } }),
    prisma.userBarcodeScan.count({ where: { userId: { in: seedIds } } })
  ])
  return buildCoverage({ loginLogs, fingerprints, survey, trades, barcodes })
}

async function emptyResult(seed, banAt, prisma) {
  return {
    suspect: {
      id: seed.primary.id,
      username: seed.primary.username,
      banned: seed.primary.banned,
      banAt,
      banReason: seed.banReason,
      knownAlts: seed.knownAlts.map((a) => a.username)
    },
    coverage: await suspectCoverage(prisma, seed.seedIds),
    candidatesConsidered: 0,
    userCount: await prisma.user.count(),
    results: []
  }
}

export { CAPS }
