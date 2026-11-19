-- IA interna: conexión del equipo a un endpoint compatible con la API de OpenAI, configurable desde
-- el panel de administración. La usa la IA del sistema (p. ej. para tejer las historias de la
-- aventura diaria). Fila única, con la clave cifrada.

-- CreateTable
CREATE TABLE "InternalAiConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedKey" TEXT,
    "keyIv" TEXT,
    "keyTag" TEXT,
    "jsonMode" BOOLEAN NOT NULL DEFAULT true,
    "allowPrivateNetwork" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalAiConnection_pkey" PRIMARY KEY ("id")
);
