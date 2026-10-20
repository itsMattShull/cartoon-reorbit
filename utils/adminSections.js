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
  S('checkUserMints', 'Check User Mints', 'analytics', nu('AdminCheckUserMints')),
  S('retention', 'Retention', 'analytics', nu('AdminRetention'), { desc: 'Cohort retention by last activity' }),

  // ── Users & Moderation ──────────────────────────────────────
  S('manageUsers', 'Manage Users', 'users', nu('AdminManageUsers'), { sensitive: true, desc: 'Ban, suspend, dissolve, rename' }),
  S('manageCollection', 'Manage Collection', 'users', nu('AdminManageCollection'), { sensitive: true, desc: 'Edit what a user owns' }),
  S('userCtoons', 'User cToons', 'users', nu('AdminUserCtoons'), { superOnly: true, desc: 'Every owned cToon across all users' }),
  S('cheatFinder', 'Cheat Finder', 'users', nu('AdminCheatFinder')),
  S('checkCheating', 'Check Cheating', 'users', legacy('AdminLegacyCheckCheating'), { sensitive: true, desc: 'Can seize points and cToons' }),
  S('cheatingTool', 'Cheating Tool', 'users', legacy('AdminLegacyCheatingTool'), { sensitive: true, desc: 'Applies seizures' }),
  S('suspiciousActivity', 'Suspicious Activity', 'users', legacy('AdminLegacySuspiciousActivity')),
  S('deviceFingerprints', 'Browser Fingerprints', 'users', nu('AdminDeviceFingerprintLogs'), { sensitive: true, desc: 'Shows device data' }),
  S('vpn-queue', 'VPN Queue', 'users', nu('AdminVpnQueue')),
  S('initiateTrade', 'Initiate Trade', 'users', legacy('AdminLegacyInitiateTrade'), { sensitive: true, desc: 'Moves cToons between users' }),

  // ── Content ─────────────────────────────────────────────────
  S('ctoons', 'Manage cToons', 'content', legacy('AdminLegacyCtoons'), { desc: 'Includes add and edit' }),
  S('ctoons/new', 'Add cToon', 'content', legacy('AdminLegacyCtoonsNew'), { hidden: true, perm: 'ctoons' }),
  S('ctoons/edit', 'Edit cToon', 'content', legacy('AdminLegacyCtoonsEdit'), { hidden: true, acceptsSubPath: true, perm: 'ctoons' }),
  S('ctoonsBulkUpload', 'Bulk Upload cToons', 'content', legacy('AdminLegacyCtoonsBulkUpload'), { dense: true }),
  S('submittedCtoons', 'Submitted cToons', 'content', legacy('AdminLegacySubmittedCtoons')),
  S('ctoonSuggestions', 'cToon Suggestions', 'content', legacy('AdminLegacyCtoonSuggestions')),
  S('starterSets', 'Starter Sets', 'content', legacy('AdminLegacyStarterSets')),
  S('packs', 'Manage Packs', 'content', legacy('AdminLegacyPacks'), { desc: 'Includes new and edit' }),
  S('packs/new', 'New Pack', 'content', legacy('AdminLegacyPacksNew'), { hidden: true, perm: 'packs' }),
  S('packs/edit', 'Edit Pack', 'content', legacy('AdminLegacyPacksEdit'), { hidden: true, acceptsSubPath: true, perm: 'packs' }),
  S('backgrounds', 'Backgrounds', 'content', legacy('AdminLegacyBackgrounds')),
  S('czoneSearch', 'cZone Search', 'content', legacy('AdminLegacyCzoneSearch'), { dense: true }),
  S('czoneContest', 'cZone Contests', 'content', nu('AdminCzoneContest')),
  S('czoneEdit', 'Edit a cZone', 'content', legacy('AdminLegacyCzoneEdit'), { hidden: true, acceptsSubPath: true, perm: 'czoneSearch' }),
  S('homepage', 'Manage Homepage', 'content', legacy('AdminLegacyHomepage')),
  S('announcements', 'Announcements', 'content', legacy('AdminLegacyAnnouncements')),
  S('ads', 'Manage Ads', 'content', legacy('AdminLegacyAds')),
  S('tutorial', 'Manage Tutorial', 'content', nu('AdminManageTutorial')),
  S('certificate', 'Manage Certificate', 'content', nu('AdminManageCertificate')),
  S('encyclopedia', 'Manage Encyclopedia', 'content', nu('AdminManageEncyclopedia')),
  S('siteTheme', 'Manage Site Theme', 'content', nu('AdminSiteTheme')),

  // ── Economy ─────────────────────────────────────────────────
  S('manageSales', 'Manage Sales', 'economy', nu('AdminManageSales'), { sensitive: true, desc: 'Changes prices' }),
  S('codes', 'Manage Codes', 'economy', legacy('AdminLegacyCodes'), { sensitive: true, desc: 'Creates points and cToon codes' }),
  S('codes/new', 'Create Code', 'economy', legacy('AdminLegacyCodesNew'), { hidden: true, perm: 'codes' }),
  S('codes/edit', 'Edit Code', 'economy', legacy('AdminLegacyCodesEdit'), { hidden: true, perm: 'codes' }),
  S('auctions', 'Auction Only', 'economy', legacy('AdminLegacyAuctions')),
  S('auctions/new', 'Add Auction', 'economy', legacy('AdminLegacyAuctionsNew'), { hidden: true, perm: 'auctions' }),
  S('dissolveQueue', 'Dissolve Queue', 'economy', legacy('AdminLegacyDissolveQueue'), { sensitive: true, desc: 'Approves account dissolves' }),

  // ── Games & Events ──────────────────────────────────────────
  S('games', 'Manage Games', 'games', legacy('AdminLegacyGames'), { dense: true }),
  S('cMoon', 'cMoons', 'games', nu('AdminCMoon')),
  S('cMoonJoinEffects', 'cMoon Join Effects', 'games', nu('AdminCMoonJoinEffects')),
  S('czoneEffects', 'cZone Effects', 'games', nu('AdminCZoneEffects')),
  S('cmoonChangeRequests', 'cMoon Change Requests', 'games', nu('AdminCMoonChangeRequests')),
  S('manageNavigation', 'Manage Navigation', 'games', nu('AdminManageNavigation')),
  S('cMoonEnemies', 'Manage cMoon Enemies', 'games', nu('AdminCMoonEnemies')),
  S('cMoonRiddles', 'cMoon Riddles', 'games', nu('AdminCMoonRiddles')),
  S('cMoonHunts', 'cMoon Scavenger Hunts', 'games', nu('AdminCMoonHunts')),
  S('lotto', 'Manage Lotto', 'games', legacy('AdminLegacyLotto')),
  S('clashTournaments', 'Clash Tournaments', 'games', legacy('AdminLegacyClashTournaments')),
  S('scavenger', 'Scavenger Hunt', 'games', legacy('AdminLegacyScavenger')),
  S('achievements', 'Achievements', 'games', legacy('AdminLegacyAchievements')),
  S('holidayEvents', 'Holiday Events', 'games', legacy('AdminLegacyHolidayEvents')),
  S('holidayEvents/new', 'Add Holiday Event', 'games', legacy('AdminLegacyHolidayEventsNew'), { hidden: true, perm: 'holidayEvents' }),
  S('holidayEvents/edit', 'Edit Holiday Event', 'games', legacy('AdminLegacyHolidayEventsEdit'), { hidden: true, acceptsSubPath: true, perm: 'holidayEvents' }),

  // ── Logs ────────────────────────────────────────────────────
  S('errorLogs', 'Error Logs', 'logs', nu('AdminErrorLogs')),
  S('cronRunLogs', 'Cron Run Logs', 'logs', nu('AdminCronRunLogs')),
  S('queueMonitor', 'Queue Monitor', 'logs', nu('AdminQueueMonitor')),
  S('authLogs', 'Auth Logs', 'logs', nu('AdminAuthLogs'), { sensitive: true, desc: 'Shows IP addresses' }),
  S('tradeLogs', 'Trade Logs', 'logs', nu('AdminTradeLogs')),
  S('touchTrades', 'Track Touch Trades', 'logs', nu('AdminTouchTrades'), { superOnly: true, desc: 'Decrypted IPs and device info' }),
  S('auctionLogs', 'Auction Logs', 'logs', nu('AdminAuctionLogs')),
  S('ctoonOwnerLogs', 'cToon Owner Logs', 'logs', nu('AdminCtoonOwnerLogs')),
  S('czoneSearchLogs', 'cZone Search Logs', 'logs', nu('AdminCzoneSearchLogs')),
  S('pointLogs', 'Point Logs', 'logs', nu('AdminPointLogs')),
  S('cmoonPointLogs', 'cMoon Points Log', 'logs', nu('AdminCMoonPointLogs')),
  S('cMoonBattleLogs', 'cMoon Battle Logs', 'logs', nu('AdminCMoonBattleLogs')),
  S('achievementLogs', 'Achievement Logs', 'logs', nu('AdminAchievementLogs')),
  S('gtoonsClashLogs', 'gToons Clash Logs', 'logs', nu('AdminGtoonsClashLogs')),
  S('edRpsLogs', 'Ed Edd n Eddy RPS Logs', 'logs', nu('AdminEdRpsLogs')),
  S('pokemonBattleLogs', 'Pokemon FWG Logs', 'logs', nu('AdminPokemonBattleLogs')),
  S('lottoLogs', 'Lotto Logs', 'logs', nu('AdminLottoLogs')),
  S('winWheelLogs', 'Win Wheel Logs', 'logs', nu('AdminWinWheelLogs')),
  S('scavengerLogs', 'Scavenger Logs', 'logs', nu('AdminScavengerLogs')),
  S('adminChanges', 'Admin Changes', 'logs', legacy('AdminLegacyAdminChanges'), { sensitive: true, desc: 'Audit trail of every admin action' }),

  // ── System ──────────────────────────────────────────────────
  S('globalSettings', 'Global Settings', 'system', legacy('AdminLegacyGlobalSettings'), { sensitive: true, desc: 'Site-wide switches and limits' }),
  // Powers the production droplet off/on and resizes it. The server-side guard
  // is still a plain isAdmin check — see the note in the admin page.
  S('production', 'Production Instance', 'system', legacy('AdminLegacyProduction'), { destructive: true, sensitive: true, desc: 'Powers the server off and on' })
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

/** The permission a section is gated by: its own `perm`, else its key. */
export function permOf (section) {
  return section?.perm || section?.key
}

/**
 * Nav tree: groups in declared order, each with its visible sections. Pass `canAccess(perm)`
 * to narrow it to what the caller's admin scope covers. A super-admin-only tool is not a
 * grantable permission, so a restricted admin's scope never covers it.
 */
export function adminNavTree (canAccess) {
  return ADMIN_GROUPS
    .map(g => ({
      ...g,
      items: ADMIN_SECTIONS.filter(s =>
        s.group === g.id && !s.hidden && (!canAccess || canAccess(permOf(s))))
    }))
    .filter(g => g.items.length)
}

/** Every grantable tool, grouped, for the Make sub-admin modal. Super-admin-only tools are included flagged. */
export function grantableAdminTree () {
  return ADMIN_GROUPS
    .map(g => ({
      id: g.id,
      label: g.label,
      items: ADMIN_SECTIONS
        .filter(s => s.group === g.id && !s.hidden)
        .map(s => ({
          perm: permOf(s),
          label: s.label,
          desc: s.desc || '',
          sensitive: Boolean(s.sensitive || s.destructive),
          superOnly: Boolean(s.superOnly)
        }))
    }))
    .filter(g => g.items.length)
}
