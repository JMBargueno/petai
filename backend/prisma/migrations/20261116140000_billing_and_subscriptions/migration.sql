-- AlterTable User
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateTable Subscription
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'pro',
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "graceUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable BillingEvent
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable BillingConfig
CREATE TABLE "BillingConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "stripePriceIds" JSONB,
    "createdById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingConfig_pkey" PRIMARY KEY ("id")
);

-- Indexes for Subscription
CREATE UNIQUE INDEX "Subscription_source_externalId_key" ON "Subscription"("source", "externalId");
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- Indexes for BillingEvent
CREATE UNIQUE INDEX "BillingEvent_source_eventId_key" ON "BillingEvent"("source", "eventId");

-- Indexes for BillingConfig
CREATE UNIQUE INDEX "BillingConfig_version_key" ON "BillingConfig"("version");
CREATE INDEX "BillingConfig_active_idx" ON "BillingConfig"("active");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
