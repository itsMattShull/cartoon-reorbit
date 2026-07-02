// scripts/updateFirstEditions.js
// First Edition is now a property of the parent cToon (NOT isSecondEdition),
// not something computed per-mint from mintNumber/initialQuantity.
import { prisma } from '@/server/prisma'

async function main() {
  const result = await prisma.$executeRaw`
    UPDATE "UserCtoon" uc
    SET "isFirstEdition" = NOT c."isSecondEdition"
    FROM "Ctoon" c
    WHERE uc."ctoonId" = c.id
      AND uc."isFirstEdition" IS DISTINCT FROM (NOT c."isSecondEdition")
  `
  console.log(`Updated ${result} UserCtoon row(s).`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {})
