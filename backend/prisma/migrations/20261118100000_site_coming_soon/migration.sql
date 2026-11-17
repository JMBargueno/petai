-- Landing "Coming soon" de la web pública (ajustes editables desde el panel admin).
ALTER TABLE "AppSettings" ADD COLUMN "comingSoonEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "comingSoonCountdownEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "comingSoonLaunchAt" TIMESTAMP(3);
