// server/utils/ogGtoonTournamentAdmin.js
//
// Validation shared by the OG gToons tournament admin endpoints (server/api/admin/og-tournaments/*).
import { createError } from 'h3'
import { prisma } from '@/server/prisma'
import { parseRewardBundle, validateRewardBundleRefs } from '@/server/utils/achievementRewardBundle'
import { prizeSupplyWarnings, bundleIsEmpty } from '@/server/utils/ogGtoonTournament'

const bad = (message) => createError({ statusCode: 400, statusMessage: message })

function parseDate(v, label) {
  const d = new Date(v)
  if (!v || Number.isNaN(d.getTime())) throw bad(`${label} is invalid`)
  return d
}

/**
 * Turns a create/edit request body into tournament columns plus warnings (not errors) about prizes
 * that might not be payable. `only` limits which groups of fields are read, so an edit after opt-in
 * has closed can change the name but not the rules.
 */
export async function parseTournamentBody(body, { only = ['basics', 'window', 'rules', 'prizes'] } = {}) {
  const data = {}
  const warnings = []

  if (only.includes('basics')) {
    const name = String(body?.name || '').trim()
    if (!name) throw bad('Name is required')
    if (name.length > 120) throw bad('Name is too long')
    data.name = name
    data.description = String(body?.description || '').trim().slice(0, 2000) || null
  }

  if (only.includes('window')) {
    const optInStartAt = parseDate(body?.optInStartAt, 'Opt-in start')
    const optInEndAt = parseDate(body?.optInEndAt, 'Opt-in end')
    if (optInStartAt >= optInEndAt) throw bad('Opt-in start must be before opt-in end')
    data.optInStartAt = optInStartAt
    data.optInEndAt = optInEndAt
  }

  if (only.includes('rules')) {
    const hours = body?.roundWindowHours == null || body.roundWindowHours === '' ? 72 : Number(body.roundWindowHours)
    if (!Number.isInteger(hours) || hours < 12 || hours > 24 * 14) throw bad('Round window must be 12 to 336 hours')
    data.roundWindowHours = hours
    const sw = body?.swissRoundsOverride
    if (sw == null || sw === '') data.swissRoundsOverride = null
    else {
      const n = Number(sw)
      if (!Number.isInteger(n) || n < 1 || n > 10) throw bad('Swiss rounds must be 1 to 10 (or blank to choose automatically)')
      data.swissRoundsOverride = n
    }
    const minTop8 = body?.minEntrantsTop8Prize == null || body.minEntrantsTop8Prize === '' ? 9 : Number(body.minEntrantsTop8Prize)
    if (!Number.isInteger(minTop8) || minTop8 < 2 || minTop8 > 1000) throw bad('Minimum entrants for the Top 8 prize must be 2 or more')
    data.minEntrantsTop8Prize = minTop8
    data.requirePrizeApproval = body?.requirePrizeApproval !== false
    data.bestOf = 3
  }

  if (only.includes('prizes')) {
    const first = parseRewardBundle(body?.firstPrize || {})
    const top8 = parseRewardBundle(body?.top8Prize || {})
    await validateRewardBundleRefs(prisma, [first, top8])
    if (first.points > 1_000_000 || top8.points > 1_000_000) throw bad('Points prizes are capped at 1,000,000')
    data.firstPrizeJson = bundleIsEmpty(first) ? null : first
    data.top8PrizeJson = bundleIsEmpty(top8) ? null : top8
    warnings.push(...(await prizeSupplyWarnings(prisma, first, 1)).map(w => `1st place: ${w}`))
    warnings.push(...(await prizeSupplyWarnings(prisma, top8, 7)).map(w => `Top 8: ${w}`))
  }
  return { data, warnings }
}

/** The audit entry every state-changing admin action writes. */
export const OGT_AUDIT_AREA = 'OG gToons Tournaments'
