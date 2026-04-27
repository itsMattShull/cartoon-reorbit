-- CreateTable
CREATE TABLE "WordleLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "wordleNumber" INTEGER,
    "userId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "score" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordleLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordleLog_messageId_userId_key" ON "WordleLog"("messageId", "userId");

-- CreateIndex
CREATE INDEX "WordleLog_userId_createdAt_idx" ON "WordleLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WordleLog_createdAt_idx" ON "WordleLog"("createdAt");

-- AddForeignKey
ALTER TABLE "WordleLog" ADD CONSTRAINT "WordleLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
