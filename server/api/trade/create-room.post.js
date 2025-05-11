// server/api/trade/create-room.post.js

import { v4 as uuidv4 } from 'uuid'
import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const { userId } = event.context
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // Generate a unique, fun room name (reuse your username generator logic if available)
  const adjectives = [
    'Epic', 'Wacky', 'Turbo', 'Zany', 'Cosmic', 'Mystic', 'Chill', 'Sneaky', 'Funky', 'Rowdy',
    'Brave', 'Curious', 'Cheeky', 'Bouncy', 'Gleaming', 'Crispy', 'Dizzy', 'Fluffy', 'Gritty', 'Happy',
    'Icy', 'Jolly', 'Kind', 'Lively', 'Merry', 'Nutty', 'Odd', 'Peppy', 'Quirky', 'Rusty',
    'Silly', 'Twisty', 'Upbeat', 'Vivid', 'Witty', 'Xenial', 'Yawning', 'Zesty', 'Boisterous', 'Clever',
    'Daring', 'Eager', 'Fierce', 'Goofy', 'Hasty', 'Itchy', 'Jumpy', 'Kooky', 'Loopy', 'Mighty',
    'Nifty', 'Obvious', 'Plucky', 'Quaint', 'Rapid', 'Sassy', 'Tasty', 'Unique', 'Vast', 'Wild',
    'Zippy', 'Jazzy', 'Breezy', 'Snappy', 'Twitchy', 'Grumpy', 'Jittery', 'Snazzy', 'Wiggly', 'Spunky',
    'Feisty', 'Quirky', 'Nervy', 'Wacky', 'Thrifty', 'Nimble', 'Lanky', 'Rustic', 'Tricky', 'Yappy',
    'Bubbly', 'Snugly', 'Sparky', 'Glitzy', 'Funky', 'Jumpy', 'Peppy', 'Giddy', 'Brassy', 'Ducky',
    'Perky', 'Zingy', 'Grizzly', 'Twirly', 'Slinky', 'Cranky', 'Loony', 'Bouncy', 'Quacky', 'Dapper'
  ]

  const creatures = [
    'Panda', 'Sloth', 'Dragon', 'Alien', 'Wizard', 'Robot', 'Ninja', 'Yeti', 'Vampire', 'Zombie',
    'Unicorn', 'Mermaid', 'Goblin', 'Troll', 'Pixie', 'Elf', 'Cyclops', 'Werewolf', 'Centaur', 'Griffin',
    'Phoenix', 'Kraken', 'Chimera', 'Minotaur', 'Imp', 'Fairy', 'Sprite', 'Demon', 'Angel', 'Mummy',
    'Beast', 'Specter', 'Gnome', 'Genie', 'Dwarf', 'Ogre', 'Hydra', 'Witch', 'Ghoul', 'Shapeshifter',
    'Banshee', 'Gremlin', 'Wraith', 'Phantom', 'Sasquatch', 'Kelpie', 'Nymph', 'Leviathan', 'Djinn', 'Basilisk',
    'Manticore', 'Dryad', 'Hobbit', 'Warg', 'Wendigo', 'Direwolf', 'Hellhound', 'Pegasus', 'Roc', 'Sphinx',
    'Selkie', 'Nokken', 'Sprite', 'Tengu', 'Taniwha', 'Gargoyle', 'Sprite', 'Leprechaun', 'Chupacabra', 'Harpy',
    'Mandrake', 'Bugbear', 'Rakshasa', 'Yokai', 'Kitsune', 'Tanuki', 'Fomorian', 'Baku', 'Mokele', 'Kappa',
    'Ittan-Momen', 'Yurei', 'Amarok', 'Barghest', 'Tikbalang', 'Encantado', 'Anzu', 'Camazotz', 'Aswang', 'Pontianak',
    'Tikoloshe', 'Azeman', 'Bunyip', 'Jorogumo', 'Nuckelavee', 'Domovoi', 'Tatzelwurm', 'Ziz', 'Gashadokuro', 'Qilin'
  ]

  const suffix = Math.floor(Math.random() * 1000)

  let name = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${creatures[Math.floor(Math.random() * creatures.length)]}${suffix}`

  // Ensure the name is unique
  let exists = await prisma.tradeRoom.findUnique({ where: { name } })
  while (exists) {
    name = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${creatures[Math.floor(Math.random() * creatures.length)]}${Math.floor(Math.random() * 1000)}`
    exists = await prisma.tradeRoom.findUnique({ where: { name } })
  }

  await prisma.tradeRoom.create({
    data: {
      id: uuidv4(),
      name,
      traderAId: userId,
      active: true,
    },
  })

  return { name }
})