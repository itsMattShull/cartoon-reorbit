import { PrismaClient } from '@prisma/client'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const me = await $fetch('/api/auth/me', {
    headers: { cookie: getHeader(event, 'cookie') || '' },
  }).catch(() => null)

  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // ── Params ──────────────────────────────────────────────────────────────────
  const id = parseInt(getRouterParam(event, 'id'), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  // ── Guard: cannot delete a cToon that has minted copies ─────────────────────
  const ctoon = await prisma.ctoon.findUnique({
    where: { id },
    select: { id: true, name: true, totalMinted: true },
  })

  if (!ctoon) {
    throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
  }

  if (ctoon.totalMinted > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete: ${ctoon.totalMinted} minted copies exist.`,
    })
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  await prisma.ctoon.delete({ where: { id } })

  await logAdminChange(prisma, { userId: me.id, area: 'cToons', key: `delete:${id}`, prevValue: ctoon.name, newValue: null })

  return { success: true }
})
