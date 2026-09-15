-- CreateEnum
CREATE TYPE "CMoonJoinEffectTextPosition" AS ENUM ('ABOVE_IMAGE', 'BELOW_IMAGE');

-- CreateTable
CREATE TABLE "CMoonJoinEffect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "backgroundColor" TEXT NOT NULL,
    "imagePath" TEXT,
    "text" TEXT,
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "textPosition" "CMoonJoinEffectTextPosition" NOT NULL DEFAULT 'BELOW_IMAGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonJoinEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonJoinEffect_name_key" ON "CMoonJoinEffect"("name");

-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN "customJoinEffectId" TEXT;

-- AddForeignKey
ALTER TABLE "CMoon" ADD CONSTRAINT "CMoon_customJoinEffectId_fkey" FOREIGN KEY ("customJoinEffectId") REFERENCES "CMoonJoinEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A cMoon uses EITHER the closed-set effectType OR an admin-authored customJoinEffectId, never
-- both — every admin endpoint that writes either field validates this, but Prisma's schema
-- language can't express the XOR itself, so it's backstopped here the same way
-- BlackjackSession_practice_is_free backstops its own invariant (see
-- prisma/migrations/20260802000000_add_reorbit_blackjack).
DO $$ BEGIN
  ALTER TABLE "CMoon"
    ADD CONSTRAINT "CMoon_effectType_xor_customJoinEffectId"
    CHECK (NOT ("effectType" IS NOT NULL AND "customJoinEffectId" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
