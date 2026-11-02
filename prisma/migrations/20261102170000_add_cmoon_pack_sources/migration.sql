-- AlterEnum
-- Two new PackSource values for packs granted through the cMoon system (see that enum's own
-- schema comments): CMOON_ENEMY_REWARD (a cMoon enemy/raid boss PACK-type reward) and
-- CMOON_DISPERSAL (claiming a PACK option on a CMoonDispersalOffer). Split across two statements
-- since Postgres can't add more than one enum value per transaction/migration.
ALTER TYPE "PackSource" ADD VALUE 'CMOON_ENEMY_REWARD';
ALTER TYPE "PackSource" ADD VALUE 'CMOON_DISPERSAL';
