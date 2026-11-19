-- Buffs temporales de combate (spec 15, Cocina): uno por mascota, stat y fuente.

-- CreateTable
CREATE TABLE "CombatBuff" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "stat" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombatBuff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CombatBuff_petId_stat_source_key" ON "CombatBuff"("petId", "stat", "source");

-- CreateIndex
CREATE INDEX "CombatBuff_petId_expiresAt_idx" ON "CombatBuff"("petId", "expiresAt");

-- AddForeignKey
ALTER TABLE "CombatBuff" ADD CONSTRAINT "CombatBuff_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
