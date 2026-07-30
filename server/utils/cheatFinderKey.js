// Shared helpers for Cheat Finder "confirmed" matches. A group's identity is
// derived deterministically from its type + the sorted set of alias
// usernames, matching the in-memory dedup key already used when building
// the duplicate-IP/VPN group lists. Keeping this derivation server-side
// (never trusting a client-supplied groupKey) means a forged/CSRF'd request
// can't poison the confirmed set with an arbitrary key.

export const CHEAT_FINDER_TYPES = ['duplicateIps', 'duplicateVpn']

const MAX_ALIASES = 50
const MAX_USERNAME_LENGTH = 100

export function isValidCheatFinderType(type) {
  return CHEAT_FINDER_TYPES.includes(type)
}

// Normalizes + validates a client-supplied alias list, throwing on anything
// malformed rather than silently coercing it.
export function normalizeAliasUsernames(aliasUsernames) {
  if (!Array.isArray(aliasUsernames) || aliasUsernames.length === 0) {
    throw new Error('aliasUsernames must be a non-empty array')
  }
  if (aliasUsernames.length > MAX_ALIASES) {
    throw new Error('aliasUsernames exceeds maximum size')
  }
  const cleaned = aliasUsernames.map((u) => {
    if (typeof u !== 'string' || !u.trim() || u.length > MAX_USERNAME_LENGTH) {
      throw new Error('Invalid username in aliasUsernames')
    }
    return u.trim()
  })
  return Array.from(new Set(cleaned)).sort()
}

export function computeGroupKey(type, aliasUsernames) {
  const normalized = normalizeAliasUsernames(aliasUsernames)
  return normalized.join('|')
}

// Single cache key per type holding the full deduped/confirmed-filtered
// group list (pre-pagination, pre-enrichment). Confirming/unconfirming a
// match just deletes this one key instead of scanning a page/search-keyed
// keyspace, keeping invalidation O(1).
export function groupsCacheKey(type) {
  return `admin:cheat-finder:${type}:groups`
}
