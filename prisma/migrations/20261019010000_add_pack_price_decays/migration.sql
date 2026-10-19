-- Per-pack switch for the cMart price decay. Defaults to true so every existing pack keeps
-- decaying exactly as it does today; an admin turns it off per pack on the create/edit pack page.
ALTER TABLE "Pack" ADD COLUMN IF NOT EXISTS "priceDecays" BOOLEAN NOT NULL DEFAULT true;
