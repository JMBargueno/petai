-- El premio del logro collection_hatch_50 tenía un id con tilde ("ach_item_collection_crèche"), que no
-- cumple el formato de id de objeto (^[a-z][a-z0-9_]*$) y no podía convertirse en prenda (spec 38).
-- Se renombra a ASCII conservando el inventario de quien ya lo ganó. Sin filas, no hace nada.
INSERT INTO "Item" ("id", "kind", "name", "description", "effects", "priceCoins", "priceGems")
SELECT 'ach_item_collection_creche', "kind", "name", "description", "effects", "priceCoins", "priceGems"
FROM "Item" WHERE "id" = 'ach_item_collection_crèche'
ON CONFLICT ("id") DO NOTHING;

UPDATE "InventoryItem" SET "itemId" = 'ach_item_collection_creche' WHERE "itemId" = 'ach_item_collection_crèche';

DELETE FROM "Item" WHERE "id" = 'ach_item_collection_crèche';
