// scripts/update-ctoon-supply.js
import { prisma } from '@/server/prisma'

async function main() {
  // 1. Define your rarity thresholds
  const thresholds = {
    Common: 100,
    Uncommon: 75,
    Rare: 50,
    'Very Rare': 35,
    'Crazy Rare': 25,
  };

  // 2. Loop over each rarity
  for (const [rarity, maxSupply] of Object.entries(thresholds)) {
    // Fetch all Ctoons of this rarity
    const ctoons = await prisma.ctoon.findMany({
      where: { rarity },
      select: { id: true, name: true },
    });

    for (const { id, name } of ctoons) {
      // 3. Compute the highest mintNumber for this Ctoon
      const agg = await prisma.userCtoon.aggregate({
        where: { ctoonId: id },
        _max: { mintNumber: true },
      });
      const maxMint = agg._max.mintNumber ?? 0;

      // 4. Only update if we haven't already minted beyond the threshold
      if (maxMint <= maxSupply) {
        await prisma.ctoon.update({
          where: { id },
          data: {
            initialQuantity: maxSupply,
            quantity: maxSupply,
          },
        });
        console.log(`✅ [${rarity}] ${name} (${id}) → set supply = ${maxSupply}`);
      } else {
        console.log(
          `⏭️  [${rarity}] ${name} (${id}) skipped; maxMint=${maxMint} > ${maxSupply}`
        );
      }
    }
  }
}

main()
  .catch((e) => {
    console.error('Script error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
