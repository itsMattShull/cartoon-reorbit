-- CreateTable
CREATE TABLE "CZone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "background" TEXT,
    "layoutData" JSONB NOT NULL DEFAULT '[]',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "lastEdited" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ctoon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT,
    "type" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "codeOnly" BOOLEAN NOT NULL DEFAULT false,
    "inCmart" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ctoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCtoon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isTradeable" BOOLEAN NOT NULL DEFAULT true,
    "inCzone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPoints" (
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPoints_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "discordId" TEXT NOT NULL,
    "discordTag" TEXT,
    "discordAvatar" TEXT,
    "avatar" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCtoon_userId_ctoonId_key" ON "UserCtoon"("userId", "ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Friend_userId_friendId_key" ON "Friend"("userId", "friendId");

-- AddForeignKey
ALTER TABLE "CZone" ADD CONSTRAINT "CZone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCtoon" ADD CONSTRAINT "UserCtoon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCtoon" ADD CONSTRAINT "UserCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPoints" ADD CONSTRAINT "UserPoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
