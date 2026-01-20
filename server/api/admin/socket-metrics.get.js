import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { useRuntimeConfig } from '#imports'

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

  const { limit } = getQuery(event)
  const config = useRuntimeConfig()
  const base = config.socketOrigin || 'http://localhost:3001'
  const url = new URL('/metrics/socket', base)
  if (limit) url.searchParams.set('limit', String(limit))

  const headers = {}
  if (config.socketMetricsToken) {
    headers['x-metrics-token'] = config.socketMetricsToken
  }

  return await $fetch(url.toString(), { headers })
})
