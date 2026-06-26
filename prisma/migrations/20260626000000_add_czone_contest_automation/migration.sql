-- CreateTable
CREATE TABLE "CZoneContestAutomationConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startDayOfWeek" INTEGER NOT NULL DEFAULT 6,
    "startHour" INTEGER NOT NULL DEFAULT 8,
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "submissionEndDayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "submissionEndHour" INTEGER NOT NULL DEFAULT 20,
    "submissionEndMinute" INTEGER NOT NULL DEFAULT 0,
    "votingEndDayOfWeek" INTEGER NOT NULL DEFAULT 3,
    "votingEndHour" INTEGER NOT NULL DEFAULT 8,
    "votingEndMinute" INTEGER NOT NULL DEFAULT 0,
    "winnerPoints" INTEGER NOT NULL DEFAULT 1000,
    "participantPoints" INTEGER NOT NULL DEFAULT 250,
    "titleTemplate" TEXT NOT NULL DEFAULT 'Weekly cZone Contest {startDate}',
    "maxVotesPerUser" INTEGER NOT NULL DEFAULT 5,
    "lastCreatedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CZoneContestAutomationConfig_pkey" PRIMARY KEY ("id")
);
