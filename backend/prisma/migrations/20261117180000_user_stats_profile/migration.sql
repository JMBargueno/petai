-- Perfil social + sistema de logros centralizado.

-- Las insignias pasan a ser públicas por defecto (el usuario puede ocultarlas). Hasta ahora era opt-in:
-- se activa para quien nunca lo tocó. Quien lo activó alguna vez tiene el logro `social_opener` (se
-- concede al activar la visibilidad); si ahora está en false es que lo desactivó a propósito y se respeta.
ALTER TABLE "User" ALTER COLUMN "achievementsPublic" SET DEFAULT true;
UPDATE "User" SET "achievementsPublic" = true
WHERE "achievementsPublic" = false
  AND "id" NOT IN (SELECT "userId" FROM "Achievement" WHERE "achId" = 'social_opener');

-- Vitrina de insignias destacadas.
ALTER TABLE "User" ADD COLUMN "featuredBadges" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "UserStat" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStat_pkey" PRIMARY KEY ("userId","key")
);

-- AddForeignKey
ALTER TABLE "UserStat" ADD CONSTRAINT "UserStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cuidados a partir del progreso ya acumulado en los logros de contador (cota inferior).
INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT "userId", 'feeds', MAX("current"), CURRENT_TIMESTAMP FROM "Achievement"
WHERE "achId" LIKE 'care_feed_%' OR "achId" = 'care_dedicated' GROUP BY "userId";

INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT "userId", 'cleans', MAX("current"), CURRENT_TIMESTAMP FROM "Achievement"
WHERE "achId" = 'care_routine' OR "achId" LIKE 'care_clean_%' GROUP BY "userId";

INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT "userId", 'sleeps', MAX("current"), CURRENT_TIMESTAMP FROM "Achievement"
WHERE "achId" LIKE 'care_sleep_%' GROUP BY "userId";

-- Backfill: colección a partir de las mascotas existentes.
INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT "userId", 'eggs_hatched', COUNT(*), CURRENT_TIMESTAMP FROM "Pet" GROUP BY "userId";

INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT "userId", 'hatched_' || "rarity", COUNT(*), CURRENT_TIMESTAMP FROM "Pet" GROUP BY "userId", "rarity";

INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT "userId", 'hatched_shiny', COUNT(*), CURRENT_TIMESTAMP FROM "Pet" WHERE "shiny" = true GROUP BY "userId";

INSERT INTO "UserStat" ("userId", "key", "value", "updatedAt")
SELECT p."userId", 'hatched_el_' || s."element", COUNT(*), CURRENT_TIMESTAMP
FROM "Pet" p JOIN "Species" s ON s."id" = p."speciesId"
GROUP BY p."userId", s."element";
