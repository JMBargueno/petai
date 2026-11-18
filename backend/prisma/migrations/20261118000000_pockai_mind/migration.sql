-- Spec 36: personalidad de 5 dimensiones, memoria en 3 capas y vida autónoma.
-- Las dimensiones de personalidad viven en "Pet"."personality" (JSON ya existente, clave "dims"):
-- no necesitan columna. Las mascotas existentes se completan de forma perezosa al leerlas.

-- Vida autónoma: índice del último intervalo simulado (null = aún no se ha simulado nada).
ALTER TABLE "Pet" ADD COLUMN "autonomyCursor" INTEGER;

-- Memoria en capas: episodic | semantic | emotional, con importancia, valencia y sujeto.
ALTER TABLE "PetMemory" ADD COLUMN "layer" TEXT NOT NULL DEFAULT 'semantic';
ALTER TABLE "PetMemory" ADD COLUMN "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "PetMemory" ADD COLUMN "valence" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PetMemory" ADD COLUMN "subject" TEXT;
ALTER TABLE "PetMemory" ADD COLUMN "lastRecalledAt" TIMESTAMP(3);
ALTER TABLE "PetMemory" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Recuerdos existentes: los resúmenes son episodios; hechos y hábitos son conocimiento (semantic).
UPDATE "PetMemory" SET "layer" = 'episodic', "importance" = 0.4 WHERE "kind" = 'summary';
UPDATE "PetMemory" SET "layer" = 'semantic', "importance" = 0.6 WHERE "kind" = 'fact';
UPDATE "PetMemory" SET "layer" = 'semantic', "importance" = 0.5 WHERE "kind" = 'habit';
UPDATE "PetMemory" SET "layer" = 'episodic', "importance" = 0.6 WHERE "kind" = 'adventure';

CREATE INDEX "PetMemory_petId_layer_idx" ON "PetMemory"("petId", "layer");
