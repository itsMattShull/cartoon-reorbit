// server/utils/request-ip.js
// Client IP resolution shared by request-time capture points (login logging,
// trade-offer IP/device capture for the admin "Track Touch Trades" report).
//
// Trusts the first hop of X-Forwarded-For unconditionally, same as this app's
// login-log middleware always has — spoofable by the client, since nothing
// here validates a trusted-proxy count. Treat any IP captured this way as
// corroborating evidence, never as proof.
export function getRequestIP(event) {
  const headers = event.node.req.headers
  const forwarded = headers['x-forwarded-for']
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim()
    if (firstIp) return firstIp
  }
  return event.node.req.socket?.remoteAddress || null
}
