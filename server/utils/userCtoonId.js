import { prisma } from '@/server/prisma'

export function encodeUserCtoonId(userId, ctoonId, mintNumber) {
  const m = mintNumber == null ? 'x' : String(mintNumber)
  return `uc|${userId}|${ctoonId}|${m}`
}

export function isSyntheticUserCtoonId(id) {
  return typeof id === 'string' && id.startsWith('uc|')
}

export async function resolveUserCtoonId(input) {
  if (!isSyntheticUserCtoonId(input)) return input
  const [, userId, ctoonId, mintStr] = input.split('|')
  const mintNumber = mintStr === 'x' ? null : parseInt(mintStr, 10)
  const rec = await prisma.userCtoon.findFirst({
    where: { userId, ctoonId, mintNumber: mintNumber ?? null, burnedAt: null },
    select: { id: true }
  })
  return rec?.id ?? null
}
