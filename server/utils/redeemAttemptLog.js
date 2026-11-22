// server/utils/redeemAttemptLog.js
//
// Records FAILED code redemptions (POST /api/redeem) into RedeemAttemptLog, for the admin Codes →
// "Failed Attempts" tab. Built to help find out how some players claim codes the instant they go
// live: a NOT_STARTED row means the player already had a real code before it went live, a run of
// INVALID rows means guessing, and the stored request headers show whether a real browser sent it.
//
// The redemption logic itself (server/utils/codeRedemption.js) is untouched. This only classifies
// the error it threw, by its statusMessage. Never throws: a logging failure must never change
// what the player sees.
import { prisma } from '../prisma.js'
import { encryptIp } from './ip-encrypt.js'
import { getClientRequestIP } from './request-ip.js'

export const REDEEM_FAILURE_REASONS = [
  'INVALID', // no ClaimCode with that text
  'NOT_STARTED', // real code, before its startsAt
  'EXPIRED',
  'PREREQ', // missing prerequisite cToons
  'FULL', // maxClaims reached
  'ALREADY_REDEEMED',
  'MISSING', // empty / non-string code
  'ERROR' // anything else (mint failure, 500s)
]

const CODE_TEXT_MAX = 100
const MESSAGE_MAX = 300
const HEADER_MAX = 500

/** Maps an error thrown by redeemClaimCode to one of REDEEM_FAILURE_REASONS. */
export function classifyRedeemFailure (err) {
  const msg = String(err?.statusMessage || err?.message || '')
  if (msg === 'Code is required') return 'MISSING'
  if (msg === 'Invalid code') return 'INVALID'
  if (msg === 'This code is not yet available') return 'NOT_STARTED'
  if (msg === 'Code expired') return 'EXPIRED'
  if (msg.startsWith('You must own')) return 'PREREQ'
  if (msg === 'Code fully redeemed') return 'FULL'
  if (msg === 'Code already redeemed') return 'ALREADY_REDEEMED'
  return 'ERROR'
}

const cut = (v, n) => {
  if (v == null || v === '') return null
  const s = Array.isArray(v) ? v.join(', ') : String(v)
  return s.length > n ? s.slice(0, n) : s
}

function codeTextOf (code) {
  if (typeof code === 'string') return code.slice(0, CODE_TEXT_MAX)
  if (code == null) return ''
  try { return JSON.stringify(code).slice(0, CODE_TEXT_MAX) } catch { return '' }
}

/**
 * Writes one RedeemAttemptLog row for a failed redemption. `code` is the raw submitted value;
 * `error` is what redeemClaimCode threw. Swallows every error of its own.
 */
export async function logFailedRedeemAttempt (event, { userId, code, error }) {
  try {
    if (!userId) return
    const codeText = codeTextOf(code)
    const reason = classifyRedeemFailure(error)
    // Link the row to the real code when the text matched one, so the tab can show its start time.
    const match = typeof code === 'string' && code && reason !== 'INVALID' && reason !== 'MISSING'
      ? await prisma.claimCode.findUnique({ where: { code }, select: { id: true } })
      : null
    const headers = event?.node?.req?.headers || {}
    const ip = getClientRequestIP(event)
    await prisma.redeemAttemptLog.create({
      data: {
        userId,
        codeText,
        codeId: match?.id ?? null,
        reason,
        statusCode: Number(error?.statusCode) || 500,
        message: cut(error?.statusMessage || error?.message, MESSAGE_MAX),
        ip: ip ? encryptIp(ip) : null, // encryptIp returns null rather than ever storing plaintext
        userAgent: cut(headers['user-agent'], HEADER_MAX),
        origin: cut(headers.origin, HEADER_MAX),
        referer: cut(headers.referer, HEADER_MAX),
        secFetchSite: cut(headers['sec-fetch-site'], 50)
      }
    })
  } catch (err) {
    console.error('[redeemAttemptLog] could not log failed attempt:', err?.message || err)
  }
}
