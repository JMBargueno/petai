-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "leaderId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanMembership" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitatVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitatVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clan_tag_key" ON "Clan"("tag");

-- CreateIndex
CREATE INDEX "Clan_leaderId_idx" ON "Clan"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "ClanMembership_userId_key" ON "ClanMembership"("userId");

-- CreateIndex
CREATE INDEX "ClanMembership_clanId_idx" ON "ClanMembership"("clanId");

-- CreateIndex
CREATE INDEX "HabitatVisit_ownerId_status_idx" ON "HabitatVisit"("ownerId", "status");

-- CreateIndex
CREATE INDEX "HabitatVisit_visitorId_status_idx" ON "HabitatVisit"("visitorId", "status");

-- AddForeignKey
ALTER TABLE "ClanMembership" ADD CONSTRAINT "ClanMembership_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
