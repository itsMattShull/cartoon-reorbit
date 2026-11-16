// Pure validators for the MyOrbit admin moderation endpoints (mute/ban/delete-message). Same
// import-free, DB-free contract as server/utils/myOrbitAssets.js.

export const MYORBIT_MUTE_MINUTES_MIN = 1
export const MYORBIT_MUTE_MINUTES_MAX = 10_080 // 7 days
export const MYORBIT_REASON_MAX_LENGTH = 300

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

function parseReason(value) {
  if (value === undefined || value === null) return { ok: true, reason: null }
  if (typeof value !== 'string') return { ok: false, message: 'Reason must be text' }
  const trimmed = value.trim()
  if (trimmed.length > MYORBIT_REASON_MAX_LENGTH) {
    return { ok: false, message: `Reason must be ${MYORBIT_REASON_MAX_LENGTH} characters or fewer` }
  }
  return { ok: true, reason: trimmed || null }
}

export function parseMyOrbitMuteBody(body) {
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return { ok: false, message: 'userId is required' }
  const minutes = toNumber(body?.minutes)
  if (!Number.isInteger(minutes) || minutes < MYORBIT_MUTE_MINUTES_MIN || minutes > MYORBIT_MUTE_MINUTES_MAX) {
    return { ok: false, message: `Minutes must be a whole number between ${MYORBIT_MUTE_MINUTES_MIN} and ${MYORBIT_MUTE_MINUTES_MAX}` }
  }
  const parsedReason = parseReason(body?.reason)
  if (!parsedReason.ok) return parsedReason
  return { ok: true, data: { userId, minutes, reason: parsedReason.reason } }
}

export function parseMyOrbitBanBody(body) {
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return { ok: false, message: 'userId is required' }
  const parsedReason = parseReason(body?.reason)
  if (!parsedReason.ok) return parsedReason
  return { ok: true, data: { userId, reason: parsedReason.reason } }
}

export function parseMyOrbitUserIdBody(body) {
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return { ok: false, message: 'userId is required' }
  return { ok: true, data: { userId } }
}

export function parseMyOrbitDeleteMessageBody(body) {
  const roomId = typeof body?.roomId === 'string' ? body.roomId : ''
  const messageId = typeof body?.messageId === 'string' ? body.messageId : ''
  const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : ''
  const messageText = typeof body?.messageText === 'string' ? body.messageText : ''
  if (!roomId) return { ok: false, message: 'roomId is required' }
  if (!messageId) return { ok: false, message: 'messageId is required' }
  if (!targetUserId) return { ok: false, message: 'targetUserId is required' }
  const parsedReason = parseReason(body?.reason)
  if (!parsedReason.ok) return parsedReason
  return { ok: true, data: { roomId, messageId, targetUserId, messageText, reason: parsedReason.reason } }
}

export function parseMyOrbitBannedWordBody(body) {
  const phrase = typeof body?.phrase === 'string' ? body.phrase.trim() : ''
  if (!phrase) return { ok: false, message: 'phrase is required' }
  if (phrase.length > 80) return { ok: false, message: 'phrase must be 80 characters or fewer' }
  return { ok: true, data: { phrase } }
}
