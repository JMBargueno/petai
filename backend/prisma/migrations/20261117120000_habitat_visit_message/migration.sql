-- Visita en vivo: mensaje corto opcional del visitante + índice para cooldown / límite diario.
ALTER TABLE "HabitatVisit" ADD COLUMN "message" TEXT;

CREATE INDEX "HabitatVisit_visitorId_startedAt_idx" ON "HabitatVisit"("visitorId", "startedAt");
