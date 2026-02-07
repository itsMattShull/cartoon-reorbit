import { createError } from 'h3'

const BASE_URL = 'https://api.digitalocean.com/v2'
const ACTION_TIMEOUT_MS = 10 * 60 * 1000
const ACTION_POLL_MS = 4000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function api({ token, path, method = 'GET', body }) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw createError({ statusCode: resp.status, statusMessage: text || 'DigitalOcean error' })
  }

  return resp.json()
}

async function getDroplet({ token, dropletId }) {
  const data = await api({ token, path: `/droplets/${dropletId}` })
  return data?.droplet
}

async function waitAction({ token, actionId, label }) {
  if (!actionId) return
  const start = Date.now()
  while (Date.now() - start < ACTION_TIMEOUT_MS) {
    const data = await api({ token, path: `/actions/${actionId}` })
    const status = data?.action?.status
    if (status === 'completed') return
    if (status === 'errored') {
      throw createError({ statusCode: 502, statusMessage: `DigitalOcean ${label} errored` })
    }
    await sleep(ACTION_POLL_MS)
  }
  throw createError({ statusCode: 504, statusMessage: `DigitalOcean ${label} timed out` })
}

async function ensureOff({ token, dropletId }) {
  const droplet = await getDroplet({ token, dropletId })
  if (droplet?.status === 'off') return

  try {
    const { action } = await api({
      token,
      path: `/droplets/${dropletId}/actions`,
      method: 'POST',
      body: { type: 'shutdown' }
    })
    await waitAction({ token, actionId: action?.id, label: 'shutdown' })
  } catch (err) {
    // Fall through to power_off if shutdown is rejected.
  }

  const afterShutdown = await getDroplet({ token, dropletId })
  if (afterShutdown?.status === 'off') return

  const { action } = await api({
    token,
    path: `/droplets/${dropletId}/actions`,
    method: 'POST',
    body: { type: 'power_off' }
  })
  await waitAction({ token, actionId: action?.id, label: 'power_off' })
}

async function powerOn({ token, dropletId }) {
  const droplet = await getDroplet({ token, dropletId })
  if (droplet?.status === 'active') return

  const { action } = await api({
    token,
    path: `/droplets/${dropletId}/actions`,
    method: 'POST',
    body: { type: 'power_on' }
  })
  await waitAction({ token, actionId: action?.id, label: 'power_on' })
}

async function waitForActive({ token, dropletId, timeoutMs = ACTION_TIMEOUT_MS, intervalMs = 5000 }) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const droplet = await getDroplet({ token, dropletId })
    if (droplet?.status === 'active') return droplet
    await sleep(intervalMs)
  }
  throw createError({ statusCode: 504, statusMessage: 'Droplet did not become active' })
}

export async function resizeCpuRamOnly({ token, dropletId, sizeSlug }) {
  await ensureOff({ token, dropletId })
  const { action } = await api({
    token,
    path: `/droplets/${dropletId}/actions`,
    method: 'POST',
    body: { type: 'resize', size: sizeSlug }
  })
  await waitAction({ token, actionId: action?.id, label: 'resize' })
  await powerOn({ token, dropletId })
  const droplet = await waitForActive({ token, dropletId })
  return droplet?.size_slug || sizeSlug
}
