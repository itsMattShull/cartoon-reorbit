import { prisma } from '@/server/prisma'

async function main() {
  // First delete related UserCtoon entries
  await prisma.userCtoon.deleteMany({
    where: {
      ctoon: {
        name: {
          in: ['Dexter', 'Mojo Jojo']
        }
      }
    }
  })

  // Then delete the Ctoons
  const deleted = await prisma.ctoon.deleteMany({
    where: {
      name: {
        in: ['Dexter', 'Mojo Jojo']
      }
    }
  })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {})
