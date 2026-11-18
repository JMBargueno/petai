-- Spec 37 §6.1: etapa de la relación (stranger | acquaintance | friend | best_friend) en las filas de
-- memoria emocional. Nulo en el resto y en las relaciones anteriores, que parten de «desconocido».
ALTER TABLE "PetMemory" ADD COLUMN "stage" TEXT;
