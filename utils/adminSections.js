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

// The loader carries its own source path so the contract test can assert the
// component actually exists on disk rather than trusting the registry.
const legacy = name => Object.assign(
  () => import(`../components/newsite/admin/legacy/${name}.vue`),
  { path: `components/newsite/admin/legacy/${name}.vue` }
)
const nu = name => Object.assign(
  () => import(`../components/newsite/${name}.vue`),
  { path: `components/newsite/${name}.vue` }
)

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
  S('ctoons/edit', 'Edit cToon', 'content', legacy('AdminLegacyCtoonsEdit'), { hidden: true, acceptsSubPath: true }),
  S('ctoonsBulkUpload', 'Bulk Upload cToons', 'content', legacy('AdminLegacyCtoonsBulkUpload'), { dense: true }),
  S('submittedCtoons', 'Submitted cToons', 'content', legacy('AdminLegacySubmittedCtoons')),
  S('ctoonSuggestions', 'cToon Suggestions', 'content', legacy('AdminLegacyCtoonSuggestions')),
  S('starterSets', 'Starter Sets', 'content', legacy('AdminLegacyStarterSets')),
  S('packs', 'Manage Packs', 'content', legacy('AdminLegacyPacks')),
  S('packs/new', 'New Pack', 'content', legacy('AdminLegacyPacksNew'), { hidden: true }),
  S('packs/edit', 'Edit Pack', 'content', legacy('AdminLegacyPacksEdit'), { hidden: true, acceptsSubPath: true }),
  S('backgrounds', 'Backgrounds', 'content', legacy('AdminLegacyBackgrounds')),
  S('czoneSearch', 'cZone Search', 'content', legacy('AdminLegacyCzoneSearch'), { dense: true }),
  S('czoneContest', 'cZone Contests', 'content', nu('AdminCzoneContest')),
  S('czoneEdit', 'Edit a cZone', 'content', legacy('AdminLegacyCzoneEdit'), { hidden: true, acceptsSubPath: true }),
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
  S('holidayEvents/edit', 'Edit Holiday Event', 'games', legacy('AdminLegacyHolidayEventsEdit'), { hidden: true, acceptsSubPath: true }),

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
  S('pokemonBattleLogs', 'Pokemon FWG Logs', 'logs', nu('AdminPokemonBattleLogs')),
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
    if (!section) continue
    const subPath = parts.slice(n)
    // Only sections that actually take a record id accept trailing segments.
    // Otherwise `/newsite/admin/ctoons/junk/junk` would quietly render the
    // cToons list, hiding a broken link instead of surfacing it.
    if (!subPath.length) return { section, subPath: [] }
    if (!section.acceptsSubPath) return null
    if (subPath.length > 1) return null
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(subPath[0])) return null
    return { section, subPath }
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
 * The original /admin/* pages, kept live as a fallback while the consolidated
 * console is being verified in production. They are reachable from the console's
 * "Old Admin" menu and from the legacy nav, and they render the untouched
 * pre-migration components under layouts/admin.vue.
 *
 * This is deliberately duplicated with ADMIN_SECTIONS above: the console renders
 * codemodded copies under components/newsite/admin/legacy/, while these are the
 * originals. Once each console section is confirmed working, delete its old page
 * here and in pages/admin/, and re-add a redirect so old bookmarks still resolve.
 */
export const OLD_ADMIN_GROUPS = [
  {
    id: 'old-core',
    label: 'Old Admin — Core',
    items: [
      { label: 'Analytics', to: '/admin' },
      { label: 'Manage Users', to: '/admin/users' },
      { label: 'Manage Homepage', to: '/admin/manage-homepage' },
      { label: 'Global Settings', to: '/admin/global-settings' },
      { label: 'Manage Ads', to: '/admin/manage-ads' },
      { label: 'Manage Announcements', to: '/admin/announcements' },
      { label: 'Admin Changes', to: '/admin/admin-changes' },
      { label: 'cToon Suggestions', to: '/admin/ctoon-suggestions' },
      { label: 'Manage Production', to: '/admin/manage-dev' },
      { label: 'Initiate Trade', to: '/admin/initiate-trade' }
    ]
  },
  {
    id: 'old-content',
    label: 'Old Admin — Content',
    items: [
      { label: 'Manage cToons', to: '/admin/ctoons' },
      { label: 'Submitted cToons', to: '/admin/submitted-ctoons' },
      { label: 'Manage Packs', to: '/admin/packs' },
      { label: 'Manage Starter Sets', to: '/admin/starter-sets' },
      { label: 'Manage Backgrounds', to: '/admin/backgrounds' },
      { label: 'Manage Codes', to: '/admin/codes' },
      { label: 'Manage Monsters', to: '/admin/manage-monster' },
      { label: 'Manage cZone Search', to: '/admin/manage-czone-search' },
      { label: 'Manage Lotto', to: '/admin/manage-lotto' },
      { label: 'Manage Games', to: '/admin/games' },
      { label: 'Manage Clash Tournaments', to: '/admin/gtoons-clash-tournaments' },
      { label: 'Manage Scavenger Hunt', to: '/admin/scavenger' },
      { label: 'Manage Holiday Events', to: '/admin/holidayevents' },
      { label: 'Manage Auction Only', to: '/admin/manage-auctions' },
      { label: 'Dissolved Queue', to: '/admin/dissolve-queue' },
      { label: 'Manage Achievements', to: '/admin/achievements' },
      { label: 'Manage cZone Contests', to: '/admin/czone-contest' }
    ]
  },
  {
    id: 'old-logs',
    label: 'Old Admin — Logs',
    items: [
      { label: 'Suspicious Activity', to: '/admin/suspicious-activity' },
      { label: 'Check Cheating', to: '/admin/check-cheating' },
      { label: 'Cheating Tool', to: '/admin/cheating-tool' },
      { label: 'Auction Logs', to: '/admin/auctions' },
      { label: 'Trade Logs', to: '/admin/trades' },
      { label: 'Auth Logs', to: '/admin/auth-logs' },
      { label: 'cToon Owner Logs', to: '/admin/ctoonOwnerLogs' },
      { label: 'cZone Search Logs', to: '/admin/czone-search-logs' },
      { label: 'Point Logs', to: '/admin/points-log' },
      { label: 'Achievement Logs', to: '/admin/achievement-logs' },
      { label: 'gToons Clash Logs', to: '/admin/gtoons-logs' },
      { label: 'Monster Battle Logs', to: '/admin/manage-monster-battles' },
      { label: 'Lotto Logs', to: '/admin/lotto-logs' },
      { label: 'Win Wheel Logs', to: '/admin/winwheellogs' },
      { label: 'Pack Analytics', to: '/admin/packanalytics' },
      { label: 'Scavenger Logs', to: '/admin/scavenger-logs' }
    ]
  }
]

/** Flat list of every old-admin path, for tests and tooling. */
export const OLD_ADMIN_PATHS = OLD_ADMIN_GROUPS.flatMap(g => g.items.map(i => i.to))
