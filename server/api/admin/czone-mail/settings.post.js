// server/api/admin/czone-mail/settings.post.js
// Save the cMail limit settings and notification channel.

import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { normalizeCzoneMailSettings, describeSettingsConflict } from '@/server/utils/czoneMailRules'
import { clearCzoneMailSettingsCache } from '@/server/utils/czoneMailConfigCache'
import { verifyMailChannel } from '@/server/utils/czoneMailDiscord'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const settings = normalizeCzoneMailSettings(body)

  const rawChannel = typeof body?.discordChannelId === 'string' ? body.discordChannelId.trim() : ''
  if (rawChannel && !/^\d{17,20}$/.test(rawChannel)) {
    throw createError({ statusCode: 400, statusMessage: 'Discord Channel ID must be a numeric channel/snowflake ID' })
  }

  // Catch a misconfigured channel at save time rather than discovering it as
  // silently-undelivered notifications. Private threads can only be created
  // under a standard text channel, and an age-restricted parent would lock out
  // the 13-17 accounts this feature is mostly for.
  let channelWarning = null
  if (rawChannel) {
    const check = await verifyMailChannel(rawChannel)
    if (!check.ok) {
      if (body?.force) {
        channelWarning = check.error
      } else {
        throw createError({ statusCode: 400, statusMessage: check.error })
      }
    }
  }

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })

  const data = {
    czoneMailDiscordChannelId:    rawChannel || null,
    czoneMailCooldownSeconds:     settings.cooldownSeconds,
    czoneMailSpamWindowMinutes:   settings.spamWindowMinutes,
    czoneMailSpamThreshold:       settings.spamThreshold,
    czoneMailSpamBlockHours:      settings.spamBlockHours,
    czoneMailRetentionDays:       settings.retentionDays,
    czoneMailPairCooldownMinutes: settings.pairCooldownMinutes
  }

  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data
  })

  clearCzoneMailSettingsCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'cZone Mail',
    key: 'settings',
    prevValue: before ? {
      cooldownSeconds:     before.czoneMailCooldownSeconds,
      spamWindowMinutes:   before.czoneMailSpamWindowMinutes,
      spamThreshold:       before.czoneMailSpamThreshold,
      spamBlockHours:      before.czoneMailSpamBlockHours,
      retentionDays:       before.czoneMailRetentionDays,
      pairCooldownMinutes: before.czoneMailPairCooldownMinutes,
      discordChannelId:    before.czoneMailDiscordChannelId
    } : null,
    newValue: { ...settings, discordChannelId: rawChannel || null }
  })

  return {
    ...settings,
    discordChannelId: rawChannel,
    warning: describeSettingsConflict(settings),
    channelWarning
  }
})
