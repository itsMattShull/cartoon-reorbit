// Re-export the centralized Prisma client with conservative pool and logging.
// Ensures all server code shares a single configuration and connection pool.
// Use a relative import here so TypeScript doesn't require the `@` alias mapping.
import { prisma as serverPrisma } from '../server/prisma.js'

export default serverPrisma
export { serverPrisma as prisma }
