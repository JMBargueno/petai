-- Spec 38: prendas equipadas por ranura ({ head, face, neck, back } -> itemId). Vacío = sin prendas.
ALTER TABLE "Pet" ADD COLUMN "accessories" JSONB NOT NULL DEFAULT '{}';
