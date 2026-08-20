// server/api/admin/global-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { clearUpgradesConfigCache } from '@/server/utils/upgradesConfigCache'
import { fetchChannel } from '@/server/utils/discordChat/rest'
import { rawBotToken, invalidateChatConfig } from '@/server/utils/discordChat/config'
import { getRedis } from '@/server/utils/redis'

export default defineEventHandler(async (event) => {
  // 1) Authenticate & authorize
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Read + validate payload
  const body = await readBody(event)
  const {
    dailyPointLimit,
    tkoDailyPointLimit,
    dailyLoginPoints,
    dailyNewUserPoints,
    czoneVisitPoints,
    czoneVisitMaxPerDay,
    czoneCount,
    phashDuplicateThreshold,
    dhashDuplicateThreshold,
    featuredAuctionHours,
    featuredAuctionIntervalDays,
    featuredAuctionsPerSlot,
    cmartHalfPriceEnabled,
    timeBasedPurchaseLimits,
    packPriceDecayAmount,
    packPriceDecayDays,
    packPriceFloor,
    packMaxDefaultBuysPerUser,
    czoneContestDiscordChannelId,
    discordChatEnabled,
    discordChatChannelId,
    discordChatSlowmodeSeconds,
    discordChatMaxLength,
    discordChatShowAttachments
  } = body

  // minimally require the existing cap; other fields optional with defaults
  if (dailyPointLimit == null || typeof dailyPointLimit !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid "dailyPointLimit", must be a number'
    })
  }

  let czoneContestDiscordChannelIdValue
  if (czoneContestDiscordChannelId !== undefined) {
    const trimmed = typeof czoneContestDiscordChannelId === 'string' ? czoneContestDiscordChannelId.trim() : ''
    if (trimmed && !/^\d{17,20}$/.test(trimmed)) {
      throw createError({ statusCode: 400, statusMessage: 'Discord Channel ID must be a numeric channel/snowflake ID' })
    }
    czoneContestDiscordChannelIdValue = trimmed || null
  }

  // Discord chat relay: stronger check than the announcement channels above,
  // since this is a live two-way bridge — verify it's a text channel in this guild.
  let discordChatChannelIdValue
  if (discordChatChannelId !== undefined) {
    const trimmed = typeof discordChatChannelId === 'string' ? discordChatChannelId.trim() : ''
    if (trimmed && !/^\d{17,20}$/.test(trimmed)) {
      throw createError({ statusCode: 400, statusMessage: 'Chat Channel ID must be a numeric channel/snowflake ID' })
    }
    if (trimmed) {
      let channel = null
      try {
        channel = await fetchChannel(trimmed, rawBotToken())
      } catch {
        throw createError({
          statusCode: 400,
          statusMessage: 'Could not read that channel. Check the ID and that the bot can see it.'
        })
      }
      if (!channel || String(channel.guild_id || '') !== String(process.env.DISCORD_GUILD_ID || '')) {
        throw createError({ statusCode: 400, statusMessage: 'That channel is not in this Discord server.' })
      }
      if (Number(channel.type) !== 0) {
        throw createError({ statusCode: 400, statusMessage: 'Chat channel must be a standard text channel.' })
      }
    }
    discordChatChannelIdValue = trimmed || null
  }

  const clampInt = (value, min, max) => {
    const n = Number(value)
    if (!Number.isInteger(n)) return undefined
    return Math.min(max, Math.max(min, n))
  }

  const payload = {
    dailyPointLimit: Number(dailyPointLimit),
    // allow partial updates; coerce to number if provided else keep existing via upsert+update
    tkoDailyPointLimit: (typeof tkoDailyPointLimit === 'number') ? Number(tkoDailyPointLimit) : undefined,
    dailyLoginPoints:   (typeof dailyLoginPoints   === 'number') ? Number(dailyLoginPoints)   : undefined,
    dailyNewUserPoints: (typeof dailyNewUserPoints === 'number') ? Number(dailyNewUserPoints) : undefined,
    czoneVisitPoints:   (typeof czoneVisitPoints   === 'number') ? Number(czoneVisitPoints)   : undefined,
    czoneVisitMaxPerDay:(typeof czoneVisitMaxPerDay=== 'number') ? Number(czoneVisitMaxPerDay): undefined,
    czoneCount:         (typeof czoneCount         === 'number') ? Number(czoneCount)         : undefined,
    phashDuplicateThreshold: (typeof phashDuplicateThreshold === 'number') ? Number(phashDuplicateThreshold) : undefined,
    dhashDuplicateThreshold: (typeof dhashDuplicateThreshold === 'number') ? Number(dhashDuplicateThreshold) : undefined,
    featuredAuctionHours: Array.isArray(featuredAuctionHours)
      ? featuredAuctionHours.map(Number).filter(h => h >= 0 && h <= 23)
      : undefined,
    featuredAuctionIntervalDays: (typeof featuredAuctionIntervalDays === 'number') ? Math.max(1, featuredAuctionIntervalDays) : undefined,
    featuredAuctionsPerSlot: (typeof featuredAuctionsPerSlot === 'number') ? Number(featuredAuctionsPerSlot) : undefined,
    cmartHalfPriceEnabled: (typeof cmartHalfPriceEnabled === 'boolean') ? cmartHalfPriceEnabled : undefined,
    timeBasedPurchaseLimits: (timeBasedPurchaseLimits !== undefined && timeBasedPurchaseLimits !== null)
      ? timeBasedPurchaseLimits
      : undefined,
    packPriceDecayAmount:      (typeof packPriceDecayAmount      === 'number') ? Math.max(0, packPriceDecayAmount)      : undefined,
    packPriceDecayDays:        (typeof packPriceDecayDays        === 'number') ? Math.max(1, packPriceDecayDays)        : undefined,
    packPriceFloor:            (typeof packPriceFloor            === 'number') ? Math.max(0, packPriceFloor)            : undefined,
    packMaxDefaultBuysPerUser: (typeof packMaxDefaultBuysPerUser === 'number') ? Math.max(1, packMaxDefaultBuysPerUser) : undefined,
    czoneContestDiscordChannelId: czoneContestDiscordChannelIdValue,
    discordChatEnabled: (typeof discordChatEnabled === 'boolean') ? discordChatEnabled : undefined,
    discordChatChannelId: discordChatChannelIdValue,
    discordChatSlowmodeSeconds: (discordChatSlowmodeSeconds !== undefined) ? clampInt(discordChatSlowmodeSeconds, 0, 300) : undefined,
    discordChatMaxLength: (discordChatMaxLength !== undefined) ? clampInt(discordChatMaxLength, 1, 2000) : undefined,
    discordChatShowAttachments: (typeof discordChatShowAttachments === 'boolean') ? discordChatShowAttachments : undefined
  }

  // 3) Upsert the singleton global config row
  try {
    const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    const result = await db.globalGameConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        dailyPointLimit: payload.dailyPointLimit,
        tkoDailyPointLimit: payload.tkoDailyPointLimit ?? 250,
        dailyLoginPoints:   payload.dailyLoginPoints   ?? 500,
        dailyNewUserPoints: payload.dailyNewUserPoints ?? 1000,
        czoneVisitPoints:   payload.czoneVisitPoints   ?? 20,
        czoneVisitMaxPerDay: payload.czoneVisitMaxPerDay ?? 10,
        czoneCount: payload.czoneCount ?? 3,
        phashDuplicateThreshold: payload.phashDuplicateThreshold ?? 14,
        dhashDuplicateThreshold: payload.dhashDuplicateThreshold ?? 16,
        featuredAuctionHours: payload.featuredAuctionHours ?? [],
        featuredAuctionIntervalDays: payload.featuredAuctionIntervalDays ?? 1,
        featuredAuctionsPerSlot: payload.featuredAuctionsPerSlot ?? 1,
        cmartHalfPriceEnabled: payload.cmartHalfPriceEnabled ?? false,
        timeBasedPurchaseLimits: payload.timeBasedPurchaseLimits ?? {
          'Common':     { count: 5, windowDays: null },
          'Uncommon':   { count: 4, windowDays: null },
          'Rare':       { count: 3, windowDays: null },
          'Very Rare':  { count: 2, windowDays: null },
          'Crazy Rare': { count: 1, windowDays: null }
        },
        packPriceDecayAmount:      payload.packPriceDecayAmount      ?? 100,
        packPriceDecayDays:        payload.packPriceDecayDays        ?? 7,
        packPriceFloor:            payload.packPriceFloor            ?? 700,
        packMaxDefaultBuysPerUser: payload.packMaxDefaultBuysPerUser ?? 5,
        czoneContestDiscordChannelId: payload.czoneContestDiscordChannelId ?? null,
        discordChatEnabled:         payload.discordChatEnabled         ?? false,
        discordChatChannelId:       payload.discordChatChannelId       ?? null,
        discordChatSlowmodeSeconds: payload.discordChatSlowmodeSeconds ?? 5,
        discordChatMaxLength:       payload.discordChatMaxLength       ?? 400,
        discordChatShowAttachments: payload.discordChatShowAttachments ?? false
      },
      update: {
        dailyPointLimit: payload.dailyPointLimit,
        // only update fields that were provided
        ...(payload.tkoDailyPointLimit !== undefined ? { tkoDailyPointLimit: payload.tkoDailyPointLimit } : {}),
        ...(payload.dailyLoginPoints   !== undefined ? { dailyLoginPoints:   payload.dailyLoginPoints }   : {}),
        ...(payload.dailyNewUserPoints !== undefined ? { dailyNewUserPoints: payload.dailyNewUserPoints } : {}),
        ...(payload.czoneVisitPoints    !== undefined ? { czoneVisitPoints:    payload.czoneVisitPoints }    : {}),
        ...(payload.czoneVisitMaxPerDay !== undefined ? { czoneVisitMaxPerDay: payload.czoneVisitMaxPerDay } : {}),
        ...(payload.czoneCount          !== undefined ? { czoneCount:          payload.czoneCount }          : {}),
        ...(payload.phashDuplicateThreshold !== undefined ? { phashDuplicateThreshold: payload.phashDuplicateThreshold } : {}),
        ...(payload.dhashDuplicateThreshold !== undefined ? { dhashDuplicateThreshold: payload.dhashDuplicateThreshold } : {}),
        ...(payload.featuredAuctionHours !== undefined ? { featuredAuctionHours: payload.featuredAuctionHours } : {}),
        ...(payload.featuredAuctionIntervalDays !== undefined ? { featuredAuctionIntervalDays: payload.featuredAuctionIntervalDays } : {}),
        ...(payload.featuredAuctionsPerSlot !== undefined ? { featuredAuctionsPerSlot: payload.featuredAuctionsPerSlot } : {}),
        ...(payload.cmartHalfPriceEnabled !== undefined ? { cmartHalfPriceEnabled: payload.cmartHalfPriceEnabled } : {}),
        ...(payload.timeBasedPurchaseLimits !== undefined ? { timeBasedPurchaseLimits: payload.timeBasedPurchaseLimits } : {}),
        ...(payload.packPriceDecayAmount      !== undefined ? { packPriceDecayAmount:      payload.packPriceDecayAmount }      : {}),
        ...(payload.packPriceDecayDays        !== undefined ? { packPriceDecayDays:        payload.packPriceDecayDays }        : {}),
        ...(payload.packPriceFloor            !== undefined ? { packPriceFloor:            payload.packPriceFloor }            : {}),
        ...(payload.packMaxDefaultBuysPerUser !== undefined ? { packMaxDefaultBuysPerUser: payload.packMaxDefaultBuysPerUser } : {}),
        ...(payload.czoneContestDiscordChannelId !== undefined ? { czoneContestDiscordChannelId: payload.czoneContestDiscordChannelId } : {}),
        ...(payload.discordChatEnabled         !== undefined ? { discordChatEnabled:         payload.discordChatEnabled }         : {}),
        ...(payload.discordChatChannelId       !== undefined ? { discordChatChannelId:       payload.discordChatChannelId }       : {}),
        ...(payload.discordChatSlowmodeSeconds !== undefined ? { discordChatSlowmodeSeconds: payload.discordChatSlowmodeSeconds } : {}),
        ...(payload.discordChatMaxLength       !== undefined ? { discordChatMaxLength:       payload.discordChatMaxLength }       : {}),
        ...(payload.discordChatShowAttachments !== undefined ? { discordChatShowAttachments: payload.discordChatShowAttachments } : {})
      }
    })
    clearUpgradesConfigCache()
    // Log field-level changes
    const fields = [
      'dailyPointLimit',
      'tkoDailyPointLimit',
      'dailyLoginPoints',
      'dailyNewUserPoints',
      'czoneVisitPoints',
      'czoneVisitMaxPerDay',
      'czoneCount',
      'phashDuplicateThreshold',
      'dhashDuplicateThreshold',
      'featuredAuctionHours',
      'featuredAuctionIntervalDays',
      'featuredAuctionsPerSlot',
      'cmartHalfPriceEnabled',
      'packPriceDecayAmount',
      'packPriceDecayDays',
      'packPriceFloor',
      'packMaxDefaultBuysPerUser',
      'czoneContestDiscordChannelId',
      'discordChatEnabled', // no webhook token here — that stays in env, never logged
      'discordChatChannelId',
      'discordChatSlowmodeSeconds',
      'discordChatMaxLength',
      'discordChatShowAttachments'
    ]
    for (const k of fields) {
      const prevVal = before ? before[k] : undefined
      const nextVal = result ? result[k] : undefined
      if (prevVal !== nextVal) {
        await logAdminChange(db, {
          userId: me.id,
          area: 'GlobalGameConfig',
          key: k,
          prevValue: prevVal,
          newValue: nextVal
        })
      }
    }
    // JSON field: compare by serialized value
    if (JSON.stringify(before?.timeBasedPurchaseLimits ?? null) !== JSON.stringify(result?.timeBasedPurchaseLimits ?? null)) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GlobalGameConfig',
        key: 'timeBasedPurchaseLimits',
        prevValue: before?.timeBasedPurchaseLimits ?? null,
        newValue: result?.timeBasedPurchaseLimits ?? null
      })
    }
    // Push to the socket server + gateway worker so the kill switch is immediate.
    try { await invalidateChatConfig(getRedis()) } catch {}

    return result
  } catch (err) {
    console.error('Error upserting GlobalGameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save global settings' })
  }
})
