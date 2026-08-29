import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/server/prisma'

// Free-for-all filesystem avatars, minus any restricted ones (the Avatar catalog — e.g. a cMoon
// affinity reward, see server/utils/achievements.js grantRewardInTx), plus whichever restricted
// avatars the caller actually owns. Restricted avatar image files live in this same
// public/avatars directory (so the existing `/avatars/${filename}` <img> src convention keeps
// working unchanged), so a bare directory listing alone can't tell them apart from free ones —
// the Avatar table is the source of truth for which filenames are gated. Mirrors GET
// /api/backgrounds-available's "public OR owned" filter.
export default defineEventHandler(async (event) => {
  const dir = path.resolve('public/avatars')
  const files = await fs.readdir(dir)
  const imageFiles = files.filter(f => /\.(png|jpe?g|gif)$/i.test(f))

  const restricted = await prisma.avatar.findMany({ select: { filename: true } })
  const restrictedSet = new Set(restricted.map(r => r.filename))
  const freeAvatars = imageFiles.filter(f => !restrictedSet.has(f))

  const userId = event.context.userId
  if (!userId) return freeAvatars

  const owned = await prisma.userAvatar.findMany({
    where: { userId },
    select: { avatar: { select: { filename: true } } }
  })
  const ownedFilenames = owned.map(o => o.avatar?.filename).filter(Boolean)

  return [...freeAvatars, ...ownedFilenames]
})
