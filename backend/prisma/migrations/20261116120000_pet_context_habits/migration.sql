-- Memoria contextual sincronizada: hábitos de escritorio derivados de un perfil de tamaño fijo.

-- Clave estable de los hábitos (habit:coding_time…). NULL en hechos y resúmenes; Postgres
-- permite varios NULL en un índice único, así que solo los hábitos quedan únicos por mascota.
ALTER TABLE "PetMemory" ADD COLUMN "key" TEXT;
CREATE UNIQUE INDEX "PetMemory_petId_key_key" ON "PetMemory"("petId", "key");

-- Perfil de hábitos: una fila por mascota con cubetas fijas (≈1-2 KB), nunca crece.
CREATE TABLE "PetContextProfile" (
    "petId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "lastDigestAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetContextProfile_pkey" PRIMARY KEY ("petId")
);

ALTER TABLE "PetContextProfile" ADD CONSTRAINT "PetContextProfile_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
