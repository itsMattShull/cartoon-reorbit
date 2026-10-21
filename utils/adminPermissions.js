// Sub-admin permissions: which admin tools a restricted admin may use.
//
// Pure ESM with no Nuxt/Nitro auto-imports so the server middleware, the client and
// tests/adminPermissions.test.js can all import it. Do not import utils/adminSections.js
// from here (it dynamic-imports Vue components); that file's per-section `perm` values are
// checked against ADMIN_PERMISSION_KEYS by the contract test instead.
//
// Model: User.isAdmin = "may enter the admin console". User.adminRestricted = true narrows
// that to the tools listed in User.adminPermissions. Existing admins have adminRestricted
// false and keep every tool. The super admin is never restricted.

// One key per visible admin console tool, in nav order. A key is a section's `perm`
// (default: its key in utils/adminSections.js). Track Touch Trades is intentionally absent:
// it is super-admin only and cannot be granted.
export const ADMIN_PERMISSION_KEYS = [
  'analytics', 'collectionAnalytics', 'setAnalytics', 'packAnalytics', 'checkUserMints', 'retention',
  'manageUsers', 'manageCollection', 'cheatFinder', 'checkCheating', 'cheatingTool',
  'suspiciousActivity', 'deviceFingerprints', 'vpn-queue', 'initiateTrade',
  'ctoons', 'ctoonsBulkUpload', 'submittedCtoons', 'ctoonSuggestions', 'starterSets', 'packs',
  'backgrounds', 'czoneSearch', 'czoneContest', 'homepage', 'announcements', 'ads', 'tutorial',
  'certificate', 'encyclopedia', 'siteTheme',
  'manageSales', 'codes', 'auctions', 'dissolveQueue',
  'games', 'cMoon', 'cMoonJoinEffects', 'czoneEffects', 'cmoonChangeRequests', 'manageNavigation',
  'cMoonEnemies', 'cMoonRiddles', 'cMoonHunts', 'lotto', 'clashTournaments', 'ogGtoonTournaments',
  'scavenger', 'achievements', 'holidayEvents',
  'errorLogs', 'cronRunLogs', 'queueMonitor', 'authLogs', 'tradeLogs', 'auctionLogs',
  'ctoonOwnerLogs', 'czoneSearchLogs', 'pointLogs', 'cmoonPointLogs', 'cMoonBattleLogs',
  'achievementLogs', 'gtoonsClashLogs', 'edRpsLogs', 'pokemonBattleLogs',
  'lottoLogs', 'winWheelLogs', 'scavengerLogs', 'adminChanges',
  'globalSettings', 'production'
]

const KEY_SET = new Set(ADMIN_PERMISSION_KEYS)

export function isAdminPermissionKey (key) {
  return typeof key === 'string' && KEY_SET.has(key)
}

/**
 * Reduce a stored permission list to known keys, de-duplicated, in nav order. Anything that
 * is no longer a real permission (a renamed or removed tool) is dropped rather than trusted.
 */
export function cleanAdminPermissions (list) {
  const have = new Set(Array.isArray(list) ? list : [])
  return ADMIN_PERMISSION_KEYS.filter(k => have.has(k))
}

/**
 * { full, permissions } for a user row. `full` means every tool; otherwise only
 * `permissions`. Non-admins get an empty restricted scope.
 */
export function adminScopeOf (user) {
  if (!user?.isAdmin) return { full: false, permissions: [] }
  if (!user.adminRestricted) return { full: true, permissions: [] }
  return { full: false, permissions: cleanAdminPermissions(user.adminPermissions) }
}

export function scopeAllows (scope, perm) {
  if (!scope) return false
  if (scope.full) return true
  return Array.isArray(scope.permissions) && scope.permissions.includes(perm)
}

export function scopeAllowsAny (scope, perms) {
  return Array.isArray(perms) && perms.some(p => scopeAllows(scope, p))
}

// ── API path -> permission ────────────────────────────────────────────────────────────────
//
// First path segment under /api/admin/ -> the permissions that may call it. A segment shared
// by several tools (a cToon or background picker, global-config, ...) lists each of them; the
// endpoint is then open to a sub-admin holding ANY of those. A segment missing from this table
// is DENIED to restricted admins (fail closed), so a new endpoint is unreachable for
// sub-admins until it is mapped here. tests/adminPermissions.test.js fails if one is missing.
export const ADMIN_API_SEGMENT_PERMS = {
  'achievement-logs': ['achievementLogs'],
  achievements: ['achievements'],
  'active-discord': ['analytics'],
  'admin-changes': ['adminChanges'],
  'all-ctoons': ['ctoons'],
  announcements: ['announcements'],
  'auction-creators': ['auctions'],
  'auction-only': ['auctions'],
  'auction-winners': ['auctionLogs'],
  auctions: ['auctionLogs'],
  'auth-logs': ['authLogs'],
  avatars: ['cMoon', 'cMoonEnemies'],
  backgrounds: ['backgrounds', 'czoneSearch', 'cMoon', 'cMoonEnemies', 'achievements'],
  'cheat-finder': ['cheatFinder'],
  'cheating-tool-apply': ['cheatingTool'],
  'cheating-tool-apply-stream': ['cheatingTool'],
  'cheating-tool-report': ['cheatingTool'],
  'check-cheating': ['checkCheating', 'authLogs'],
  'clash-games': ['gtoonsClashLogs', 'clashTournaments'],
  'clash-stats': ['analytics'],
  'cmart-metrics': ['globalSettings'],
  'cmoon-admins': ['cMoon'],
  'cmoon-affinity': ['cMoon'],
  'cmoon-change-requests': ['cmoonChangeRequests'],
  'cmoon-dispersal-offers': ['cMoon'],
  'cmoon-enemy-battle-logs': ['cMoonBattleLogs'],
  'cmoon-enemy-factions': ['cMoonEnemies'],
  'cmoon-enemy-members': ['cMoonEnemies'],
  'cmoon-enemy-rewards': ['cMoonEnemies'],
  'cmoon-enemy-taunts': ['cMoonEnemies'],
  'cmoon-hunts': ['cMoonHunts'],
  'cmoon-join-effects': ['cMoon', 'cMoonJoinEffects', 'cMoonEnemies'],
  'cmoon-points-log': ['cmoonPointLogs'],
  'cmoon-rank-tiers': ['cMoon'],
  'cmoon-riddles': ['cMoonRiddles'],
  'cmoon-scoring': ['cMoon'],
  'cmoon-season': ['manageNavigation'],
  'cmoon-season-trackers': ['manageNavigation'],
  'cmoon-settings': ['cMoon', 'cMoonEnemies', 'cMoonRiddles', 'cMoonHunts'],
  'cmoon-special-attacks': ['cMoon', 'cMoonEnemies'],
  cmoons: ['manageUsers', 'cMoon', 'cMoonEnemies', 'achievements'],
  codes: ['codes'],
  'codes-redeemed': ['analytics'],
  'collection-worth': ['manageCollection'],
  'cron-error-logs': ['errorLogs'],
  'cron-run-logs': ['cronRunLogs'],
  ctoon: ['ctoons', 'ctoonsBulkUpload'],
  'ctoon-collection-analytics': ['collectionAnalytics'],
  'ctoon-duplicate': ['ctoons', 'ctoonsBulkUpload', 'submittedCtoons'],
  'ctoon-pool': ['packs', 'manageSales', 'scavenger', 'holidayEvents'],
  'ctoon-sets': ['czoneSearch'],
  'ctoon-suggestions': ['ctoonSuggestions'],
  ctoonOwnerLogs: ['ctoonOwnerLogs'],
  ctoons: ['czoneSearch'],
  'cumulative-users': ['analytics'],
  czone: ['czoneSearch'],
  'czone-contest': ['czoneContest'],
  'czone-contest-automation': ['czoneContest'],
  'czone-effects': ['cMoon', 'czoneEffects'],
  'czone-search-logs': ['czoneSearchLogs'],
  'czone-searches': ['czoneSearch', 'czoneSearchLogs'],
  dev: ['production'],
  'device-fingerprint-logs': ['deviceFingerprints'],
  'dissolve-featured-config': ['dissolveQueue'],
  'dissolve-misfires': ['dissolveQueue'],
  'dissolve-queue': ['dissolveQueue'],
  'duplicate-users': ['cheatFinder'],
  'duplicate-vpn': ['cheatFinder'],
  'edrps-matches': ['edRpsLogs'],
  'encyclopedia-entries': ['encyclopedia'],
  favicon: ['homepage'],
  'flappy-image': ['games'],
  'fruitsamurai-image': ['games'],
  'game-config': ['games', 'globalSettings'],
  'game-ctoons': ['games'],
  'game-tile-image': ['games'],
  'global-config': ['packs', 'homepage', 'certificate', 'games', 'globalSettings'],
  'gtoons-logs': ['gtoonsClashLogs'],
  'holiday-events': ['holidayEvents'],
  homepage: ['homepage'],
  'list-backgrounds': ['czoneContest', 'codes'],
  'list-ctoons': ['czoneContest', 'codes', 'cMoon', 'cMoonEnemies', 'achievements'],
  'locked-points': ['manageUsers'],
  'lotto-logs': ['lottoLogs'],
  'lotto-logs-summary': ['lottoLogs'],
  'lotto-settings': ['lotto'],
  'net-points-issues': ['analytics'],
  official: ['manageUsers', 'initiateTrade'],
  'official-collection': ['initiateTrade'],
  'official-collection-filters': ['initiateTrade'],
  oggtoons: ['ctoons'],
  // Its own first segment on purpose: under `oggtoons/` a tournament admin would need the cToons
  // tool, and a cToons admin would get tournament and prize powers.
  'og-tournaments': ['ogGtoonTournaments'],
  'pack-analytics': ['packAnalytics'],
  'pack-analytics-detail': ['setAnalytics', 'packAnalytics'],
  packs: ['packs'],
  'percentage-first-purchase': ['analytics'],
  'points-distribution': ['analytics'],
  'points-issued-by-category': ['analytics'],
  'points-log': ['pointLogs'],
  'points-spent-by-category': ['analytics'],
  'pokemonbattle-asset': ['games'],
  'pokemonbattle-audio': ['games'],
  'pokemonbattle-matches': ['pokemonBattleLogs'],
  'pokemonbattle-trainers': ['games'],
  'promo-images': ['ads'],
  purchases: ['analytics'],
  queues: ['queueMonitor'],
  'rarity-defaults': ['globalSettings'],
  'rarity-turnover-rate': ['analytics'],
  'release-settings': ['homepage'],
  'remove-cheating': ['checkCheating'],
  'reorbitmemory-cardback-image': ['games'],
  retention: ['analytics', 'retention'],
  sales: ['manageSales'],
  scavenger: ['scavenger', 'scavengerLogs'],
  'search-ctoons': ['ctoons', 'starterSets', 'czoneSearch', 'lotto', 'ctoonOwnerLogs'],
  series: ['ctoons', 'ctoonsBulkUpload', 'submittedCtoons'],
  'set-analytics': ['setAnalytics'],
  sets: ['ctoons', 'ctoonsBulkUpload', 'submittedCtoons', 'packs', 'achievements', 'holidayEvents'],
  'site-theme-settings': ['siteTheme'],
  'site-themes': ['siteTheme'],
  'socket-metrics': ['analytics'],
  'sound-presets': ['homepage'],
  'spend-earn-ratio': ['analytics'],
  'starter-sets': ['starterSets'],
  'submitted-ctoon': ['submittedCtoons'],
  'submitted-ctoons': ['submittedCtoons'],
  'suspicious-activity': ['suspiciousActivity'],
  'target-collection': ['manageCollection', 'initiateTrade'],
  'target-collection-filters': ['initiateTrade'],
  'tko-events': ['games'],
  'touch-trades': [],
  tournaments: ['clashTournaments'],
  'trade-offers': ['initiateTrade'],
  trades: ['tradeLogs'],
  'trades-requested': ['analytics'],
  tutorial: ['tutorial'],
  'unique-logins': ['analytics'],
  'user-ctoons': ['manageCollection'],
  'user-mentions': ['manageCollection', 'announcements', 'codes', 'tradeLogs', 'ctoonOwnerLogs', 'lottoLogs'],
  'user-mints': ['checkUserMints'],
  'vpn-queue-status': ['vpn-queue'],
  'win-wheel-logs': ['winWheelLogs'],
  'winball-backboard-image': ['games'],
  'winball-bumper-image': ['games'],
  'winball-grand-prize': ['games'],
  'winwheel-image': ['games'],
  'winwheel-nothing-image': ['games'],
  'winwheel-sound': ['games']
}

// Writes to these need the Global Settings tool even though other tools read them (a sub-admin
// running Manage Games can read the global config but not rewrite it). Reads use the table above.
const WRITE_ONLY_PERMS = {
  'global-config': ['globalSettings'],
  'rarity-defaults': ['globalSettings']
}

const READ_METHODS = new Set(['GET', 'HEAD'])

// Destructive or value-minting routes inside tools that are otherwise fine to grant. A sub-admin
// never gets them whichever tools are on: deleting log/job history is evidence tampering, and
// the other two hand out or destroy owned cToons.
function isFullOnlyRoute (seg, tail) {
  if (seg === 'cron-run-logs' && tail[0] === 'delete') return true
  if (seg === 'queues' && tail[1] === 'clean') return true
  if (seg === 'ctoons' && tail[1] === 'give-to-official') return true
  if (seg === 'user-ctoons') return true
  return false
}

// Who may list every user. The list is the shared picker/table behind several tools.
const USER_LIST_PERMS = ['manageUsers', 'checkCheating', 'cheatingTool', 'cMoon', 'authLogs', 'adminChanges']

// /api/admin/users/** is the one segment with different rules per sub-route.
function usersAccess (rest) {
  if (rest.length === 0) return { type: 'perms', perms: USER_LIST_PERMS }
  const [a, b] = rest
  // Granting or removing admin/sub-admin access is never available to a sub-admin.
  if (b === 'admin-access' || b === 'make-admin' || b === 'remove-admin') return { type: 'full-only' }
  // The user picker is shared with the cMoon award/assign dialogs; account transfer is not.
  if (a === 'search') return { type: 'perms', perms: ['manageUsers', 'cMoon'] }
  if (b === 'update-cmoon') return { type: 'perms', perms: ['manageUsers', 'cMoon'] }
  return { type: 'perms', perms: ['manageUsers'] }
}

// Admin-only endpoints that live outside /api/admin. A sub-admin is refused outright.
const FULL_ADMIN_ONLY_PATHS = ['/api/discord/register-commands']

/**
 * Collapse a raw request path to a canonical form before it is matched: query and hash are
 * dropped, each segment is percent-decoded, empty and `.` segments are removed and `..` is
 * resolved. A restricted admin must not be able to reach a different handler than the one the
 * rule was written for with `//`, `%2e%2e` or `./` tricks.
 */
export function normalizeAdminApiPath (raw) {
  const path = String(raw || '').split('?')[0].split('#')[0]
  const out = []
  for (const seg of path.split('/')) {
    let s = seg
    try { s = decodeURIComponent(seg) } catch { /* keep raw */ }
    for (const part of s.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') { out.pop(); continue }
      out.push(part)
    }
  }
  return '/' + out.join('/')
}

/** True for any path a restricted admin has to be checked against. */
export function isScopedAdminPath (normalized) {
  const lower = normalized.toLowerCase()
  if (lower === '/api/admin' || lower.startsWith('/api/admin/')) return true
  return FULL_ADMIN_ONLY_PATHS.some(p => lower === p || lower.startsWith(p + '/'))
}

/**
 * What a restricted admin needs for this path:
 *   { type: 'perms', perms }  any one of `perms` is enough
 *   { type: 'full-only' }     refused for every sub-admin
 *   { type: 'denied' }        not mapped, so refused (fail closed)
 */
export function adminApiAccess (normalized, method = 'GET') {
  const lower = normalized.toLowerCase()
  if (FULL_ADMIN_ONLY_PATHS.some(p => lower === p || lower.startsWith(p + '/'))) return { type: 'full-only' }
  if (!(lower === '/api/admin' || lower.startsWith('/api/admin/'))) return { type: 'denied' }
  const rest = normalized.split('/').slice(3) // ['', 'api', 'admin', ...rest]
  if (!rest.length) return { type: 'denied' }
  const [seg, ...tail] = rest
  if (seg === 'users') return usersAccess(tail)
  if (isFullOnlyRoute(seg, tail)) return { type: 'full-only' }
  if (!READ_METHODS.has(String(method).toUpperCase()) && Object.prototype.hasOwnProperty.call(WRITE_ONLY_PERMS, seg)) {
    return { type: 'perms', perms: WRITE_ONLY_PERMS[seg] }
  }
  const perms = Object.prototype.hasOwnProperty.call(ADMIN_API_SEGMENT_PERMS, seg)
    ? ADMIN_API_SEGMENT_PERMS[seg]
    : null
  if (!perms || !perms.length) return { type: 'denied' }
  return { type: 'perms', perms }
}

/** Decide one request for a given scope. Returns null when allowed, else a 403 message. */
export function adminScopeDenial (scope, rawPath, method = 'GET') {
  if (scope?.full) return null
  const normalized = normalizeAdminApiPath(rawPath)
  if (!isScopedAdminPath(normalized)) return null
  const access = adminApiAccess(normalized, method)
  if (access.type === 'full-only') return 'Forbidden — Full admins only'
  if (access.type === 'perms' && scopeAllowsAny(scope, access.perms)) return null
  return 'Forbidden — You do not have access to this admin tool'
}

// Starting points offered in the Make sub-admin modal. Only a convenience: the admin can still
// toggle any tool afterwards, and what is saved is always the explicit list.
// What the earlier fixed "sub-admin" role withheld: user management, trades on behalf of users,
// the production server, the seizure tools, codes, Auction Only, the dissolve queue and global
// settings. Everything else stays on. Existing isSubAdmin accounts were migrated to exactly this
// list (prisma/migrations/20261018130000_sub_admin_permissions).
export const STANDARD_SUB_ADMIN_WITHHELD = [
  'manageUsers', 'initiateTrade', 'production', 'cheatingTool', 'checkCheating', 'codes',
  'auctions', 'dissolveQueue', 'globalSettings'
]

export const ADMIN_PERMISSION_PRESETS = [
  {
    id: 'standard',
    label: 'Standard sub-admin (all except high-risk tools)',
    perms: ADMIN_PERMISSION_KEYS.filter(k => !STANDARD_SUB_ADMIN_WITHHELD.includes(k))
  },
  {
    id: 'moderator',
    label: 'Moderator',
    perms: ['manageUsers', 'manageCollection', 'cheatFinder', 'suspiciousActivity', 'vpn-queue',
      'tradeLogs', 'auctionLogs', 'ctoonOwnerLogs', 'pointLogs']
  },
  {
    id: 'content',
    label: 'Content manager',
    perms: ['analytics', 'ctoons', 'ctoonsBulkUpload', 'submittedCtoons', 'ctoonSuggestions', 'starterSets',
      'packs', 'backgrounds', 'czoneSearch', 'czoneContest', 'homepage', 'announcements', 'ads', 'tutorial',
      'certificate', 'encyclopedia', 'siteTheme']
  },
  {
    id: 'events',
    label: 'Event manager',
    perms: ['games', 'cMoon', 'cMoonJoinEffects', 'czoneEffects', 'cmoonChangeRequests', 'manageNavigation',
      'cMoonEnemies', 'cMoonRiddles', 'cMoonHunts', 'lotto', 'clashTournaments', 'ogGtoonTournaments', 'scavenger',
      'achievements', 'holidayEvents', 'achievementLogs', 'lottoLogs', 'winWheelLogs', 'scavengerLogs',
      'cMoonBattleLogs']
  },
  {
    id: 'logs',
    label: 'Log viewer (no sensitive logs)',
    perms: ['analytics', 'errorLogs', 'cronRunLogs', 'queueMonitor', 'tradeLogs', 'auctionLogs',
      'ctoonOwnerLogs', 'czoneSearchLogs', 'pointLogs', 'cmoonPointLogs', 'cMoonBattleLogs',
      'achievementLogs', 'gtoonsClashLogs', 'edRpsLogs', 'pokemonBattleLogs',
      'lottoLogs', 'winWheelLogs', 'scavengerLogs']
  }
]
