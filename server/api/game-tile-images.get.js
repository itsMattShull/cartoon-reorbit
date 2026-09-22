import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getPokemonBattleAssets } from '@/server/utils/pokemonBattleAssets'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'

export default defineEventHandler(async () => {
  const cfg = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      gameTileWinballImagePath:      true,
      gameTileLottoImagePath:        true,
      gameTileWinwheelImagePath:     true,
      gameTileClashImagePath:        true,
      gameTileTkoImagePath:          true,
      gameTileReorbitmatchImagePath: true,
      gameTileTowerImagePath:        true,
      gameTileReorbitmemoryImagePath: true,
      gameTileGuessctoonImagePath:   true,
      gameTileAsteroidImagePath:     true,
      gameTileFlappyImagePath:       true,
      gameTileBlackjackImagePath:    true,
      gameTileEdrpsImagePath:        true,
      gameTileFruitsamuraiImagePath: true,
      gameTilePokemonbattleImagePath: true
    }
  })

  // A game an admin has switched off is reported separately from its tile, because an absent
  // tile only means "no image uploaded" -- GamesHome still renders a text tile in that case,
  // which would leave a switched-off game plainly visible.
  const { config } = await getPokemonBattleAssets()
  const og = await getOgGtoonsConfig()
  const hidden = [
    ...(config.enabled ? [] : ['pokemonbattle']),
    // Hidden only once every section is closed — same as the hub page itself, which shows an
    // "unavailable" notice rather than an empty shell whenever a section is still open.
    ...(og.matchmakingEnabled || og.gameEnabled || og.deckBuildingEnabled || og.leaderboardEnabled ? [] : ['gtoonsclassic'])
  ]

  return {
    hidden,
    winball:      cfg?.gameTileWinballImagePath      ?? null,
    lotto:        cfg?.gameTileLottoImagePath        ?? null,
    winwheel:     cfg?.gameTileWinwheelImagePath     ?? null,
    clash:        cfg?.gameTileClashImagePath        ?? null,
    tko:          cfg?.gameTileTkoImagePath          ?? null,
    reorbitmatch: cfg?.gameTileReorbitmatchImagePath ?? null,
    tower:        cfg?.gameTileTowerImagePath        ?? null,
    reorbitmemory: cfg?.gameTileReorbitmemoryImagePath ?? null,
    guessctoon:   cfg?.gameTileGuessctoonImagePath    ?? null,
    asteroid:     cfg?.gameTileAsteroidImagePath      ?? null,
    flappy:       cfg?.gameTileFlappyImagePath        ?? null,
    blackjack:    cfg?.gameTileBlackjackImagePath     ?? null,
    edrps:        cfg?.gameTileEdrpsImagePath         ?? null,
    fruitsamurai: cfg?.gameTileFruitsamuraiImagePath  ?? null,
    pokemonbattle: cfg?.gameTilePokemonbattleImagePath ?? null
  }
})
