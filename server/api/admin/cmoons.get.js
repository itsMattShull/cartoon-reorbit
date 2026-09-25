// server/api/admin/cmoons.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [cmoons, config] = await Promise.all([
    db.cMoon.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        customJoinEffect: true,
        captains: { include: { user: { select: { id: true, username: true } } } },
        prizeCtoons: { include: { ctoon: { select: { id: true, name: true, assetPath: true } } } },
        ranks: { orderBy: { sortOrder: 'asc' } },
        poll: { select: { question: true, options: { select: { label: true }, orderBy: { sortOrder: 'asc' } } } },
        affinityLevels: {
          orderBy: { sortOrder: 'asc' },
          include: {
            borderEffect: true,
            glowEffect: true,
            rewardBackground: { select: { id: true, label: true, imagePath: true } },
            rewardAvatars: { include: { avatar: { select: { id: true, label: true, imagePath: true } } } },
          },
        },
        // Single grouped query, not a per-cMoon count() loop.
        _count: { select: { displayedCtoons: true } },
      },
    }),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        cMoonEnabled: true, cMoonEnabledAt: true, cMoonOptOutCooldownDays: true,
        cMoonBattlePopupChancePercent: true, cMoonBattlePopupCooldownMinutes: true,
      },
    }),
  ])

  return {
    cMoonEnabled: !!config?.cMoonEnabled,
    cMoonEnabledAt: config?.cMoonEnabledAt || null,
    cMoonOptOutCooldownDays: config?.cMoonOptOutCooldownDays ?? 14,
    cMoonBattlePopupChancePercent: config?.cMoonBattlePopupChancePercent ?? 3,
    cMoonBattlePopupCooldownMinutes: config?.cMoonBattlePopupCooldownMinutes ?? 20,
    cmoons: cmoons.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      pageBgColor: c.pageBgColor,
      accentColor: c.accentColor,
      textColor: c.textColor,
      cardBgColor: c.cardBgColor,
      imagePath: c.imagePath,
      avatarPath: c.avatarPath,
      discordRoleId: c.discordRoleId,
      effectType: c.effectType,
      customJoinEffectId: c.customJoinEffectId,
      customJoinEffect: c.customJoinEffect,
      joinLocked: c.joinLocked,
      showOnNav: c.showOnNav,
      allowOptOutJoin: c.allowOptOutJoin,
      memberCount: c.memberCount,
      pageImagePath: c.pageImagePath,
      pageDescription: c.pageDescription,
      buttonImagePath: c.buttonImagePath,
      showButtonOnPages: c.showButtonOnPages,
      pageBannerImagePath: c.pageBannerImagePath,
      displayedCtoonCount: c._count?.displayedCtoons ?? 0,
      poll: c.poll ? { question: c.poll.question, options: c.poll.options.map(o => o.label) } : null,
      captains: c.captains.map(cap => ({ userId: cap.userId, username: cap.user?.username || '' })),
      prizeCtoons: c.prizeCtoons.map(pc => ({ ctoonId: pc.ctoonId, quantity: pc.quantity, name: pc.ctoon?.name || '', assetPath: pc.ctoon?.assetPath || null })),
      ranks: c.ranks.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder, discordRoleId: r.discordRoleId, tierId: r.tierId })),
      affinityLevels: c.affinityLevels.map(l => ({
        id: l.id, name: l.name, threshold: l.threshold, sortOrder: l.sortOrder,
        borderEffectId: l.borderEffectId, borderEffect: l.borderEffect,
        glowEffectId: l.glowEffectId, glowEffect: l.glowEffect,
        rewardBackgroundId: l.rewardBackgroundId,
        rewardBackground: l.rewardBackground,
        rewardAvatarIds: l.rewardAvatars.map(ra => ra.avatar.id),
        rewardAvatars: l.rewardAvatars.map(ra => ra.avatar),
      })),
    })),
  }
})
