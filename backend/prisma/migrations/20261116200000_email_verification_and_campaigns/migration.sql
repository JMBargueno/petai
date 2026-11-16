-- Verificación de correo + envíos desde el panel de administración.

-- Verificación de correo: código (app) y token de enlace (web), ambos como sha256.
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "linkTokenHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_linkTokenHash_key" ON "EmailVerificationToken"("linkTokenHash");
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Baja de los correos informativos del panel (enlace "darme de baja" / List-Unsubscribe).
ALTER TABLE "User" ADD COLUMN "emailOptOutAt" TIMESTAMP(3);

-- Envíos de correo del panel (campañas).
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "html" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailCampaign_status_check" CHECK ("status" IN ('queued', 'sending', 'sent', 'failed'))
);

CREATE INDEX "EmailCampaign_createdAt_idx" ON "EmailCampaign"("createdAt");
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las cuentas existentes se dan por verificadas: la verificación solo se exige a las nuevas
-- (nadie que ya juega se queda fuera de la app). Solo datos: no afecta al esquema.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
