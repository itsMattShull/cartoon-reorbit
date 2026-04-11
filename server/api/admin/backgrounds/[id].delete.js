import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'

function bgDir() {
  return process.env.BASE_UPLOAD_DIRECTORY
    ? join(process.env.BASE_UPLOAD_DIRECTORY, 'backgrounds')
    : join(process.cwd(), 'public', 'backgrounds')
}

export default defineEventHandler(async (event) => {
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

  const id = event.context.params?.id
  const bg = await db.background.findUnique({ where: { id } })
  if (!bg) throw createError({ statusCode: 404, statusMessage: 'Background not found' })

  const usedRows = await db.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "CZone" cz
    WHERE cz."background" = ${bg.filename}
      OR (
        jsonb_typeof(cz."layoutData"->'zones') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
          WHERE z->>'background' = ${bg.filename}
        )
      );
  `
  const used = Number(usedRows?.[0]?.count ?? 0)
  if (used > 0) throw createError({ statusCode: 409, statusMessage: 'In use by some cZones' })

  try { await unlink(join(bgDir(), bg.filename)) } catch {}
  await db.background.delete({ where: { id } })
  return { ok: true }
})
