// server/api/admin/czone-mail/settings.get.js
//
// cMail limit settings. Deliberately a feature-local route rather than an
// extension of global-config.post.js: that handler requires dailyPointLimit on
// every POST and silently drops any field it doesn't destructure, which makes it
// an easy place to lose a setting. Same shape as
// server/api/admin/achievements/settings.post.js.

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { normalizeCzoneMailSettings, describeSettingsConflict } from '@/server/utils/czoneMailRules'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const row = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      czoneMailDiscordChannelId: true,
      czoneMailCooldownSeconds: true,
      czoneMailSpamWindowMinutes: true,
      czoneMailSpamThreshold: true,
      czoneMailSpamBlockHours: true,
      czoneMailRetentionDays: true,
      czoneMailPairCooldownMinutes: true
    }
  })

  const settings = normalizeCzoneMailSettings({
    cooldownSeconds:     row?.czoneMailCooldownSeconds,
    spamWindowMinutes:   row?.czoneMailSpamWindowMinutes,
    spamThreshold:       row?.czoneMailSpamThreshold,
    spamBlockHours:      row?.czoneMailSpamBlockHours,
    retentionDays:       row?.czoneMailRetentionDays,
    pairCooldownMinutes: row?.czoneMailPairCooldownMinutes
  })

  return {
    ...settings,
    discordChannelId: row?.czoneMailDiscordChannelId || '',
    warning: describeSettingsConflict(settings)
  }
})
