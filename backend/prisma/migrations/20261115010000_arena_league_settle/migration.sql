-- AlterTable
ALTER TABLE "User" ADD COLUMN "title" TEXT;

-- CreateTable
CREATE TABLE "SeasonLeagueSettlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "title" TEXT,
    "gemsAwarded" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "bestElo" INTEGER NOT NULL DEFAULT 1000,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonLeagueSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonLeagueSettlement_userId_seasonId_key" ON "SeasonLeagueSettlement"("userId", "seasonId");

-- AddForeignKey
ALTER TABLE "SeasonLeagueSettlement" ADD CONSTRAINT "SeasonLeagueSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonLeagueSettlement" ADD CONSTRAINT "SeasonLeagueSettlement_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
