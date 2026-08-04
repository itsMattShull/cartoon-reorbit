/**
 * Alt Account Investigator — scoring engine.
 *
 * Pure and DB-free on purpose: it takes plain evidence objects in and returns
 * scores out, so the Nitro endpoint, the CLI in prisma/, and tests/ can all
 * share it without Nitro's `@/` alias resolution or a Prisma client.
 *
 * ── Why bits, not a 0-100 score ──────────────────────────────────────────────
 * Every observation is scored as a log-likelihood ratio:
 *
 *     bits = log2( P(observation | same person) / P(observation | strangers) )
 *
 * Summing bits across INDEPENDENT channels gives an interpretable total: 20
 * bits means the evidence is ~1,000,000x more likely under "same person" than
 * under coincidence. Two properties matter more than the interpretability:
 *
 *   1. Rarity falls out automatically. Sharing an IP that only two accounts
 *      have ever used is strong; sharing a carrier-grade NAT address that
 *      3,000 accounts have used is nearly worthless. A flat weighted sum
 *      cannot express that difference and will rank households and school
 *      networks at the top.
 *   2. Evidence can be NEGATIVE. A weighted sum floors at zero, so it always
 *      produces a #1 suspect — even when the banned user never came back. That
 *      is the failure mode that gets an innocent player banned. Bits let
 *      "these two accounts were repeatedly active in the same minute" or "this
 *      Discord account predates the ban by two years" subtract.
 *
 * ── Channels ────────────────────────────────────────────────────────────────
 * Bits may only be summed across channels that fail independently. The obvious
 * grouping (network / device / behaviour) is wrong: exact IP, /24, ASN, ISP and
 * country are five views of ONE observation, and UserIP / LoginLog / VpnLog
 * store the same IP written by the same middleware. Summing those lets a single
 * data point corroborate itself into a false conviction. Channels here are
 * independent causal paths, and within a channel we take the MAX, not the sum.
 */

// Channel identifiers. Corroboration is counted across these.
export const CHANNELS = {
  NETWORK: 'network', // how packets reach us
  DEVICE: 'device', // the browser/hardware
  IDENTITY: 'identity', // external identity: Discord, email
  CONTENT: 'content', // text the user authored
  ECONOMY: 'economy', // in-game economic + social graph
  PHYSICAL: 'physical' // real-world objects (barcodes)
}

// Per-channel ceilings. No single channel may on its own push a candidate into
// the top tier — a spoofable client-supplied fingerprint must not read as
// proof. See DEVICE especially: visitorId is an unauthenticated string from the
// browser (server/api/auth/device-fingerprint.post.js accepts any 8-128 chars).
export const CHANNEL_CAPS = {
  [CHANNELS.NETWORK]: 14,
  [CHANNELS.DEVICE]: 10,
  [CHANNELS.IDENTITY]: 12,
  [CHANNELS.CONTENT]: 6,
  [CHANNELS.ECONOMY]: 18,
  [CHANNELS.PHYSICAL]: 16
}

// Tiers are deliberately conservative, and every tier above LOW additionally
// requires corroboration from independent channels (see tierFor).
export const TIERS = [
  { id: 'compelling', label: 'Compelling', minBits: 30, minChannels: 3 },
  { id: 'strong', label: 'Strong', minBits: 20, minChannels: 2 },
  { id: 'possible', label: 'Possible', minBits: 12, minChannels: 2 },
  { id: 'weak', label: 'Weak', minBits: 6, minChannels: 1 },
  { id: 'noise', label: 'Not significant', minBits: -Infinity, minChannels: 0 }
]

/**
 * Bits of evidence from sharing a feature, given how many distinct users have
 * that feature. This is the workhorse: it converts "they share X" into "how
 * surprising is it that they share X".
 *
 * With `df` users carrying the feature out of `n` total, the chance that a
 * random stranger also carries it is df/n, so the evidence is log2(n/df).
 * A feature only two accounts share is worth a lot; one that a third of the
 * site shares is worth ~1.5 bits.
 *
 * @param {number} df    distinct users carrying the feature (including both parties)
 * @param {number} n     total users in the population
 * @param {number} cap   maximum bits this single feature may contribute
 */
export function rarityBits(df, n, cap = 12) {
  if (!Number.isFinite(df) || !Number.isFinite(n) || df <= 0 || n <= 0) return 0
  // A feature nobody else shares still can't be worth more than the population
  // can justify; and df is never meaningfully below 2 for a *shared* feature.
  const effectiveDf = Math.max(df, 2)
  if (effectiveDf >= n) return 0
  return Math.min(cap, Math.log2(n / effectiveDf))
}

/**
 * Diminishing returns for repeated observations of the same kind.
 *
 * Sharing five IPs is stronger than sharing one, but not five times stronger —
 * they are correlated (same house, same trip, same ISP reassignment). The k-th
 * additional observation contributes 1/k of a full unit.
 */
export function diminishing(values) {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => b - a)
  let total = 0
  for (let i = 0; i < sorted.length; i++) total += sorted[i] / (i + 1)
  return total
}

function clampChannel(channel, bits) {
  const cap = CHANNEL_CAPS[channel] ?? 12
  // Negative evidence is not capped by the positive ceiling — being able to
  // rule someone out decisively is the point.
  return bits > 0 ? Math.min(bits, cap) : bits
}

/**
 * Normalize a Gmail-style local part: strip dots and +suffix, lowercase.
 * `Zen.Viking+alt@gmail.com` and `zenviking@gmail.com` are one inbox, and
 * reusing the underlying account is a common evader mistake. Only Google
 * treats dots as insignificant, so restrict that part to Gmail domains.
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) return null
  let local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus !== -1) local = local.slice(0, plus)
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '')
  if (!local) return null
  return { local, domain, normalized: `${local}@${domain}` }
}

/**
 * Jaccard-style overlap that returns the shared members, so callers can show
 * the admin *what* matched rather than just a coefficient.
 */
export function overlap(aSet, bSet) {
  const a = aSet instanceof Set ? aSet : new Set(aSet || [])
  const b = bSet instanceof Set ? bSet : new Set(bSet || [])
  const shared = []
  for (const v of a) if (b.has(v)) shared.push(v)
  const unionSize = a.size + b.size - shared.length
  return { shared, jaccard: unionSize > 0 ? shared.length / unionSize : 0, aSize: a.size, bSize: b.size }
}

/**
 * ── Signal builders ─────────────────────────────────────────────────────────
 * Each returns { channel, key, label, bits, detail } or null when it has
 * nothing to say. `detail` is rendered to the admin as the "why".
 */

/** Shared IP addresses, rarity-weighted, with VPN/datacenter exits discounted. */
export function ipSignal({ sharedIps = [], userCount, vpnIps = new Set() }) {
  if (!sharedIps.length || !userCount) return null

  const perIp = []
  const evidence = []
  for (const entry of sharedIps) {
    const { ip, df, masked } = entry
    // Two accounts behind the same commercial VPN exit is not evidence — that
    // is what a VPN is for, and the suspect is known to use one. Discount to
    // near-zero rather than dropping it, so it still shows in the UI.
    const isVpn = vpnIps.has(ip)
    const raw = rarityBits(df, userCount, 12)
    const bits = isVpn ? Math.min(raw, 0.5) : raw
    perIp.push(bits)
    evidence.push({ ip: masked, sharedBy: df, bits: round(bits), vpn: isVpn })
  }

  const bits = diminishing(perIp)
  if (bits <= 0) return null
  return {
    channel: CHANNELS.NETWORK,
    key: 'sharedIp',
    label: 'Shared IP address',
    bits,
    detail: { ips: evidence.sort((a, b) => b.bits - a.bits).slice(0, 10) }
  }
}

/**
 * Shared /24 (or IPv6 /64). Strictly weaker than a shared exact IP and NESTED
 * inside it — same IP implies same subnet. The caller must pass only subnets
 * where no exact IP already matched, and the combiner takes the max within the
 * channel, so this can never stack on top of ipSignal.
 */
export function subnetSignal({ sharedSubnets = [], userCount }) {
  if (!sharedSubnets.length || !userCount) return null
  const per = sharedSubnets.map(({ df }) => rarityBits(df, userCount, 8) * 0.6)
  const bits = diminishing(per)
  if (bits <= 0) return null
  return {
    channel: CHANNELS.NETWORK,
    key: 'sharedSubnet',
    label: 'Shared subnet',
    bits,
    detail: {
      subnets: sharedSubnets
        .map((s) => ({ subnet: `${s.subnet}.0/24`, sharedBy: s.df }))
        .slice(0, 10)
    }
  }
}

/**
 * Shared browser fingerprint. High signal when honest, but the visitorId is a
 * client-supplied string with no integrity check, so it is both trivially
 * randomized (evasion) and trivially replayed (framing an innocent user).
 * Capped hard and always flagged as rebuttable.
 */
export function fingerprintSignal({ sharedVisitorIds = [], userCount }) {
  if (!sharedVisitorIds.length || !userCount) return null
  const per = sharedVisitorIds.map(({ df }) => rarityBits(df, userCount, 10))
  const bits = diminishing(per)
  if (bits <= 0) return null
  return {
    channel: CHANNELS.DEVICE,
    key: 'sharedFingerprint',
    label: 'Shared browser fingerprint',
    bits,
    caveat: 'visitorId is supplied by the client and can be randomized or replayed — treat as corroborating, never conclusive.',
    detail: {
      fingerprints: sharedVisitorIds.map((f) => ({
        // Never expose the full visitorId: it is a replayable credential for
        // manufacturing a device match against any account.
        prefix: String(f.visitorId || '').slice(0, 8),
        sharedBy: f.df
      }))
    }
  }
}

/** Same underlying email inbox, after Gmail normalization. */
export function emailSignal({ suspectEmail, candidateEmail }) {
  const a = normalizeEmail(suspectEmail)
  const b = normalizeEmail(candidateEmail)
  if (!a || !b) return null

  if (a.normalized === b.normalized) {
    return {
      channel: CHANNELS.IDENTITY,
      key: 'sameEmail',
      label: 'Same email inbox',
      bits: 12,
      detail: { match: 'exact-after-normalization', domain: a.domain }
    }
  }
  // Same local part on a different provider — someone reusing a handle.
  if (a.local === b.local && a.local.length >= 5) {
    return {
      channel: CHANNELS.IDENTITY,
      key: 'sameEmailLocal',
      label: 'Same email handle, different provider',
      bits: 7,
      detail: { match: 'local-part', domains: [a.domain, b.domain] }
    }
  }
  return null
}

/**
 * Discord account created in the window between the suspect's ban and this
 * account's first login.
 *
 * Note this is NOT "the Discord account is new" — in a Discord-OAuth-only game
 * most new players have young Discord accounts, so that alone is near-zero
 * evidence. What matters is a fresh account appearing right after the ban.
 * An account that predates the ban by a long stretch is evidence AGAINST.
 */
export function discordTimingSignal({ banAt, discordCreatedAt, firstSeenAt }) {
  if (!banAt || !discordCreatedAt) return null
  const ban = new Date(banAt).getTime()
  const created = new Date(discordCreatedAt).getTime()
  if (!Number.isFinite(ban) || !Number.isFinite(created)) return null

  const DAY = 86400000
  const daysAfterBan = (created - ban) / DAY

  if (daysAfterBan >= 0 && daysAfterBan <= 45) {
    // Tightest right after the ban, decaying across the window.
    const bits = 6 * (1 - daysAfterBan / 45) + 1
    return {
      channel: CHANNELS.IDENTITY,
      key: 'discordCreatedAfterBan',
      label: 'Discord account created shortly after the ban',
      bits,
      detail: { daysAfterBan: round(daysAfterBan), discordCreatedAt, firstSeenAt }
    }
  }

  // Created well before the ban and therefore not made for this purpose.
  // Weak exculpatory evidence — an aged account can still be bought or borrowed.
  if (daysAfterBan < -365) {
    return {
      channel: CHANNELS.IDENTITY,
      key: 'discordPredatesBan',
      label: 'Discord account long predates the ban',
      bits: -3,
      detail: { yearsBeforeBan: round(-daysAfterBan / 365, 2), discordCreatedAt }
    }
  }
  return null
}

/** Near-duplicate survey text — catches literal copy-paste between accounts. */
export function surveyDuplicateSignal({ minhashSimilarity, aiScore }) {
  const signals = []
  if (Number.isFinite(minhashSimilarity) && minhashSimilarity >= 0.6) {
    signals.push({
      channel: CHANNELS.CONTENT,
      key: 'surveyNearDuplicate',
      label: 'Near-duplicate survey answers',
      bits: Math.min(6, (minhashSimilarity - 0.5) * 12),
      detail: { similarity: round(minhashSimilarity, 3) }
    })
  }
  // Not identity evidence on its own, but a returning evader pasting LLM text
  // to dodge stylometry is itself worth flagging to the admin.
  if (Number.isFinite(aiScore) && aiScore >= 0.85) {
    signals.push({
      channel: CHANNELS.CONTENT,
      key: 'surveyAiGenerated',
      label: 'Survey answers look AI-generated',
      bits: 1,
      detail: { aiScore: round(aiScore, 3) }
    })
  }
  return signals
}

/**
 * Contact with the banned user's known cluster (the account itself plus any
 * previously-confirmed alts/mules).
 *
 * This is the signal an evader cannot avoid without abandoning the network and
 * the loot he came back for. Weighted by how selective each contact is: trading
 * with a hub who deals with 300 people means little; trading with a mule who
 * has dealt with 3 means a lot.
 */
export function clusterContactSignal({ contacts = [], userCount }) {
  if (!contacts.length || !userCount) return null

  const per = contacts.map(({ partnerDegree, interactions }) => {
    const base = rarityBits(partnerDegree, userCount, 10)
    // Repeated dealings are more than a one-off.
    const volume = Math.min(2, Math.log2(1 + (interactions || 1)))
    return base + volume
  })

  let bits = diminishing(per)
  // Touching two or more separate known-bad accounts is far harder to explain
  // as coincidence than touching one.
  if (contacts.length >= 2) bits += 4
  if (contacts.length >= 3) bits += 3

  return {
    channel: CHANNELS.ECONOMY,
    key: 'knownClusterContact',
    label: 'Traded with the banned account or its known alts',
    bits,
    detail: {
      contacts: contacts.map((c) => ({
        username: c.username,
        interactions: c.interactions,
        partnerDegree: c.partnerDegree
      }))
    }
  }
}

/**
 * Reacquiring specific mint-numbered items the banned account used to own.
 * Every UserCtoon is globally unique (@@unique([ctoonId, mintNumber])) and
 * CtoonOwnerLog survives both ban and dissolve, so the trail persists.
 */
export function mintProvenanceSignal({ reacquiredMints = [], userCount }) {
  if (!reacquiredMints.length) return null

  const per = reacquiredMints.map((m) => {
    // A rare or low-mint item is a much stronger draw than a common one.
    const rarityBonus = m.lowMint ? 3 : 0
    const scarcity = rarityBits(m.circulation || 50, userCount || 1000, 6)
    return 2 + scarcity + rarityBonus
  })

  return {
    channel: CHANNELS.ECONOMY,
    key: 'mintProvenance',
    label: "Reacquired the banned account's former items",
    bits: diminishing(per),
    detail: {
      items: reacquiredMints.slice(0, 15).map((m) => ({
        name: m.name,
        mintNumber: m.mintNumber,
        rarity: m.rarity,
        acquiredAt: m.acquiredAt
      })),
      totalItems: reacquiredMints.length
    }
  }
}

/** Shared trade counterparties beyond the known cluster, rarity-weighted. */
export function counterpartySignal({ sharedPartners = [], userCount }) {
  if (!sharedPartners.length || !userCount) return null
  const per = sharedPartners.map(({ degree }) => rarityBits(degree, userCount, 7))
  const bits = diminishing(per) * 0.7
  if (bits <= 0) return null
  return {
    channel: CHANNELS.ECONOMY,
    key: 'sharedCounterparties',
    label: 'Shared trading partners',
    bits,
    detail: {
      partners: sharedPartners.slice(0, 12).map((p) => ({ username: p.username, degree: p.degree }))
    }
  }
}

/**
 * Overlapping wishlist / trade-list entries. A wishlist is aspirational and
 * self-selected, so it is far more idiosyncratic than a collection (which is
 * mostly determined by which packs were on sale when you joined).
 */
export function wishlistSignal({ sharedItems = [], userCount }) {
  if (sharedItems.length < 2 || !userCount) return null
  const per = sharedItems.map(({ wantedBy }) => rarityBits(wantedBy, userCount, 6))
  const bits = diminishing(per) * 0.6
  if (bits <= 0) return null
  return {
    channel: CHANNELS.ECONOMY,
    key: 'wishlistOverlap',
    label: 'Overlapping wishlists',
    bits,
    detail: { items: sharedItems.slice(0, 12).map((i) => ({ name: i.name, wantedBy: i.wantedBy })) }
  }
}

/** Deck composition — players rebuild their pet deck on a new account. */
export function deckSignal({ sharedCards = [], userCount, deckSize }) {
  if (sharedCards.length < 3 || !userCount) return null
  const per = sharedCards.map(({ playedBy }) => rarityBits(playedBy, userCount, 5))
  let bits = diminishing(per) * 0.6
  // Near-identical decks are much more telling than a few shared staples.
  if (deckSize && sharedCards.length / deckSize >= 0.75) bits += 3
  if (bits <= 0) return null
  return {
    channel: CHANNELS.ECONOMY,
    key: 'deckSimilarity',
    label: 'Similar Clash deck composition',
    bits,
    detail: { sharedCards: sharedCards.slice(0, 12).map((c) => c.name), sharedCount: sharedCards.length }
  }
}

/**
 * Scanned the same physical barcodes.
 *
 * The most evasion-resistant signal available: a VPN, a fresh browser and a new
 * Discord account do nothing here, because it requires physically owning
 * different objects. IDF-weighted — a Coca-Cola can is worthless, a specific
 * niche product is close to conclusive.
 */
export function barcodeSignal({ sharedBarcodes = [], userCount }) {
  if (!sharedBarcodes.length || !userCount) return null
  const per = sharedBarcodes.map(({ df }) => rarityBits(df, userCount, 14))
  const bits = diminishing(per)
  if (bits <= 0) return null
  return {
    channel: CHANNELS.PHYSICAL,
    key: 'sharedBarcodes',
    label: 'Scanned the same physical barcodes',
    bits,
    detail: {
      barcodes: sharedBarcodes
        .map((b) => ({ label: b.label || 'unknown product', scannedBy: b.df }))
        .slice(0, 10)
    }
  }
}

/**
 * ── Negative evidence ───────────────────────────────────────────────────────
 * Without these, the household/sibling case is indistinguishable from an alt:
 * siblings max out network, device, social AND economic similarity at once.
 */

/**
 * Repeated simultaneous activity. Two people in one house are frequently active
 * in the same few minutes; one person alternating between accounts almost never
 * is. This is the single best household discriminator.
 */
export function coActivitySignal({ concurrentWindows = 0, comparableWindows = 0 }) {
  if (!comparableWindows || comparableWindows < 20) return null
  const rate = concurrentWindows / comparableWindows
  if (rate < 0.02) {
    // Never online together despite plenty of overlap in active periods —
    // mildly consistent with one person switching accounts.
    return {
      channel: CHANNELS.NETWORK,
      key: 'neverConcurrent',
      label: 'Never active at the same time',
      bits: 2,
      detail: { concurrentWindows, comparableWindows }
    }
  }
  if (rate >= 0.15) {
    const bits = -Math.min(14, 6 + rate * 20)
    return {
      channel: CHANNELS.NETWORK,
      key: 'frequentlyConcurrent',
      label: 'Frequently active at the same time — likely two different people',
      bits,
      detail: { concurrentWindows, comparableWindows, rate: round(rate, 3) }
    }
  }
  return null
}

/** Disjoint device classes, e.g. iOS-only vs Windows-only. */
export function deviceMismatchSignal({ suspectDevices = [], candidateDevices = [] }) {
  if (!suspectDevices.length || !candidateDevices.length) return null
  const { shared } = overlap(new Set(suspectDevices), new Set(candidateDevices))
  if (shared.length === 0) {
    return {
      channel: CHANNELS.DEVICE,
      key: 'deviceMismatch',
      label: 'No device platform in common',
      bits: -4,
      detail: { suspectDevices, candidateDevices }
    }
  }
  return null
}

/** The candidate was already active well before the ban, alongside the suspect. */
export function precedesBanSignal({ candidateFirstSeen, banAt, activeBeforeBanDays = 0 }) {
  if (!candidateFirstSeen || !banAt) return null
  const first = new Date(candidateFirstSeen).getTime()
  const ban = new Date(banAt).getTime()
  if (!Number.isFinite(first) || !Number.isFinite(ban) || first >= ban) return null
  if (activeBeforeBanDays < 60) return null
  return {
    channel: CHANNELS.IDENTITY,
    key: 'activeBeforeBan',
    label: 'Was already active long before the ban',
    bits: -5,
    detail: { candidateFirstSeen, activeBeforeBanDays }
  }
}

/**
 * Combine signals into a scored candidate.
 *
 * Within a channel we take the maximum positive signal plus diminished
 * contributions from the rest, because same-channel signals are correlated
 * views of one underlying fact. Negative evidence always applies in full.
 */
export function combineSignals(signals) {
  const byChannel = new Map()
  for (const sig of signals.filter(Boolean)) {
    if (!byChannel.has(sig.channel)) byChannel.set(sig.channel, [])
    byChannel.get(sig.channel).push(sig)
  }

  const channelScores = {}
  let totalBits = 0
  let corroboratingChannels = 0

  for (const [channel, sigs] of byChannel) {
    const positives = sigs.filter((s) => s.bits > 0).map((s) => s.bits)
    const negatives = sigs.filter((s) => s.bits < 0).reduce((a, s) => a + s.bits, 0)

    const positiveBits = clampChannel(channel, diminishing(positives))
    const channelBits = positiveBits + negatives

    channelScores[channel] = {
      bits: round(channelBits),
      signals: sigs.map((s) => ({
        key: s.key,
        label: s.label,
        bits: round(s.bits),
        caveat: s.caveat || null,
        detail: s.detail || null
      }))
    }
    totalBits += channelBits
    // A channel only counts toward corroboration if it contributes real weight
    // on its own — otherwise three trivial signals would fake a strong case.
    if (positiveBits >= 3) corroboratingChannels++
  }

  return {
    bits: round(totalBits),
    channels: channelScores,
    corroboratingChannels,
    tier: tierFor(totalBits, corroboratingChannels)
  }
}

/**
 * Map bits + corroboration onto a tier. The channel requirement is what stops a
 * single spoofable signal from reading as proof: 30 bits of fingerprint match
 * and nothing else cannot reach "Compelling".
 */
export function tierFor(bits, corroboratingChannels) {
  for (const tier of TIERS) {
    if (bits >= tier.minBits && corroboratingChannels >= tier.minChannels) return tier.id
  }
  return 'noise'
}

/**
 * Describe what evidence was actually available, so "no match" can be
 * distinguished from "no data". A suspect with zero DeviceFingerprintLog rows
 * scores 0 on device the same way a genuine non-match does, and an admin must
 * not read that silence as exculpatory. DeviceFingerprintLog, SurveyAnswers and
 * VpnLog all shipped in late May 2026, so for anyone banned soon after there
 * may be only weeks of history.
 */
export function buildCoverage(suspectCounts = {}) {
  const checks = [
    { key: 'loginLogs', channel: CHANNELS.NETWORK, label: 'Login/IP history' },
    { key: 'fingerprints', channel: CHANNELS.DEVICE, label: 'Browser fingerprints' },
    { key: 'survey', channel: CHANNELS.CONTENT, label: 'Survey answers' },
    { key: 'trades', channel: CHANNELS.ECONOMY, label: 'Trade history' },
    { key: 'barcodes', channel: CHANNELS.PHYSICAL, label: 'Barcode scans' }
  ]
  return checks.map((c) => ({
    ...c,
    rows: suspectCounts[c.key] ?? 0,
    available: (suspectCounts[c.key] ?? 0) > 0
  }))
}

function round(n, places = 2) {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * Score one candidate against the suspect cluster.
 * `evidence` is assembled by server/utils/altAccountEvidence.js (or the CLI).
 */
export function scoreCandidate(evidence, context) {
  const { userCount, banAt } = context
  const signals = [
    ipSignal({ sharedIps: evidence.sharedIps, userCount, vpnIps: context.vpnIps }),
    subnetSignal({ sharedSubnets: evidence.sharedSubnets, userCount }),
    fingerprintSignal({ sharedVisitorIds: evidence.sharedVisitorIds, userCount }),
    emailSignal({ suspectEmail: context.suspectEmail, candidateEmail: evidence.email }),
    discordTimingSignal({
      banAt,
      discordCreatedAt: evidence.discordCreatedAt,
      firstSeenAt: evidence.firstSeenAt
    }),
    ...surveyDuplicateSignal({
      minhashSimilarity: evidence.minhashSimilarity,
      aiScore: evidence.aiScore
    }),
    clusterContactSignal({ contacts: evidence.clusterContacts, userCount }),
    mintProvenanceSignal({ reacquiredMints: evidence.reacquiredMints, userCount }),
    counterpartySignal({ sharedPartners: evidence.sharedPartners, userCount }),
    wishlistSignal({ sharedItems: evidence.sharedWishlist, userCount }),
    deckSignal({
      sharedCards: evidence.sharedDeckCards,
      userCount,
      deckSize: evidence.deckSize
    }),
    barcodeSignal({ sharedBarcodes: evidence.sharedBarcodes, userCount }),
    coActivitySignal({
      concurrentWindows: evidence.concurrentWindows,
      comparableWindows: evidence.comparableWindows
    }),
    deviceMismatchSignal({
      suspectDevices: context.suspectDevices,
      candidateDevices: evidence.deviceTypes
    }),
    precedesBanSignal({
      candidateFirstSeen: evidence.firstSeenAt,
      banAt,
      activeBeforeBanDays: evidence.activeBeforeBanDays
    })
  ]

  const combined = combineSignals(signals)
  return {
    userId: evidence.userId,
    username: evidence.username,
    ...combined,
    surfacedBy: evidence.surfacedBy || []
  }
}

/** Score and rank a candidate set. */
export function rankCandidates(candidates, context) {
  return candidates
    .map((c) => scoreCandidate(c, context))
    .filter((c) => c.bits > 0)
    .sort((a, b) => b.bits - a.bits)
}
