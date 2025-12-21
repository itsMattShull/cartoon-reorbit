/*
  Warnings:

  - A unique constraint covering the columns `[ctoonId,mintNumber]` on the table `UserCtoon` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserCtoon_ctoonId_mintNumber_key" ON "UserCtoon"("ctoonId", "mintNumber");
