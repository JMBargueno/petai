-- Refresh tokens: el hash pasa a ser único (búsqueda por índice en logout/refresh en vez de recorrer la tabla).
-- Antes de que los tokens llevaran `jti`, dos inicios de sesión en el mismo segundo producían el mismo
-- token y, por tanto, filas con el mismo hash: se deduplican antes de crear el índice.

-- 1) Si alguna de las filas duplicadas estaba revocada, la que se conserva también lo queda
UPDATE "RefreshToken" AS keep
SET "revokedAt" = dup."firstRevokedAt"
FROM (
  SELECT "hash", MIN("id") AS "keepId", MIN("revokedAt") AS "firstRevokedAt"
  FROM "RefreshToken"
  GROUP BY "hash"
  HAVING COUNT(*) > 1 AND MIN("revokedAt") IS NOT NULL
) AS dup
WHERE keep."id" = dup."keepId" AND keep."revokedAt" IS NULL;

-- 2) Se conserva una fila por hash (la de menor id)
DELETE FROM "RefreshToken" AS extra
USING "RefreshToken" AS keep
WHERE extra."hash" = keep."hash" AND extra."id" > keep."id";

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_hash_key" ON "RefreshToken"("hash");

-- Historial de chat y memoria: se leen siempre por mascota y ordenados por fecha
-- DropIndex
DROP INDEX "ChatMessage_petId_idx";

-- DropIndex
DROP INDEX "PetMemory_petId_idx";

-- CreateIndex
CREATE INDEX "ChatMessage_petId_createdAt_idx" ON "ChatMessage"("petId", "createdAt");

-- CreateIndex
CREATE INDEX "PetMemory_petId_createdAt_idx" ON "PetMemory"("petId", "createdAt");
