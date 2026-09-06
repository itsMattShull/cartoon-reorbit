-- Per-nav-button haptic sound assignments, resolved against a small reusable sound library.
ALTER TABLE "GlobalGameConfig" ADD COLUMN "uiNavButtonSounds" JSONB;

CREATE TABLE "UiSound" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UiSound_pkey" PRIMARY KEY ("id")
);
