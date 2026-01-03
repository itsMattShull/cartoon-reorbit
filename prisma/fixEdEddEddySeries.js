import { prisma } from '../server/prisma.js'

const TARGET_SERIES = ['Ed, Edd, N Eddy', 'Ed Edd N Eddy']
const UPDATED_SERIES = 'Ed, Edd n Eddy'

async function main() {
  const result = await prisma.ctoon.updateMany({
    where: { series: { in: TARGET_SERIES } },
    data: { series: UPDATED_SERIES },
  })

  if (result.count === 0) {
    console.log('No cToons matched the target series values. Nothing to update.')
    return
  }

  console.log(`Updated ${result.count} cToons to series "${UPDATED_SERIES}".`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {})
