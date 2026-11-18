-- Pockai activo elegido por el jugador (el que pasea por su escritorio). Sin FK: si la mascota
-- desaparece o deja de ser suya, el servidor cae a la más antigua (ver pets/active-pet.ts).
ALTER TABLE "User" ADD COLUMN "activePetId" TEXT;
