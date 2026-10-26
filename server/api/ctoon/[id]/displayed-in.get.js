// server/api/ctoon/[id]/displayed-in.get.js
//
// Lists who's actually displaying a given cToon in their cZone right now — the people behind
// Ctoon.czoneDisplayCount (the precomputed figure the info card already shows, via
// server/cron/czone-display-count.js). That cron aggregates a COUNT across every cToon at once;
// this is the on-demand, single-cToon version that lists the actual placements, since nothing
// else needed the list before.
//
// Same CZone.layoutData lateral-join shape as the cron's RECOMPUTE_SQL (jsonb_array_elements over
// zones, then toons, joined through UserCtoon to exclude burned copies), but with WITH ORDINALITY
// to also recover each placement's zone/item index — exactly how
// server/api/czone/[username].get.js numbers them when building enrichedZones, so a client can
// jump straight to one via ?highlightZone=&highlightItem= without any id-matching.
//
// Deliberately returns usernames + zone/item indices only, never a UserCtoonId or the synthetic
// `cz:` token — the same privacy boundary server/api/czone/[username].get.js already draws for
// non-owner viewers (see its own comment on the trade-room recon exploit this prevents).
import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '@/server/prisma'

// A cToon placed in thousands of cZones would otherwise return a huge list for what's meant to
// be a quick glance — cap it and tell the caller there's more rather than silently truncating.
const MAX_RESULTS = 200

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) {
    throw createError({ statusCode: 422, statusMessage: 'Missing cToon ID' })
  }

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const ctoon = await prisma.ctoon.findUnique({ where: { id }, select: { id: true, czoneDisplayCount: true } })
  if (!ctoon) {
    throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
  }

  // The lateral join below unnests every zone/toon in every CZone row to find the matches — real
  // work proportional to the WHOLE site's placement count, not just this cToon's, since Postgres
  // can't push the ctoonId filter below the unnest. czoneDisplayCount (cron-precomputed, same
  // field the info card's own tile already reads) is a free short-circuit: a cToon nobody has
  // placed needs no scan at all, and skipping it here also keeps this list in lockstep with the
  // number already shown on the card — both come from the same cache, so neither can contradict
  // the other. The cron runs daily, so a placement made since its last run (not yet counted) is
  // likewise not yet listed — an accepted, bounded staleness, not a correctness gap, since the
  // count tile itself carries exactly the same lag.
  if (!ctoon.czoneDisplayCount) {
    return { items: [], hasMore: false }
  }

  const rows = await prisma.$queryRaw`
    SELECT
      u.username AS username,
      (zone.ord - 1)::int AS "zoneIdx",
      (toon.ord - 1)::int AS "itemIdx"
    FROM "CZone" cz
    JOIN "User" u ON u.id = cz."userId"
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(cz."layoutData"->'zones') = 'array'
           THEN cz."layoutData"->'zones' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS zone(value, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(zone.value->'toons') = 'array'
           THEN zone.value->'toons' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS toon(value, ord)
    JOIN "UserCtoon" uc
      ON uc.id = (toon.value->>'id')
     AND uc."burnedAt" IS NULL
    WHERE uc."ctoonId" = ${ctoon.id}
    ORDER BY u.username ASC, zone.ord ASC, toon.ord ASC
    LIMIT ${MAX_RESULTS + 1}
  `

  const hasMore = rows.length > MAX_RESULTS
  const items = (hasMore ? rows.slice(0, MAX_RESULTS) : rows).map(r => ({
    username: r.username,
    zoneIdx: Number(r.zoneIdx),
    itemIdx: Number(r.itemIdx)
  }))

  return { items, hasMore }
})
