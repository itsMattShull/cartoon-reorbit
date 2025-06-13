// server/api/trade/rooms.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {

  try {
    const rooms = await prisma.tradeRoom.findMany({
      where: {
        active: true
      },
      select: {
        name: true,
        traderA: {
          select: {
            username: true,
            avatar: true
          }
        },
        traderB: {
          select: {
            username: true,
            avatar: true
          }
        },
        spectators: {
          select: {
            user: {
              select: {
                username: true,
                avatar: true
              }
            }
          }
        }
      }
    })

    const formatted = rooms.map(room => ({
      name: room.name,
      traderA: room.traderA,
      traderB: room.traderB,
      spectators: room.spectators.length
    }))

    return { rooms: formatted }
  } catch (err) {
    console.error('[Trade Rooms API] Failed to fetch rooms', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch trade rooms' })
  }
})
