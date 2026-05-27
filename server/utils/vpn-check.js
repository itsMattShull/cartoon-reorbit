/**
 * VPN / proxy detection via ip-api.com (free tier, no key needed).
 * Returns null on error or if the IP is private/local.
 */

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/i

export function isPrivateIp(ip) {
  if (!ip) return true
  return PRIVATE_IP_RE.test(ip)
}

/**
 * @param {string} ip
 * @returns {Promise<{isVpn:boolean, proxyType:string|null, isp:string|null, org:string|null, asn:string|null, country:string|null, countryCode:string|null, reason:string|null}|null>}
 */
export async function checkVpn(ip) {
  if (!ip || isPrivateIp(ip)) return null

  try {
    const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,isp,org,as,proxy,hosting,query`
    const res = await $fetch(url)

    if (!res || res.status !== 'success') return null

    const isVpn = !!(res.proxy || res.hosting)
    let proxyType = null
    let reason = null

    if (res.hosting) {
      proxyType = 'Datacenter/Hosting'
      reason = 'IP flagged as datacenter/hosting by ip-api.com'
    } else if (res.proxy) {
      proxyType = 'VPN/Proxy'
      reason = 'IP flagged as VPN/Proxy by ip-api.com'
    }

    return {
      isVpn,
      proxyType,
      isp: res.isp || null,
      org: res.org || null,
      asn: res.as || null,
      country: res.country || null,
      countryCode: res.countryCode || null,
      reason,
    }
  } catch {
    return null
  }
}
