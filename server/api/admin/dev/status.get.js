import { defineEventHandler, getRequestHeader, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const dropletId = process.env.DROPLET_ID
  const token = process.env.DO_ACCESS_TOKEN || process.env.DO_API_TOKEN || process.env.DO_TOKEN
  if (!dropletId) throw createError({ statusCode: 500, statusMessage: 'Missing DROPLET_ID' })
  if (!token)     throw createError({ statusCode: 500, statusMessage: 'Missing DO_ACCESS_TOKEN' })

  const resp = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (resp.status === 404) return { status: 'missing' }
  if (!resp.ok) throw createError({ statusCode: resp.status, statusMessage: 'DigitalOcean error' })

  const data = await resp.json()
  return { status: data?.droplet?.status ?? 'unknown' }
})
