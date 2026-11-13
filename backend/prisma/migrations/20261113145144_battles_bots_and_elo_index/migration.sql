-- DropForeignKey
ALTER TABLE "Battle" DROP CONSTRAINT "Battle_defenderPetId_fkey";

-- DropIndex
DROP INDEX "Battle_attackerPetId_idx";

-- DropIndex
DROP INDEX "Battle_defenderPetId_idx";

-- AlterTable
ALTER TABLE "Battle" ALTER COLUMN "defenderPetId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Battle_attackerPetId_createdAt_idx" ON "Battle"("attackerPetId", "createdAt");

-- CreateIndex
CREATE INDEX "Battle_defenderPetId_createdAt_idx" ON "Battle"("defenderPetId", "createdAt");

-- CreateIndex
CREATE INDEX "Pet_elo_idx" ON "Pet"("elo");

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_defenderPetId_fkey" FOREIGN KEY ("defenderPetId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
