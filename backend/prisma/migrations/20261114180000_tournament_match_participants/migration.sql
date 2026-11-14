-- F-05 — Los matches guardan las dos mascotas (petId) que se enfrentan.
-- Antes solo habia seed1/seed2 (semillas de combate) y la resolucion las usaba como indices
-- de entrada (entries[seed] era undefined), por lo que el bracket nunca avanzaba ni pagaba premios.
ALTER TABLE "TournamentMatch" ADD COLUMN "petAId" TEXT;
ALTER TABLE "TournamentMatch" ADD COLUMN "petBId" TEXT;