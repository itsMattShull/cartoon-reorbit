/**
 * Trusted client-IP derivation.
 *
 * Every IP-based anti-cheat signal (LoginLog, UserIP, DeviceFingerprintLog,
 * VpnLog) is only as trustworthy as this function. The previous implementation
 * took the LEFTMOST X-Forwarded-For entry, which is attacker-supplied: nginx's
 * standard `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
 * APPENDS the real peer, so a client that sends its own XFF header keeps that
 * forged value in first position. That let anyone
 *
 *   a) evade IP linkage entirely by sending a random XFF per session, and
 *   b) FRAME another account by sending a victim's IP, manufacturing shared-IP
 *      evidence that the Cheat Finder / Alt Account Investigator would then
 *      report as a near-certain match.
 *
 * The header is therefore read RIGHT-TO-LEFT. The rightmost entry is the one
 * appended by our own reverse proxy — the peer address it actually observed —
 * and each additional trusted proxy in front of it adds one more entry to skip.
 *
 * Env:
 *   TRUSTED_PROXY_HOPS  number of proxies that append to XFF (default 1).
 *                       1 = a single nginx. 2 = CDN in front of nginx.
 *                       0 = no proxy; XFF is ignored entirely.
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
// Loose IPv6 check — we only need to reject junk, not validate every RFC form.
const IPV6_RE = /^[0-9a-f:]+$/i

/**
 * Strip an IPv4-mapped IPv6 prefix and any zone/port decoration.
 *
 * Node hands back `::ffff:203.0.113.5` for the same peer that XFF reports as
 * `203.0.113.5`. Left unnormalized those encrypt to two different ciphertexts,
 * which silently splits one IP into two buckets and halves every overlap count.
 */
export function normalizeIp(raw) {
  if (!raw) return null
  let ip = String(raw).trim()
  if (!ip) return null

  // Some proxies quote entries, e.g. `"203.0.113.5"`.
  if (ip.startsWith('"') && ip.endsWith('"')) ip = ip.slice(1, -1).trim()

  // `[2001:db8::1]:443` → `2001:db8::1`
  if (ip.startsWith('[')) {
    const close = ip.indexOf(']')
    if (close !== -1) ip = ip.slice(1, close)
  }

  // IPv6 zone index: `fe80::1%eth0` → `fe80::1`
  const pct = ip.indexOf('%')
  if (pct !== -1) ip = ip.slice(0, pct)

  // IPv4-mapped IPv6
  const lower = ip.toLowerCase()
  if (lower.startsWith('::ffff:') && IPV4_RE.test(ip.slice(7))) ip = ip.slice(7)

  // `203.0.113.5:51234` → `203.0.113.5` (only when it's unambiguously IPv4)
  if (ip.includes(':') && !lower.includes('::') && ip.split(':').length === 2) {
    const [host] = ip.split(':')
    if (IPV4_RE.test(host)) ip = host
  }

  return isValidIp(ip) ? ip : null
}

export function isValidIp(ip) {
  if (!ip) return false
  const m = IPV4_RE.exec(ip)
  if (m) return m.slice(1).every((o) => Number(o) <= 255 && String(Number(o)) === String(Number(o)))
  return ip.includes(':') && IPV6_RE.test(ip)
}

function trustedHops() {
  const raw = process.env.TRUSTED_PROXY_HOPS
  if (raw === undefined || raw === '') return 1
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 1
}

/**
 * Derive the client IP for the current request.
 *
 * @param {object} event  h3 event
 * @returns {string|null} normalized IP, or null when nothing trustworthy exists
 */
export function getTrustedClientIp(event) {
  const req = event?.node?.req
  if (!req) return null

  const socketIp = normalizeIp(req.socket?.remoteAddress || req.connection?.remoteAddress)
  const hops = trustedHops()

  // No proxy in front of us: the socket peer is the only trustworthy source and
  // XFF is pure client input.
  if (hops === 0) return socketIp

  const rawHeader = req.headers['x-forwarded-for']
  if (!rawHeader) return socketIp

  // The header may legitimately appear multiple times; Node joins repeats into
  // an array. Concatenate in order so the rightmost entry is still ours.
  const header = Array.isArray(rawHeader) ? rawHeader.join(',') : String(rawHeader)
  const parts = header.split(',').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return socketIp

  // Walk right-to-left, skipping the entries our own trusted proxies appended.
  const idx = parts.length - hops
  if (idx < 0) {
    // Fewer entries than configured hops — the chain is shorter than expected
    // (direct hit on the origin, or a misconfigured proxy). Trust the socket.
    return socketIp
  }

  return normalizeIp(parts[idx]) || socketIp
}

/**
 * IPs that must never be treated as identifying, because many unrelated people
 * share them. Extends the private-range check with carrier-grade NAT, which is
 * the dominant false-positive source for a mobile-heavy player base: one
 * 100.64.0.0/10 egress address can front thousands of unrelated subscribers.
 */
const NON_IDENTIFYING_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fc|fd|fe80)/i

export function isNonIdentifyingIp(ip) {
  if (!ip) return true
  return NON_IDENTIFYING_RE.test(ip)
}

/**
 * IPv4 /24 (or IPv6 /64) prefix, used for subnet-level correlation.
 * Returns null for addresses we refuse to correlate on.
 */
export function subnetPrefix(ip) {
  if (!ip || isNonIdentifyingIp(ip)) return null
  if (IPV4_RE.test(ip)) return ip.split('.').slice(0, 3).join('.')
  if (ip.includes(':')) {
    // Expand only far enough to take the first four hextets (/64).
    const [head] = ip.split('::')
    const hextets = head.split(':').filter(Boolean)
    if (ip.includes('::') || hextets.length < 4) return null
    return hextets.slice(0, 4).join(':').toLowerCase()
  }
  return null
}

/**
 * Mask an IP for display. The investigator UI shows these instead of full
 * addresses so a routine review isn't a bulk PII export.
 */
export function maskIp(ip) {
  if (!ip) return null
  if (IPV4_RE.test(ip)) return `${ip.split('.').slice(0, 3).join('.')}.xxx`
  if (ip.includes(':')) {
    const hextets = ip.split(':').filter(Boolean)
    return `${hextets.slice(0, 3).join(':')}::/48`
  }
  return 'unknown'
}
