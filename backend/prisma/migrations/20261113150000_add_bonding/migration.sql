-- AlterTable
ALTER TABLE "Pet" ADD COLUMN "bonding" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "bondingTier" TEXT NOT NULL DEFAULT 'acquainted',
ADD COLUMN "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "BondingEvent" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BondingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BondingEvent_petId_createdAt_idx" ON "BondingEvent"("petId", "createdAt");

-- AddForeignKey
ALTER TABLE "BondingEvent" ADD CONSTRAINT "BondingEvent_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
