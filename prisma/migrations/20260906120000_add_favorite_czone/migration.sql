-- CreateTable
CREATE TABLE "FavoriteCzone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoritedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteCzone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteCzone_favoritedUserId_idx" ON "FavoriteCzone"("favoritedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteCzone_userId_favoritedUserId_key" ON "FavoriteCzone"("userId", "favoritedUserId");

-- AddForeignKey
ALTER TABLE "FavoriteCzone" ADD CONSTRAINT "FavoriteCzone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCzone" ADD CONSTRAINT "FavoriteCzone_favoritedUserId_fkey" FOREIGN KEY ("favoritedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
