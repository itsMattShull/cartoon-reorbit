// Single source of truth for the admin console: what sections exist, how they
// are grouped in the nav, and which component renders each one.
//
// Both the nav and the router read this list, so a section can never be
// reachable-but-unlisted (the orphaned Pack Analytics component) or
// listed-but-unreachable (the six "Placeholder" menu entries) again.
//
// `load` is a dynamic import so each section is its own chunk — the console has
// ~60 sections and an admin opens one at a time.

const S = (key, label, group, load, extra = {}) => ({ key, label, group, load, ...extra })

const legacy = name => () => import(`../components/newsite/admin/legacy/${name}.vue`)
const nu = name => () => import(`../components/newsite/${name}.vue`)

export const ADMIN_GROUPS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'users',     label: 'Users & Moderation' },
  { id: 'content',   label: 'Content' },
  { id: 'economy',   label: 'Economy' },
  { id: 'games',     label: 'Games & Events' },
  { id: 'logs',      label: 'Logs' },
  { id: 'system',    label: 'System' }
]

export const ADMIN_SECTIONS = [
  // ── Analytics ───────────────────────────────────────────────
  S('analytics', 'Overview', 'analytics', nu('AdminAnalytics'), { isDefault: true }),
  S('collectionAnalytics', 'Collection Analytics', 'analytics', nu('AdminCtoonCollectionAnalytics')),
  S('setAnalytics', 'Set Analytics', 'analytics', nu('AdminSetAnalytics')),
  // Component existed on disk but was wired into neither the nav nor the router.
  S('packAnalytics', 'Pack Analytics', 'analytics', nu('AdminPackAnalytics')),

  // ── Users & Moderation ──────────────────────────────────────
  S('manageUsers', 'Manage Users', 'users', nu('AdminManageUsers')),
  S('cheatFinder', 'Cheat Finder', 'users', nu('AdminCheatFinder')),
  S('checkCheating', 'Check Cheating', 'users', legacy('AdminLegacyCheckCheating')),
  S('cheatingTool', 'Cheating Tool', 'users', legacy('AdminLegacyCheatingTool')),
  S('suspiciousActivity', 'Suspicious Activity', 'users', legacy('AdminLegacySuspiciousActivity')),
  S('deviceFingerprints', 'Browser Fingerprints', 'users', nu('AdminDeviceFingerprintLogs')),
  S('vpn-queue', 'VPN Queue', 'users', nu('AdminVpnQueue')),
  S('initiateTrade', 'Initiate Trade', 'users', legacy('AdminLegacyInitiateTrade')),

  // ── Content ─────────────────────────────────────────────────
  S('ctoons', 'Manage cToons', 'content', legacy('AdminLegacyCtoons')),
  S('ctoons/new', 'Add cToon', 'content', legacy('AdminLegacyCtoonsNew'), { hidden: true }),
  S('ctoons/edit', 'Edit cToon', 'content', legacy('AdminLegacyCtoonsEdit'), { hidden: true }),
  S('ctoonsBulkUpload', 'Bulk Upload cToons', 'content', legacy('AdminLegacyCtoonsBulkUpload'), { dense: true }),
  S('submittedCtoons', 'Submitted cToons', 'content', legacy('AdminLegacySubmittedCtoons')),
  S('ctoonSuggestions', 'cToon Suggestions', 'content', legacy('AdminLegacyCtoonSuggestions')),
  S('starterSets', 'Starter Sets', 'content', legacy('AdminLegacyStarterSets')),
  S('packs', 'Manage Packs', 'content', legacy('AdminLegacyPacks')),
  S('packs/new', 'New Pack', 'content', legacy('AdminLegacyPacksNew'), { hidden: true }),
  S('packs/edit', 'Edit Pack', 'content', legacy('AdminLegacyPacksEdit'), { hidden: true }),
  S('backgrounds', 'Backgrounds', 'content', legacy('AdminLegacyBackgrounds')),
  S('czoneSearch', 'cZone Search', 'content', legacy('AdminLegacyCzoneSearch'), { dense: true }),
  S('czoneContest', 'cZone Contests', 'content', nu('AdminCzoneContest')),
  S('czoneEdit', 'Edit a cZone', 'content', legacy('AdminLegacyCzoneEdit'), { hidden: true }),
  S('homepage', 'Manage Homepage', 'content', legacy('AdminLegacyHomepage')),
  S('announcements', 'Announcements', 'content', legacy('AdminLegacyAnnouncements')),
  S('ads', 'Manage Ads', 'content', legacy('AdminLegacyAds')),

  // ── Economy ─────────────────────────────────────────────────
  S('manageSales', 'Manage Sales', 'economy', nu('AdminManageSales')),
  S('codes', 'Manage Codes', 'economy', legacy('AdminLegacyCodes')),
  S('codes/new', 'Create Code', 'economy', legacy('AdminLegacyCodesNew'), { hidden: true }),
  S('codes/edit', 'Edit Code', 'economy', legacy('AdminLegacyCodesEdit'), { hidden: true }),
  S('auctions', 'Auction Only', 'economy', legacy('AdminLegacyAuctions')),
  S('auctions/new', 'Add Auction', 'economy', legacy('AdminLegacyAuctionsNew'), { hidden: true }),
  S('dissolveQueue', 'Dissolve Queue', 'economy', legacy('AdminLegacyDissolveQueue')),
  S('cMoon', 'cMoons', 'economy', nu('AdminCMoon')),

  // ── Games & Events ──────────────────────────────────────────
  S('games', 'Manage Games', 'games', legacy('AdminLegacyGames'), { dense: true }),
  S('lotto', 'Manage Lotto', 'games', legacy('AdminLegacyLotto')),
  S('clashTournaments', 'Clash Tournaments', 'games', legacy('AdminLegacyClashTournaments')),
  S('monsters', 'Manage Monsters', 'games', legacy('AdminLegacyMonsters'), { dense: true }),
  S('scavenger', 'Scavenger Hunt', 'games', legacy('AdminLegacyScavenger')),
  S('achievements', 'Achievements', 'games', legacy('AdminLegacyAchievements')),
  S('holidayEvents', 'Holiday Events', 'games', legacy('AdminLegacyHolidayEvents')),
  S('holidayEvents/new', 'Add Holiday Event', 'games', legacy('AdminLegacyHolidayEventsNew'), { hidden: true }),
  S('holidayEvents/edit', 'Edit Holiday Event', 'games', legacy('AdminLegacyHolidayEventsEdit'), { hidden: true }),

  // ── Logs ────────────────────────────────────────────────────
  S('errorLogs', 'Error Logs', 'logs', nu('AdminErrorLogs')),
  S('authLogs', 'Auth Logs', 'logs', nu('AdminAuthLogs')),
  S('tradeLogs', 'Trade Logs', 'logs', nu('AdminTradeLogs')),
  S('auctionLogs', 'Auction Logs', 'logs', nu('AdminAuctionLogs')),
  S('ctoonOwnerLogs', 'cToon Owner Logs', 'logs', nu('AdminCtoonOwnerLogs')),
  S('czoneSearchLogs', 'cZone Search Logs', 'logs', nu('AdminCzoneSearchLogs')),
  S('pointLogs', 'Point Logs', 'logs', nu('AdminPointLogs')),
  S('achievementLogs', 'Achievement Logs', 'logs', nu('AdminAchievementLogs')),
  S('gtoonsClashLogs', 'gToons Clash Logs', 'logs', nu('AdminGtoonsClashLogs')),
  S('edRpsLogs', 'Ed Edd n Eddy RPS Logs', 'logs', nu('AdminEdRpsLogs')),
  S('monsterBattleLogs', 'Monster Battle Logs', 'logs', nu('AdminMonsterBattleLogs')),
  S('lottoLogs', 'Lotto Logs', 'logs', nu('AdminLottoLogs')),
  S('winWheelLogs', 'Win Wheel Logs', 'logs', nu('AdminWinWheelLogs')),
  S('scavengerLogs', 'Scavenger Logs', 'logs', nu('AdminScavengerLogs')),
  S('adminChanges', 'Admin Changes', 'logs', legacy('AdminLegacyAdminChanges')),

  // ── System ──────────────────────────────────────────────────
  S('globalSettings', 'Global Settings', 'system', legacy('AdminLegacyGlobalSettings')),
  // Powers the production droplet off/on and resizes it. The server-side guard
  // is still a plain isAdmin check — see the note in the admin page.
  S('production', 'Production Instance', 'system', legacy('AdminLegacyProduction'), { destructive: true })
]

// A null-prototype Map so `constructor` / `__proto__` in the URL cannot resolve
// to anything. Never look sections up with plain object property access.
const BY_KEY = new Map(ADMIN_SECTIONS.map(s => [s.key, s]))

export const DEFAULT_SECTION = ADMIN_SECTIONS.find(s => s.isDefault)

export function getAdminSection (key) {
  if (typeof key !== 'string' || !key) return null
  return BY_KEY.get(key) || null
}

/**
 * Resolve a URL path (array of segments) to a section plus its trailing
 * sub-path. Tries the longest key first so `ctoons/edit/<id>` matches the
 * `ctoons/edit` section with subPath `[<id>]`, while `ctoons` matches the list.
 * Returns null for anything unknown so the caller can 404 rather than render a
 * half-initialised shell.
 */
export function resolveAdminRoute (segments) {
  const parts = (Array.isArray(segments) ? segments : [segments])
    .filter(p => typeof p === 'string' && p.length)
  if (!parts.length) return { section: DEFAULT_SECTION, subPath: [] }

  for (let n = Math.min(parts.length, 3); n > 0; n--) {
    const section = getAdminSection(parts.slice(0, n).join('/'))
    if (section) return { section, subPath: parts.slice(n) }
  }
  return null
}

/** Nav tree: groups in declared order, each with its visible sections. */
export function adminNavTree () {
  return ADMIN_GROUPS
    .map(g => ({ ...g, items: ADMIN_SECTIONS.filter(s => s.group === g.id && !s.hidden) }))
    .filter(g => g.items.length)
}

/**
 * Old `/admin/<slug>` paths → new section keys. Explicit map, never derived from
 * the incoming slug: building the target by string-concatenating user input
 * turns `/admin//evil.com` into a protocol-relative off-site redirect.
 */
export const LEGACY_ADMIN_REDIRECTS = new Map(Object.entries({
  '': 'analytics',
  'index': 'analytics',
  'analytics': 'analytics',
  'users': 'manageUsers',
  'userctoons': 'manageUsers',
  'auth-logs': 'authLogs',
  'czone-contest': 'czoneContest',
  'ctoonOwnerLogs': 'ctoonOwnerLogs',
  'lotto-logs': 'lottoLogs',
  'trades': 'tradeLogs',
  'auctions': 'auctionLogs',
  'czone-search-logs': 'czoneSearchLogs',
  'gtoons-logs': 'gtoonsClashLogs',
  'manage-monster-battles': 'monsterBattleLogs',
  'scavenger-logs': 'scavengerLogs',
  'points-log': 'pointLogs',
  'winwheellogs': 'winWheelLogs',
  'achievement-logs': 'achievementLogs',
  'packanalytics': 'packAnalytics',
  'achievements': 'achievements',
  'add-auction': 'auctions/new',
  'addCtoon': 'ctoons/new',
  'addHolidayEvent': 'holidayEvents/new',
  'admin-changes': 'adminChanges',
  'announcements': 'announcements',
  'backgrounds': 'backgrounds',
  'bulk-upload-ctoons': 'ctoonsBulkUpload',
  'cheating-tool': 'cheatingTool',
  'check-cheating': 'checkCheating',
  'codes': 'codes',
  'create-code': 'codes/new',
  'ctoon-suggestions': 'ctoonSuggestions',
  'ctoons': 'ctoons',
  'dissolve-queue': 'dissolveQueue',
  'edit-code': 'codes/edit',
  'edit-czone': 'czoneEdit',
  'edit-holidayevent': 'holidayEvents/edit',
  'edit-pack': 'packs/edit',
  'editCtoon': 'ctoons/edit',
  'games': 'games',
  'global-settings': 'globalSettings',
  'gtoons-clash-tournaments': 'clashTournaments',
  'holidayevents': 'holidayEvents',
  'initiate-trade': 'initiateTrade',
  'manage-ads': 'ads',
  'manage-auctions': 'auctions',
  'manage-czone-search': 'czoneSearch',
  'manage-dev': 'production',
  'manage-homepage': 'homepage',
  'manage-lotto': 'lotto',
  'manage-monster': 'monsters',
  'new-pack': 'packs/new',
  'packs': 'packs',
  'scavenger': 'scavenger',
  'starter-sets': 'starterSets',
  'submitted-ctoons': 'submittedCtoons',
  'suspicious-activity': 'suspiciousActivity'
}))

/**
 * Map a legacy `/admin/...` pathname to its replacement, or null if it isn't a
 * legacy admin path. Trailing segments (a record id) are preserved.
 */
export function legacyAdminTarget (pathname) {
  if (typeof pathname !== 'string') return null
  const [rawPath, query = ''] = pathname.split('?')
  if (rawPath !== '/admin' && !rawPath.startsWith('/admin/')) return null

  const parts = rawPath.split('/').filter(Boolean).slice(1)
  const slug = parts[0] || ''
  const key = LEGACY_ADMIN_REDIRECTS.get(slug)
  if (!key) return '/newsite/admin'

  // Only pass through a trailing id-ish segment; never arbitrary depth.
  const tail = parts.slice(1).filter(p => /^[A-Za-z0-9._-]{1,128}$/.test(p)).slice(0, 1)
  const suffix = tail.length ? '/' + tail.join('/') : ''
  return `/newsite/admin/${key}${suffix}${query ? '?' + query : ''}`
}
