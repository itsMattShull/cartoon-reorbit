-- AlterEnum
-- Renames the value in place (not drop+add) so any CMoon row already set to 'POKEBALL' keeps
-- pointing at the same effect under its new name/content, rather than being silently reset to
-- null or left referencing a value the app no longer offers.
ALTER TYPE "CMoonEffectType" RENAME VALUE 'POKEBALL' TO 'FROG';
