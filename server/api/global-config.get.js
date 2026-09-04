// server/api/global-config.get.js (public-safe fields)
import { defineEventHandler, setResponseHeader } from 'h3'
import { prisma as db } from '@/server/prisma'
import { isValidUiClickSoundPath, sanitizeUiNavButtonSounds } from '@/server/utils/uiClickSoundPath'
import { NAV_SOUND_SLOT_KEYS } from '@/utils/navSoundSlots'

export default defineEventHandler(async (event) => {
  // Called on every page load by every visitor (unlike the admin-only config endpoints), so
  // it's worth a short cache to avoid a DB round trip per request — a 5 minute delay on an
  // admin's config change becoming visible sitewide is an acceptable trade for that.
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')

  // Fetch singleton; if missing, synthesize defaults (no writes in public endpoint)
  const cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  return {
    dailyPointLimit:    cfg?.dailyPointLimit    ?? 250,
    dailyLoginPoints:   cfg?.dailyLoginPoints   ?? 500,
    dailyNewUserPoints: cfg?.dailyNewUserPoints ?? 1000,
    czoneVisitPoints:   cfg?.czoneVisitPoints   ?? 20,
    czoneVisitMaxPerDay: cfg?.czoneVisitMaxPerDay ?? 10,
    czoneCount: cfg?.czoneCount ?? 3,
    secondEditionOverlayPath:   cfg?.secondEditionOverlayPath   ?? null,
    secondEditionOverlayWidth:  cfg?.secondEditionOverlayWidth  ?? null,
    secondEditionOverlayHeight: cfg?.secondEditionOverlayHeight ?? null,
    faviconVersion: cfg?.faviconVersion ? cfg.faviconVersion.toString() : null,
    uiClickSoundPath: isValidUiClickSoundPath(cfg?.uiClickSoundPath) ? cfg.uiClickSoundPath : null,
    uiNavButtonSounds: Object.fromEntries(
      Object.entries(sanitizeUiNavButtonSounds(cfg?.uiNavButtonSounds))
        .filter(([key]) => NAV_SOUND_SLOT_KEYS.has(key))
    )
  }
})
