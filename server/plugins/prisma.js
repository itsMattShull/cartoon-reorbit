import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.prisma = prisma
  })
})
