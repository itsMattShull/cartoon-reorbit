import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function doAction({ token, dropletId, type }) {
  const start = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ type })
  })

  if (start.status === 422) return { completed: true } // already in desired state
  if (!start.ok) {
    const t = await start.text().catch(() => '')
    throw createError({ statusCode: start.status, statusMessage: `DO action failed: ${t || type}` })
  }

  const payload = await start.json()
  const actionId = payload?.action?.id
  if (!actionId) return { completed: false }

  // Poll action until completed or timeout
  const deadlineMs = 90_000
  const intervalMs = 2_000
  const t0 = Date.now()
  while (Date.now() - t0 < deadlineMs) {
    await sleep(intervalMs)
    const a = await fetch(`https://api.digitalocean.com/v2/actions/${actionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!a.ok) break
    const aj = await a.json()
    const st = aj?.action?.status
    if (st === 'completed') return { completed: true }
    if (st === 'errored') throw createError({ statusCode: 502, statusMessage: 'DO action errored' })
  }
  return { completed: false }
}

async function getStatus({ token, dropletId }) {
  const r = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!r.ok) return 'unknown'
  const j = await r.json()
  return j?.droplet?.status ?? 'unknown'
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const { action } = await readBody(event) || {}
  if (!['on', 'off'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'action must be "on" or "off"' })
  }

  const dropletId = process.env.DROPLET_DEV_ID
  const token = process.env.DO_ACCESS_TOKEN || process.env.DO_API_TOKEN || process.env.DO_TOKEN
  if (!dropletId) throw createError({ statusCode: 500, statusMessage: 'Missing DROPLET_DEV_ID' })
  if (!token)     throw createError({ statusCode: 500, statusMessage: 'Missing DO_ACCESS_TOKEN' })

  const current = await getStatus({ token, dropletId })

  if (action === 'on' && current !== 'active') {
    await doAction({ token, dropletId, type: 'power_on' })
  } else if (action === 'off' && current !== 'off') {
    // Try graceful power_off
    await doAction({ token, dropletId, type: 'power_off' })
  }

  // Verify final state
  // Poll a few times for the droplet status to reflect action
  for (let i = 0; i < 15; i++) {
    const st = await getStatus({ token, dropletId })
    if (action === 'on'  && st === 'active') return { status: st }
    if (action === 'off' && st === 'off')    return { status: st }
    await sleep(2000)
  }

  // Return whatever status we see last
  return { status: await getStatus({ token, dropletId }) }
})
