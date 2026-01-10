/*
Active user = logged in in the last 2 weeks

Common: 20 per-user limit for first 48 hours and 250% of active user base (minimum of 150)

Uncommon: 10 per-user limit for first 48 hours and 200% of active user base (minimum of 100) 

Rare: 5 per-user limit for first 48 hours and 150% of active user base (minimum of 75)

Very Rare: 3 per-user limit for first 48 hours and 100% of active user base (minimum of 50)

Crazy Rare: 1 per-user limit for first 48 hours and 50% of active user base (minimum of 25)
*/

import { prisma } from '@/server/prisma'

async function main() {
  const priceCtoons = [
    { inCmart: false, name: 'Bat Signal (Top)', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1, price: 1500, characters: [] },
    { inCmart: false, name: 'Bat Signal (Middle)', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1, price: 1500, characters: [] },
    { inCmart: false, name: 'Bat Signal (Bottom)', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1, price: 1500, characters: [] },
  ]

  const ctoons = [
    { inCmart: false, name: 'Dee Dee', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Dee Dee'] },
    { inCmart: false, name: 'Valentine Mandark', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Mandark'] },
    { inCmart: false, name: 'Watcher Dexter', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Dexter'] },
    { inCmart: true, name: 'Ed (Run)', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20, characters:  ['Ed'] },
    { inCmart: false, name: 'Space Outlaw Ed', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Ed'] },
    { inCmart: false, name: 'Space Outlaw Edd', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Edd'] },
    { inCmart: false, name: 'Space Outlaw Eddy', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Eddy'] },
    { inCmart: false, name: 'Fearless Flash', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Flash'] },
    { inCmart: false, name: 'The Batman', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Batman'] },
    { inCmart: false, name: 'Undaunted Hawkgirl', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Hawkgirl'] },
    { inCmart: false, name: 'Funky Blue Bubbles', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Bubbles'] },
    { inCmart: false, name: 'Funky Green Buttercup', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Buttercup'] },
    { inCmart: false, name: 'Funky Pink Blossom', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Blossom'] },
    { inCmart: false, name: 'Lazy Scooby', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Scooby Doo'] },
    { inCmart: false, name: 'Shaggy', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Shaggy'] },
    { inCmart: false, name: 'Velma', quantity: null, initialQuantity: null, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Velma'] },
    { inCmart: true, name: 'Watcher Yogi', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20, characters:  ['Yogi Bear'] },
    { inCmart: true, name: 'Space Ghost (Flying)', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20, characters:  ['Space Ghost'] },
    { inCmart: true, name: 'Obi-Wan Kenobi', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20, characters:  ['Obi-Wan Kenobi'] },
    { inCmart: true, name: 'Skeletor', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20, characters:  ['Skeletor'] },
    { inCmart: true, name: 'Private John Stewart', quantity: 150, initialQuantity: 150, rarity: "Common", perUserLimit: 20, characters:  ['John Stewart'] },
    { inCmart: true, name: 'Hamtaro', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10, characters:  ['Hamtaro'] },
    { inCmart: true, name: 'Johnny Bravo', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10, characters:  ['Johnny Bravo'] },
    { inCmart: true, name: 'Schoolgirl Sakura', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10, characters:  ['Sakura'] },
    { inCmart: true, name: 'Fred Flintstone (Mowing)', quantity: 100, initialQuantity: 100, rarity: "Uncommon", perUserLimit: 10, characters: ['Fred Flintstone'] },
    { inCmart: true, name: 'Ed Edd n Eddy', quantity: 75, initialQuantity: 75, rarity: "Rare", perUserLimit: 5, characters:  ['Ed', 'Edd', 'Eddy'] },
    { inCmart: true, name: 'Huckleberry (Waving)', quantity: 75, initialQuantity: 75, rarity: "Rare", perUserLimit: 5, characters:  ['Huckleberry Hound'] },
    { inCmart: true, name: 'Kungfu Hong Kong Phooey', quantity: 75, initialQuantity: 75, rarity: "Rare", perUserLimit: 5, characters:  ['Hong Kong Phooey'] },
    { inCmart: true, name: 'Cybersuit Dexter', quantity: 50, initialQuantity: 50, rarity: "Very Rare", perUserLimit: 3, characters:  ['Dexter'] },
    { inCmart: true, name: 'Charizard', quantity: 50, initialQuantity: 50, rarity: "Very Rare", perUserLimit: 3, characters:  ['Charizard'] },
    { inCmart: true, name: 'Goku', quantity: 25, initialQuantity: 25, rarity: "Crazy Rare", perUserLimit: 1, characters:  ['Goku'] },
  ]

  // Update initialQuantity for each Ctoon
  for (const { inCmart, name, quantity, initialQuantity, rarity, perUserLimit, characters } of ctoons) {
    await prisma.ctoon.updateMany({
      where: { name },
      data: { inCmart: inCmart, quantity: quantity, initialQuantity: initialQuantity, rarity: rarity, perUserLimit: perUserLimit, characters: characters }
    })
  }

  for (const { inCmart, name, quantity, initialQuantity, rarity, perUserLimit, price, characters } of priceCtoons) {
    await prisma.ctoon.updateMany({
      where: { name },
      data: { inCmart: inCmart, quantity: quantity, initialQuantity: initialQuantity, rarity: rarity, perUserLimit: perUserLimit, price: price, characters: characters }
    })
  }

  // Update all UserCtoon records to set isFirstEdition = true
  await prisma.userCtoon.updateMany({
    data: { isFirstEdition: true }
  })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {})
