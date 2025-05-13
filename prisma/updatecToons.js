/*
Active user = logged in in the last 2 weeks

Common: 20 per-user limit for first 48 hours and 250% of active user base (minimum of 150)

Uncommon: 10 per-user limit for first 48 hours and 200% of active user base (minimum of 100) 

Rare: 5 per-user limit for first 48 hours and 150% of active user base (minimum of 75)

Very Rare: 3 per-user limit for first 48 hours and 100% of active user base (minimum of 50)

Crazy Rare: 1 per-user limit for first 48 hours and 50% of active user base (minimum of 25)
*/

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ctoons = [
    { inCmart: true, name: 'Bat Signal (Top)', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: true, name: 'Bat Signal (Middle)', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1, perUserLimit: 1 },
    { inCmart: true, name: 'Bat Signal (Bottom)', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Dee Dee', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Valentine Mandark', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Watcher Dexter', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: true, name: 'Ed (Run)', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20 },
    { inCmart: false, name: 'Space Outlaw Ed', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Space Outlaw Edd', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Space Outlaw Eddy', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Fearless Flash', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'The Batman', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Undaunted Hawkgirl', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Funky Blue Bubbles', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Funky Green Buttercup', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Funky Pink Blossom', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Lazy Scooby', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Shaggy', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: false, name: 'Velma', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1 },
    { inCmart: true, name: 'Watcher Yogi', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20 },
    { inCmart: true, name: 'Space Ghost (Flying)', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20 },
    { inCmart: true, name: 'Obi-Wan Kenobi', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20 },
    { inCmart: true, name: 'Skeletor', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20 },
    { inCmart: true, name: 'Private John Stewart', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20 },
    { inCmart: true, name: 'Hamtaro', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10 },
    { inCmart: true, name: 'Johnny Bravo', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10 },
    { inCmart: true, name: 'Schoolgirl Sakura', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10 },
    { inCmart: true, name: 'Fred Flintstone (Mowing)', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10 },
    { inCmart: true, name: 'Ed Edd n Eddy', quantity: 75, initialQuantity: 75, rarity: "Rare", perUserLimit: 5 },
    { inCmart: true, name: 'Huckleberry (Waving)', quantity: 75, initialQuantity: 75, rarity: "Rare", perUserLimit: 5 },
    { inCmart: true, name: 'Kungfu Hong Kong Phooey', quantity: 75, initialQuantity: 75, rarity: "Rare", perUserLimit: 5 },
    { inCmart: true, name: 'Cybersuit Dexter', quantity: 50, initialQuantity: 50, rarity: "Very Rare", perUserLimit: 3 },
    { inCmart: true, name: 'Charizard', quantity: 50, initialQuantity: 50, rarity: "Very Rare", perUserLimit: 3 },
    { inCmart: true, name: 'Goku', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1 },
  ]

  // Update initialQuantity for each Ctoon
  for (const { inCmart, name, quantity, initialQuantity, rarity, perUserLimit } of ctoons) {
    await prisma.ctoon.updateMany({
      where: { name },
      data: { inCmart: inCmart, quantity: quantity, initialQuantity: initialQuantity, rarity: rarity, perUserLimit: perUserLimit }
    })
  }

  // Update all UserCtoon records to set isFirstEdition = true
  await prisma.userCtoon.updateMany({
    data: { isFirstEdition: true }
  })

  console.log('Ctoon initialQuantity and UserCtoon isFirstEdition updated successfully.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())