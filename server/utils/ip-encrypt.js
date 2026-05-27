/**
 * Deterministic AES-256-CBC encryption for IP addresses.
 * The IV is derived from the key so the same IP always produces
 * the same ciphertext — this lets us query WHERE ip = encryptIp(x).
 *
 * Requires env var: IP_ENCRYPTION_KEY (64 hex chars = 32 bytes)
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, createHash } from 'crypto'

function getKeyAndIV() {
  const keyHex = process.env.IP_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('IP_ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes)')
  }
  const key = Buffer.from(keyHex, 'hex')
  // Derive a fixed 16-byte IV from the key deterministically
  const iv = createHash('sha256').update(key).digest().slice(0, 16)
  return { key, iv }
}

/**
 * Encrypt a plaintext IP address → hex ciphertext string.
 * Returns null if encryption fails (e.g. IP_ENCRYPTION_KEY not set).
 * NEVER falls back to returning the plaintext IP.
 */
export function encryptIp(ip) {
  if (!ip) return ip
  try {
    const { key, iv } = getKeyAndIV()
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    return cipher.update(ip, 'utf8', 'hex') + cipher.final('hex')
  } catch (err) {
    console.error('[ip-encrypt] encryptIp failed — IP will NOT be stored:', err.message)
    return null // Never fall back to storing plaintext
  }
}

/**
 * Decrypt a hex ciphertext back to a plaintext IP address.
 */
export function decryptIp(encrypted) {
  if (!encrypted) return encrypted
  // If it doesn't look like hex ciphertext, return as-is (handles legacy plaintext rows)
  if (!/^[0-9a-f]+$/i.test(encrypted)) return encrypted
  try {
    const { key, iv } = getKeyAndIV()
    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
  } catch {
    return encrypted
  }
}
