// /api/admin/ctoon/[id].put.js


import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  // Admin check
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

  try {
    const body = await readBody(event)
    const {
      name,
      series,
      rarity,
      price,
      releaseDate,
      perUserLimit,
      quantity,
      initialQuantity,
      inCmart,
      set,
      characters
    } = body

    // blank quantities → null, otherwise cast to number
    const parsedQuantity = (quantity === '' || quantity == null)
      ? null
      : Number(quantity)
    const parsedInitialQuantity = (initialQuantity === '' || initialQuantity == null)
      ? null
      : Number(initialQuantity)


    // ── parse & validate just like in ctoon.post.js ──
     const newReleaseDate = new Date(releaseDate)
     if (isNaN(newReleaseDate.getTime())) {
       throw createError({ statusCode: 400, statusMessage: 'Invalid release date/time.' })
     }

    await prisma.ctoon.update({
      where: { id },
      data: {
        name,
        series,
        rarity,
        price,
        releaseDate: newReleaseDate,
        perUserLimit,
        quantity: parsedQuantity,
        initialQuantity: parsedInitialQuantity,
        inCmart,
        set,
        characters
      }
    })

    return { success: true, message: 'cToon updated successfully.' }

  } catch (error) {
    console.error(error)
    throw createError({ statusCode: 500, statusMessage: error.message || 'Internal Server Error' })
  }
})
