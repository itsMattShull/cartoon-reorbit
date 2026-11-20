-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOWED_USER_ONLINE';

-- AlterTable
ALTER TABLE "MyOrbitRoom" ADD COLUMN     "showLeaderboard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MyOrbitFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyOrbitFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MyOrbitFollow_followedId_idx" ON "MyOrbitFollow"("followedId");

-- CreateIndex
CREATE UNIQUE INDEX "MyOrbitFollow_followerId_followedId_key" ON "MyOrbitFollow"("followerId", "followedId");

-- AddForeignKey
ALTER TABLE "MyOrbitFollow" ADD CONSTRAINT "MyOrbitFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitFollow" ADD CONSTRAINT "MyOrbitFollow_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
