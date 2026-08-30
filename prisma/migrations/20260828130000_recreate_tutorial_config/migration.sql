-- CreateTable
-- Re-creates TutorialConfig after 20260828120000_drop_tutorial_config removed it during the
-- incident where sanitize-html (a dependency of the admin tutorial editor, unrelated to this
-- table itself) broke nuxt-server under `require()`. The table shape is unchanged from the
-- original 20260828000000_add_tutorial_config migration.
CREATE TABLE "TutorialConfig" (
    "id" TEXT NOT NULL,
    "heroImagePath" TEXT,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorialConfig_pkey" PRIMARY KEY ("id")
);
