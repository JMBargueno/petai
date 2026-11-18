-- La rareza es de la especie; el patrón tiene la suya.

-- 1) El patrón deja de tener una "rareza mínima del ejemplar" y pasa a tener rareza propia.
ALTER TABLE "Pattern" RENAME COLUMN "minRarity" TO "rarity";

-- 2) Los ejemplares cuya rareza no era la de su especie (por ejemplo, un Ignisaurio marcado como
--    legendario) pasan a llevar la de su especie. Solo cambia la etiqueta: sus estadísticas de
--    combate ("combatStats"), que se calcularon con el multiplicador antiguo, se respetan.
UPDATE "Pet" AS p
SET "rarity" = s."rarity"
FROM "Species" AS s
WHERE p."speciesId" = s."id" AND p."rarity" <> s."rarity";
