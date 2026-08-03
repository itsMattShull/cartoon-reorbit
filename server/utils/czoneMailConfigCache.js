// server/utils/czoneMailConfigCache.js
//
// Short-lived in-memory caches for the two things the cMail send path needs on
// every request: the limit settings and the active template list. Mirrors the
// pattern in activeSaleCache.js / upgradesConfigCache.js.
//
// Both caches are per-process, and nuxt-server runs 2 cluster instances (see
// ecosystem.config.cjs), so clearing one after an admin write only reaches the
// process that served the write. The other expires on its own. TTLs are kept
// short deliberately for that reason — an admin edit is visible everywhere
// within one TTL, which is the same guarantee the sale cache already gives.

import { prisma } from '../prisma.js'
import { normalizeCzoneMailSettings } from '../utils/czoneMailRules.js'

export const SETTINGS_TTL_MS  = 60 * 1000
export const TEMPLATES_TTL_MS = 5 * 60 * 1000

let _settings = null
let _settingsAt = 0

let _templates = null
let _templatesAt = 0

export function clearCzoneMailSettingsCache() {
  _settings = null
  _settingsAt = 0
}

export function clearCzoneMailTemplateCache() {
  _templates = null
  _templatesAt = 0
}

const SETTINGS_SELECT = {
  czoneMailDiscordChannelId: true,
  czoneMailCooldownSeconds: true,
  czoneMailSpamWindowMinutes: true,
  czoneMailSpamThreshold: true,
  czoneMailSpamBlockHours: true,
  czoneMailRetentionDays: true,
  czoneMailPairCooldownMinutes: true
}

/**
 * Returns the normalized cMail settings plus the raw Discord channel id.
 * Falls back to defaults when the singleton row doesn't exist yet.
 */
export async function getCzoneMailSettings() {
  if (_settings && Date.now() - _settingsAt < SETTINGS_TTL_MS) return _settings

  const row = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: SETTINGS_SELECT
  })

  const settings = normalizeCzoneMailSettings({
    cooldownSeconds:     row?.czoneMailCooldownSeconds,
    spamWindowMinutes:   row?.czoneMailSpamWindowMinutes,
    spamThreshold:       row?.czoneMailSpamThreshold,
    spamBlockHours:      row?.czoneMailSpamBlockHours,
    retentionDays:       row?.czoneMailRetentionDays,
    pairCooldownMinutes: row?.czoneMailPairCooldownMinutes
  })
  settings.discordChannelId = (row?.czoneMailDiscordChannelId || '').trim() || null

  _settings = settings
  _settingsAt = Date.now()
  return settings
}

/**
 * Active templates, ordered for the picker. Also serves send-path validation —
 * checking a submitted templateId against this list costs zero queries in the
 * common case.
 */
export async function getActiveCzoneMailTemplates() {
  if (_templates && Date.now() - _templatesAt < TEMPLATES_TTL_MS) return _templates

  const rows = await prisma.cZoneMailTemplate.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, text: true, emoji: true, category: true, sortOrder: true }
  })

  _templates = rows
  _templatesAt = Date.now()
  return rows
}

/** Look up one active template by id without a round trip. */
export async function findActiveCzoneMailTemplate(templateId) {
  if (!templateId) return null
  const rows = await getActiveCzoneMailTemplates()
  return rows.find(t => t.id === templateId) || null
}

/**
 * Group templates into the category sections the picker renders. Uncategorized
 * templates collect under a single trailing "More" group so they are never
 * silently dropped.
 */
export function groupTemplatesByCategory(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.category || 'More'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  // Keep "More" last regardless of alphabetical position.
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'More' ? 1 : b === 'More' ? -1 : a.localeCompare(b)))
    .map(([category, templates]) => ({ category, templates }))
}
