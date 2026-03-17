// server/api/graphql.post.js
// GraphQL endpoint supporting two-phase lazy loading of cZone data.
//
// Queries:
//   czoneBasic(username)  – fast: user info + raw zone layout (no UserCtoon joins)
//   czoneDetails(username) – slower: per-toon enrichment metadata (requires joins)

import { graphql, buildSchema } from 'graphql'
import { defineEventHandler, readBody } from 'h3'
import { prisma } from '@/server/prisma'

// ─── Schema ──────────────────────────────────────────────────────────────────

const typeDefs = `
  type Query {
    czoneBasic(username: String!): CZoneBasicResult
    czoneDetails(username: String!): CZoneDetailsResult
  }

  type CZoneBasicResult {
    ownerId: String!
    ownerName: String!
    avatar: String
    isBooster: Boolean!
    lastActivity: String
    czoneId: String
    isPublic: Boolean!
    zones: [BasicZone!]!
  }

  type BasicZone {
    background: String!
    toons: [BasicToon!]!
  }

  # Lightweight toon: only the fields stored directly in layoutData
  # (no DB joins needed – enough to render the zone visually)
  type BasicToon {
    id: String!
    x: Float
    y: Float
    width: Float
    height: Float
    assetPath: String
    name: String
    zIndex: Int
  }

  type CZoneDetailsResult {
    # Flat list keyed by userCtoon id.  Client builds a map for O(1) lookup.
    toonMeta: [ToonMeta!]!
  }

  # Rich toon metadata that requires a UserCtoon join
  type ToonMeta {
    id: String!
    mintNumber: Int
    quantity: Int
    series: String
    rarity: String
    isFirstEdition: Boolean
    ctoonId: String
    isGtoon: Boolean
    cost: Int
    power: Int
  }
`

const schema = buildSchema(typeDefs)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeZones(layoutData, background, targetCount) {
  let zones = []
  if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.zones)) {
    zones = layoutData.zones.map((z) => ({
      background: typeof z?.background === 'string' ? z.background : '',
      toons: Array.isArray(z?.toons) ? z.toons : []
    }))
  } else if (Array.isArray(layoutData)) {
    zones = [{ background: typeof background === 'string' ? background : '', toons: layoutData }]
  } else {
    zones = [{ background: typeof background === 'string' ? background : '', toons: [] }]
  }
  while (zones.length < targetCount) {
    zones.push({ background: '', toons: [] })
  }
  return zones
}

async function getTargetCount(user) {
  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { czoneCount: true }
  })
  const base = Number(config?.czoneCount ?? 3)
  const extra = Math.max(0, Number(user.additionalCzones ?? 0))
  return Math.max(1, base + extra)
}

/** Collect every userCtoon id referenced in this user's cZone layoutData */
function collectToonIds(cZones) {
  const ids = new Set()
  for (const zone of cZones) {
    if (zone.layoutData && typeof zone.layoutData === 'object' && Array.isArray(zone.layoutData.zones)) {
      for (const sub of zone.layoutData.zones) {
        for (const item of sub.toons || []) {
          if (item?.id) ids.add(item.id)
        }
      }
    } else if (Array.isArray(zone.layoutData)) {
      for (const item of zone.layoutData) {
        if (item?.id) ids.add(item.id)
      }
    }
  }
  return ids
}

// ─── Root resolvers ───────────────────────────────────────────────────────────

const rootValue = {
  /**
   * Phase 1 – fast.
   * Returns user info + zone backgrounds + toon positions / asset paths.
   * Reads only the User table and the CZone.layoutData JSON – no UserCtoon join.
   */
  czoneBasic: async ({ username }) => {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { cZones: true }
    })
    if (!user) throw new Error('User not found')

    const targetCount = await getTargetCount(user)
    const chosen = user.cZones[0] || {
      id: null,
      layoutData: { zones: [{ background: '', toons: [] }] },
      isPublic: true
    }

    const rawZones = normalizeZones(chosen.layoutData, chosen.background, targetCount)

    return {
      ownerId: user.id,
      ownerName: user.username,
      avatar: user.avatar ?? null,
      isBooster: user.isBooster ?? false,
      lastActivity: user.lastActivity ? user.lastActivity.toISOString() : null,
      czoneId: chosen.id ?? null,
      isPublic: chosen.isPublic ?? true,
      zones: rawZones.map((z) => ({
        background: z.background || '',
        toons: (z.toons || []).map((t) => ({
          id: t.id,
          x: t.x ?? null,
          y: t.y ?? null,
          width: t.width ?? null,
          height: t.height ?? null,
          assetPath: t.assetPath ?? null,
          name: t.name ?? null,
          zIndex: t.zIndex ?? null
        }))
      }))
    }
  },

  /**
   * Phase 2 – enrichment (lazy).
   * Returns a flat list of ToonMeta objects for every toon still owned by the user.
   * The client uses this to:
   *   1. Filter out orphaned toons (traded away since last save)
   *   2. Merge rich metadata (mintNumber, rarity, etc.) into the already-rendered zone
   *
   * Also persists any orphan cleanup back to the DB, mirroring the existing REST handler.
   */
  czoneDetails: async ({ username }) => {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { cZones: true }
    })
    if (!user) throw new Error('User not found')

    const allToonIds = collectToonIds(user.cZones)

    const ownedUserCtoons = await prisma.userCtoon.findMany({
      where: {
        id: { in: Array.from(allToonIds) },
        userId: user.id
      },
      include: { ctoon: true }
    })

    const ownedSet = new Set(ownedUserCtoons.map((uc) => uc.id))

    // Persist orphan cleanup (same behaviour as the existing REST handler)
    for (const z of user.cZones) {
      if (z.layoutData && typeof z.layoutData === 'object' && Array.isArray(z.layoutData.zones)) {
        let dirty = false
        const cleaned = z.layoutData.zones.map((sub) => {
          const kept = (sub.toons || []).filter((item) => ownedSet.has(item.id))
          if (kept.length !== (sub.toons || []).length) dirty = true
          return { background: sub.background || '', toons: kept }
        })
        if (dirty) {
          await prisma.cZone.update({
            where: { id: z.id },
            data: { layoutData: { zones: cleaned } }
          })
        }
      } else if (Array.isArray(z.layoutData)) {
        const kept = z.layoutData.filter((item) => ownedSet.has(item?.id))
        if (kept.length !== z.layoutData.length) {
          await prisma.cZone.update({
            where: { id: z.id },
            data: { layoutData: kept }
          })
        }
      }
    }

    return {
      toonMeta: ownedUserCtoons.map((uc) => ({
        id: uc.id,
        mintNumber: uc.mintNumber ?? null,
        quantity: uc.ctoon.quantity ?? null,
        series: uc.ctoon.series ?? null,
        rarity: uc.ctoon.rarity ?? null,
        isFirstEdition: uc.isFirstEdition ?? null,
        ctoonId: uc.ctoon.id,
        isGtoon: uc.ctoon.isGtoon ?? null,
        cost: uc.ctoon.cost ?? null,
        power: uc.ctoon.power ?? null
      }))
    }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const result = await graphql({
    schema,
    source: body.query,
    rootValue,
    variableValues: body.variables || {}
  })
  return result
})
