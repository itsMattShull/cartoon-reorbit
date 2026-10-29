// server/api/admin/cmoons/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { cmoonPageFsPath, cmoonButtonFsPath, cmoonPageBannerFsPath } from '@/server/utils/cmoonImageStorage'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  if (cmoon.memberCount > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot delete a cMoon that still has members — reassign them first' })
  }

  // A live raid boss fight started by one of this cMoon's (former) members: CMoonEnemyRaid.cMoon is
  // onDelete: Cascade, so deleting now would also delete the raid's own row and every participant
  // row — including players from OTHER cMoons, since raids are cross-cMoon — and their whole
  // resolution (prizes, battle records, team wins) would then fail. A raid can't run longer than
  // its join window (up to 120s) plus its own CMoonEnemyMember.raidRoundLimit rounds at
  // ROUND_TIMEOUT_SECONDS each — up to 400 rounds * 15s = 100 minutes at the admin-configurable
  // ceiling, ~102 minutes worst case including the join window — so a 3-hour cutoff keeps a
  // comfortable margin for restart/Redis-restore lag; only recent unresolved rows block, an older
  // one is a crash leftover that would otherwise block forever.
  const liveRaid = await db.cMoonEnemyRaid.findFirst({
    where: { cMoonId: id, status: { not: 'RESOLVED' }, startedAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    select: { id: true },
  })
  if (liveRaid) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot delete — a raid boss fight started from this cMoon is still in progress. Try again once it ends.' })
  }
  // Display-assigned cToons (Ctoon.cMoonId) are NOT a delete-blocker like
  // members are — that relation is `onDelete: SetNull`, so deleting a cMoon
  // here just reverts those cToons' modals to the default (unthemed) look,
  // which is a low-stakes, reversible outcome unlike losing faction members.

  try {
    await db.cMoon.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — one of this cMoon\'s ranks is still referenced by an achievement. Reassign or delete that achievement\'s rank reward first.' })
    }
    throw err
  }
  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `delete:${id}`, prevValue: { name: cmoon.name }, newValue: null })
  invalidateCMoonList()

  // Best-effort: an orphaned file costs nothing to leave behind, but there's no reason not
  // to clean it up now that the row (and any stale cache pointing at it) is gone.
  if (cmoon.imagePath) {
    const filename = cmoon.imagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('cmoons', filename)) } catch {} }
  }
  if (cmoon.pageImagePath) {
    const filename = cmoon.pageImagePath.split('/').pop()
    if (filename) { try { await unlink(cmoonPageFsPath(filename)) } catch {} }
  }
  if (cmoon.buttonImagePath) {
    const filename = cmoon.buttonImagePath.split('/').pop()
    if (filename) { try { await unlink(cmoonButtonFsPath(filename)) } catch {} }
  }
  if (cmoon.pageBannerImagePath) {
    const filename = cmoon.pageBannerImagePath.split('/').pop()
    if (filename) { try { await unlink(cmoonPageBannerFsPath(filename)) } catch {} }
  }

  return { ok: true }
})
