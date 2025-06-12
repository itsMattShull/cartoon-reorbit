import { prisma } from '@/server/prisma'

export default defineNuxtPlugin(() => {
  return {
    provide: {
      prisma
    }
  }
})