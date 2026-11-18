-- Modo mantenimiento manual de la web y las apps (ajustes editables desde el panel admin).
ALTER TABLE "AppSettings" ADD COLUMN "maintenanceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "maintenanceScope" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "AppSettings" ADD COLUMN "maintenanceMessageEs" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "maintenanceMessageEn" TEXT;
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_maintenanceScope_check" CHECK ("maintenanceScope" IN ('web', 'apps', 'all'));
