-- Spec 39: variante de reglas de la partida (standard | easy), necesaria para repetirla en el servidor.
ALTER TABLE "MinigameSession" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'standard';
