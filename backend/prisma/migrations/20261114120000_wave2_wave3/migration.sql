-- AlterTable
ALTER TABLE "AiConfig" ADD COLUMN     "fallbackProviders" JSONB,
ADD COLUMN     "routingOverrides" JSONB;

-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "cacheHits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT;

-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "absenceDiary" JSONB,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastWelcomeBackAt" TIMESTAMP(3),
ADD COLUMN     "recoveryBuffUntil" TIMESTAMP(3),
ADD COLUMN     "welcomeBackTier" TEXT;

-- CreateTable
CREATE TABLE "Habitat" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "habitatSeed" INTEGER NOT NULL,
    "rooms" TEXT[] DEFAULT ARRAY['sala']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Habitat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitatItem" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "habitatId" TEXT NOT NULL,
    "furnitureId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitatItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "currentTier" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonReward" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardValue" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SeasonReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Breeding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parent1Id" TEXT NOT NULL,
    "parent2Id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "seed" INTEGER NOT NULL,

    CONSTRAINT "Breeding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingResult" (
    "id" TEXT NOT NULL,
    "breedingId" TEXT NOT NULL,
    "offspringId" TEXT NOT NULL,
    "inheritedGenes" JSONB NOT NULL,
    "mutations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreedingResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Raid" (
    "id" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 50,
    "hpGlobal" INTEGER NOT NULL,
    "hpRemaining" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Raid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaidParticipant" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "damageDealt" INTEGER NOT NULL DEFAULT 0,
    "totalAttacks" INTEGER NOT NULL DEFAULT 0,
    "lastAttackAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaidParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'entry',
    "entryFee" INTEGER NOT NULL DEFAULT 50,
    "totalPrizePool" INTEGER NOT NULL DEFAULT 3000,
    "entryDeadline" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "elo" INTEGER NOT NULL,
    "placement" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "bestOf" INTEGER NOT NULL DEFAULT 2,
    "seed1" INTEGER NOT NULL,
    "seed2" INTEGER NOT NULL,
    "winnerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "log" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "ingredients" JSONB NOT NULL,
    "hotPotPositions" JSONB NOT NULL,
    "score" INTEGER,
    "buffApplied" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "floors" JSONB NOT NULL,
    "currentFloor" INTEGER NOT NULL DEFAULT 0,
    "hearts" INTEGER NOT NULL DEFAULT 3,
    "prediction" TEXT,
    "predictionCorrect" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "buffMultiplier" DOUBLE PRECISION,
    "buffExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adventure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "sceneCount" INTEGER NOT NULL DEFAULT 4,
    "currentScene" INTEGER NOT NULL DEFAULT 0,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "retriesLeft" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "outcome" TEXT,
    "score" DOUBLE PRECISION,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Adventure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdventureScene" (
    "id" TEXT NOT NULL,
    "adventureId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "chosenOption" INTEGER,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdventureScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRouterConfig" (
    "id" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "primary" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fallbacks" JSONB NOT NULL,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "maxCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRouterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "mood" TEXT NOT NULL DEFAULT 'happy',
    "language" TEXT NOT NULL DEFAULT 'es',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sttLatencyMs" INTEGER,
    "llmTokens" INTEGER,
    "ttsTotalMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'online',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopFriendship" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopFriendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpectatorSession" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastRoundSeen" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SpectatorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replayData" JSONB NOT NULL,
    "totalRounds" INTEGER NOT NULL,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "hasComeback" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mod" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "element" TEXT,
    "rarity" TEXT,
    "data" JSONB NOT NULL,
    "spriteUrl" TEXT,
    "minigameUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModRating" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "rating" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModReport" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModDownload" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusCode" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "fingerprint" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2eKeyPair" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "E2eKeyPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuddyPair" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petAId" TEXT NOT NULL,
    "petBId" TEXT NOT NULL,
    "separated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuddyPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuddyInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petAId" TEXT NOT NULL,
    "petBId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 4,
    "effects" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuddyInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ritual" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ritual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RitualProgress" (
    "id" TEXT NOT NULL,
    "ritualId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "totalCompletions" INTEGER NOT NULL DEFAULT 0,
    "missCount" INTEGER NOT NULL DEFAULT 0,
    "lastCompletedAt" TIMESTAMP(3),
    "lastAdaptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RitualProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodMoment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "act" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "mood" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 5,
    "captured" BOOLEAN NOT NULL DEFAULT false,
    "stickerKey" TEXT,
    "capturedAt" TIMESTAMP(3),
    "sharedToFeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessibilityPrefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "highContrast" BOOLEAN NOT NULL DEFAULT false,
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "captions" BOOLEAN NOT NULL DEFAULT true,
    "simpleMode" BOOLEAN NOT NULL DEFAULT false,
    "reduceHaptics" BOOLEAN NOT NULL DEFAULT false,
    "fontSizeScale" INTEGER NOT NULL DEFAULT 100,
    "colorblindMode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessibilityPrefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "thankYouNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePackage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "medicineItemId" TEXT NOT NULL,
    "toyItemId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 50,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'active',
    "participants" JSONB NOT NULL DEFAULT '[]',
    "generatedItemId" TEXT,
    "rewardsDistributed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GroupSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Habitat_petId_key" ON "Habitat"("petId");

-- CreateIndex
CREATE INDEX "HabitatItem_petId_roomId_idx" ON "HabitatItem"("petId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitatItem_petId_x_y_roomId_key" ON "HabitatItem"("petId", "x", "y", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonPass_userId_seasonId_key" ON "SeasonPass"("userId", "seasonId");

-- CreateIndex
CREATE INDEX "SeasonProgress_userId_seasonId_idx" ON "SeasonProgress"("userId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonProgress_userId_seasonId_key" ON "SeasonProgress"("userId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonReward_seasonId_tier_rewardType_isPremium_key" ON "SeasonReward"("seasonId", "tier", "rewardType", "isPremium");

-- CreateIndex
CREATE INDEX "Breeding_userId_status_idx" ON "Breeding"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BreedingResult_breedingId_key" ON "BreedingResult"("breedingId");

-- CreateIndex
CREATE INDEX "Raid_status_endedAt_idx" ON "Raid"("status", "endedAt");

-- CreateIndex
CREATE INDEX "RaidParticipant_raidId_damageDealt_idx" ON "RaidParticipant"("raidId", "damageDealt");

-- CreateIndex
CREATE UNIQUE INDEX "RaidParticipant_raidId_userId_key" ON "RaidParticipant"("raidId", "userId");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");

-- CreateIndex
CREATE INDEX "TournamentEntry_tournamentId_elo_idx" ON "TournamentEntry"("tournamentId", "elo");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_userId_key" ON "TournamentEntry"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "TournamentMatch_tournamentId_status_idx" ON "TournamentMatch"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_round_slot_key" ON "TournamentMatch"("tournamentId", "round", "slot");

-- CreateIndex
CREATE INDEX "CookingSession_userId_finishedAt_idx" ON "CookingSession"("userId", "finishedAt");

-- CreateIndex
CREATE INDEX "TrainingSession_userId_status_idx" ON "TrainingSession"("userId", "status");

-- CreateIndex
CREATE INDEX "TrainingSession_petId_buffExpiresAt_idx" ON "TrainingSession"("petId", "buffExpiresAt");

-- CreateIndex
CREATE INDEX "Adventure_userId_status_idx" ON "Adventure"("userId", "status");

-- CreateIndex
CREATE INDEX "Adventure_userId_startedAt_idx" ON "Adventure"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdventureScene_adventureId_order_key" ON "AdventureScene"("adventureId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "AiRouterConfig_interactionType_key" ON "AiRouterConfig"("interactionType");

-- CreateIndex
CREATE INDEX "VoiceSession_userId_status_idx" ON "VoiceSession"("userId", "status");

-- CreateIndex
CREATE INDEX "DevicePresence_userId_status_idx" ON "DevicePresence"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePresence_userId_deviceId_key" ON "DevicePresence"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "CoopFriendship_ownerId_status_idx" ON "CoopFriendship"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoopFriendship_ownerId_visitorId_key" ON "CoopFriendship"("ownerId", "visitorId");

-- CreateIndex
CREATE INDEX "CoopVisit_visitorId_petId_createdAt_idx" ON "CoopVisit"("visitorId", "petId", "createdAt");

-- CreateIndex
CREATE INDEX "CoopVisit_petId_createdAt_idx" ON "CoopVisit"("petId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncVersion_userId_version_idx" ON "SyncVersion"("userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SyncVersion_userId_version_key" ON "SyncVersion"("userId", "version");

-- CreateIndex
CREATE INDEX "SyncAction_userId_status_idx" ON "SyncAction"("userId", "status");

-- CreateIndex
CREATE INDEX "SyncAction_userId_timestamp_idx" ON "SyncAction"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "SpectatorSession_battleId_isActive_idx" ON "SpectatorSession"("battleId", "isActive");

-- CreateIndex
CREATE INDEX "SpectatorSession_userId_joinedAt_idx" ON "SpectatorSession"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "Highlight_rating_createdAt_idx" ON "Highlight"("rating", "createdAt");

-- CreateIndex
CREATE INDEX "Highlight_expiresAt_idx" ON "Highlight"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Highlight_battleId_key" ON "Highlight"("battleId");

-- CreateIndex
CREATE INDEX "Mod_status_type_idx" ON "Mod"("status", "type");

-- CreateIndex
CREATE INDEX "Mod_element_rarity_idx" ON "Mod"("element", "rarity");

-- CreateIndex
CREATE INDEX "Mod_creatorId_idx" ON "Mod"("creatorId");

-- CreateIndex
CREATE INDEX "ModRating_modId_idx" ON "ModRating"("modId");

-- CreateIndex
CREATE UNIQUE INDEX "ModRating_modId_userId_key" ON "ModRating"("modId", "userId");

-- CreateIndex
CREATE INDEX "ModReport_modId_idx" ON "ModReport"("modId");

-- CreateIndex
CREATE UNIQUE INDEX "ModDownload_modId_userId_petId_key" ON "ModDownload"("modId", "userId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "Webhook_userId_active_idx" ON "Webhook"("userId", "active");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_fingerprint_idx" ON "AuditLog"("fingerprint");

-- CreateIndex
CREATE INDEX "E2eKeyPair_userId_revokedAt_idx" ON "E2eKeyPair"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "BuddyPair_userId_idx" ON "BuddyPair"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BuddyPair_userId_petAId_petBId_key" ON "BuddyPair"("userId", "petAId", "petBId");

-- CreateIndex
CREATE INDEX "BuddyInteraction_userId_createdAt_idx" ON "BuddyInteraction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BuddyInteraction_petAId_createdAt_idx" ON "BuddyInteraction"("petAId", "createdAt");

-- CreateIndex
CREATE INDEX "BuddyInteraction_petBId_createdAt_idx" ON "BuddyInteraction"("petBId", "createdAt");

-- CreateIndex
CREATE INDEX "Ritual_userId_status_idx" ON "Ritual"("userId", "status");

-- CreateIndex
CREATE INDEX "Ritual_petId_idx" ON "Ritual"("petId");

-- CreateIndex
CREATE INDEX "RitualProgress_userId_idx" ON "RitualProgress"("userId");

-- CreateIndex
CREATE INDEX "RitualProgress_petId_idx" ON "RitualProgress"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "RitualProgress_ritualId_key" ON "RitualProgress"("ritualId");

-- CreateIndex
CREATE INDEX "MoodMoment_userId_createdAt_idx" ON "MoodMoment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MoodMoment_petId_createdAt_idx" ON "MoodMoment"("petId", "createdAt");

-- CreateIndex
CREATE INDEX "MoodMoment_sharedToFeed_createdAt_idx" ON "MoodMoment"("sharedToFeed", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessibilityPrefs_userId_key" ON "AccessibilityPrefs"("userId");

-- CreateIndex
CREATE INDEX "AccessibilityPrefs_userId_idx" ON "AccessibilityPrefs"("userId");

-- CreateIndex
CREATE INDEX "Gift_senderId_sentAt_idx" ON "Gift"("senderId", "sentAt");

-- CreateIndex
CREATE INDEX "Gift_receiverId_sentAt_idx" ON "Gift"("receiverId", "sentAt");

-- CreateIndex
CREATE INDEX "CarePackage_receiverId_createdAt_idx" ON "CarePackage"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "CarePackage_senderId_createdAt_idx" ON "CarePackage"("senderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSession_code_key" ON "GroupSession"("code");

-- CreateIndex
CREATE INDEX "GroupSession_hostId_idx" ON "GroupSession"("hostId");

-- CreateIndex
CREATE INDEX "GroupSession_status_expiresAt_idx" ON "GroupSession"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Habitat" ADD CONSTRAINT "Habitat_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitatItem" ADD CONSTRAINT "HabitatItem_habitatId_fkey" FOREIGN KEY ("habitatId") REFERENCES "Habitat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPass" ADD CONSTRAINT "SeasonPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPass" ADD CONSTRAINT "SeasonPass_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonProgress" ADD CONSTRAINT "SeasonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonProgress" ADD CONSTRAINT "SeasonProgress_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonReward" ADD CONSTRAINT "SeasonReward_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breeding" ADD CONSTRAINT "Breeding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breeding" ADD CONSTRAINT "Breeding_parent1Id_fkey" FOREIGN KEY ("parent1Id") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breeding" ADD CONSTRAINT "Breeding_parent2Id_fkey" FOREIGN KEY ("parent2Id") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingResult" ADD CONSTRAINT "BreedingResult_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "Breeding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidParticipant" ADD CONSTRAINT "RaidParticipant_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidParticipant" ADD CONSTRAINT "RaidParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidParticipant" ADD CONSTRAINT "RaidParticipant_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSession" ADD CONSTRAINT "CookingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSession" ADD CONSTRAINT "CookingSession_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adventure" ADD CONSTRAINT "Adventure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adventure" ADD CONSTRAINT "Adventure_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdventureScene" ADD CONSTRAINT "AdventureScene_adventureId_fkey" FOREIGN KEY ("adventureId") REFERENCES "Adventure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModRating" ADD CONSTRAINT "ModRating_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModReport" ADD CONSTRAINT "ModReport_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModDownload" ADD CONSTRAINT "ModDownload_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

