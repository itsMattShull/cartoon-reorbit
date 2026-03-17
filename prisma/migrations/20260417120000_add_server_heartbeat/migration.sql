-- CreateTable
CREATE TABLE "ServerHeartbeat" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastBeat" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerHeartbeat_pkey" PRIMARY KEY ("id")
);
