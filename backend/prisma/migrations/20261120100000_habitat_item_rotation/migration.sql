-- Fase 4 del hábitat isométrico: giro de muebles y huellas de varias celdas.
-- La validación de colisiones pasa al servicio (HabitatService), que conoce la huella de cada mueble.
ALTER TABLE "HabitatItem" ADD COLUMN "rotation" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "HabitatItem_petId_x_y_roomId_key";
