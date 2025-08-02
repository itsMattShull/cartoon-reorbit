-- CreateTable
CREATE TABLE "ClashDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClashDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClashDeckCard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,

    CONSTRAINT "ClashDeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClashDeckCard_deckId_ctoonId_key" ON "ClashDeckCard"("deckId", "ctoonId");

-- AddForeignKey
ALTER TABLE "ClashDeck" ADD CONSTRAINT "ClashDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClashDeckCard" ADD CONSTRAINT "ClashDeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "ClashDeck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClashDeckCard" ADD CONSTRAINT "ClashDeckCard_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
