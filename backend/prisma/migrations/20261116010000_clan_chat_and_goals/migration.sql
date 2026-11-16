-- CreateTable
CREATE TABLE "ClanMessage" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanGoal" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL DEFAULT 'generic',
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ClanGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClanMessage_clanId_createdAt_idx" ON "ClanMessage"("clanId", "createdAt");

-- CreateIndex
CREATE INDEX "ClanGoal_clanId_status_idx" ON "ClanGoal"("clanId", "status");

-- AddForeignKey
ALTER TABLE "ClanMessage" ADD CONSTRAINT "ClanMessage_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanGoal" ADD CONSTRAINT "ClanGoal_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
