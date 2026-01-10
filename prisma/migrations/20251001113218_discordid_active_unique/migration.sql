/*
  Warnings:

  - A unique constraint covering the columns `[discordId,active]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_active_key" ON "User"("discordId", "active");
