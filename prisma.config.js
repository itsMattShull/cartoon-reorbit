// Prisma 7 moves the datasource URL, migrations path and seed command out of schema.prisma /
// package.json into this file, and the CLI no longer loads .env on its own.
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js'
  },
  datasource: {
    url: env('DATABASE_URL')
  }
})
