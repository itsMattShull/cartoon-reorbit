-- CreateTable: CheatFinderConfirmation
CREATE TABLE IF NOT EXISTS "CheatFinderConfirmation" (
  "id"                  TEXT         NOT NULL,
  "type"                TEXT         NOT NULL,
  "groupKey"            TEXT         NOT NULL,
  "aliasUsernames"      TEXT[]       NOT NULL,
  "note"                TEXT,
  "confirmedByUserId"   TEXT         NOT NULL,
  "confirmedByUsername" TEXT,
  "confirmedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheatFinderConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CheatFinderConfirmation_type_groupKey_key" ON "CheatFinderConfirmation"("type", "groupKey");
CREATE INDEX IF NOT EXISTS "CheatFinderConfirmation_type_idx" ON "CheatFinderConfirmation"("type");
CREATE INDEX IF NOT EXISTS "CheatFinderConfirmation_confirmedAt_idx" ON "CheatFinderConfirmation"("confirmedAt");

-- AddForeignKey
ALTER TABLE "CheatFinderConfirmation" ADD CONSTRAINT "CheatFinderConfirmation_confirmedByUserId_fkey"
  FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: supporting the Cheat Finder date-range scans
CREATE INDEX IF NOT EXISTS "LoginLog_createdAt_idx" ON "LoginLog"("createdAt");
CREATE INDEX IF NOT EXISTS "VpnLog_detectedAt_idx" ON "VpnLog"("detectedAt");
