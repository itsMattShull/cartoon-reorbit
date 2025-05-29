-- CreateTable
CREATE TABLE "GamePointLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePointLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GamePointLog" ADD CONSTRAINT "GamePointLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
