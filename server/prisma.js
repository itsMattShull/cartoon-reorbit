// server/prisma.js
import { PrismaClient } from '@prisma/client'

/**
 * Create a single, shared PrismaClient across hot-reloads in development
 * to avoid exhausting database connections.
 */
let prisma

if (process.env.NODE_ENV === 'production') {
  // In production, instantiate once
  prisma = new PrismaClient()
} else {
  // In development, preserve the client across module reloads
  if (!global.__db) {
    global.__db = new PrismaClient({
      // Optional logging
      // log: ['query', 'info', 'warn', 'error'],
    })
  }
  prisma = global.__db
}

export { prisma }
