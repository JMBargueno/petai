# Spec 41 — Objetos ocultos y objetos de solo drop

## 1. Qué se pide
Dos categorías nuevas de consumibles, además de los que se venden en la tienda:
- **Solo drop**: no se compran; caen en cofres y al terminar actividades.
- **Ocultos**: solo los da el admin.

El admin puede dar **cualquier** consumible desde el panel. Ejemplos: el **Enhebrador** (solo drop, +1 nivel) y el **Néctar del Origen** (oculto, lo restaura todo).

## 2. Modelo
- `foods.json` → `availability: "shop" | "drop" | "hidden"` (por defecto `shop`). Lo que no es `shop` va a precio 0.
- `Item.availability` (columna, migración `20261127100000_item_availability`). El seed la sincroniza también al actualizar; los precios siguen sin pisarse.
- Kind nuevo `level_up` con `effects.levels` (entero ≥ 1).
- Validación (`validate-game-data.js` y `validateItemAvailability` en `game-data.schemas.ts`): un objeto `hidden` no puede estar en ninguna fuente de drop; los ids de `activityDrops` existen; `drop` sin fuente da aviso.

## 3. Tienda
- `GET /shop` solo lista `availability = shop`; `POST /shop/buy` rechaza el resto con 400.
- El escritorio filtra `catalog.foods` igual. Android usa `/shop`.

## 4. Usar objetos
- `POST /pets/:id/use-item { itemId }`: según el `kind` llama a `feed`, `heal`, `evolve` o `useLevelUpItem`.
- `useLevelUpItem`: da exactamente la XP de cada nivel que sube (`xpForLevel`), así que conserva la XP que llevaba dentro del nivel y pasa por los puntos de combate, el cambio de etapa y `pet:level_up` de siempre. En el nivel 100 se rechaza sin gastar el objeto.

## 5. Drops de actividades
`balance.activityDrops`:
- `sources.<actividad>`: lista de `{ itemId, chance }`. Actividades: `minigame` (partida con premio), `training` (mazmorra completada), `adventure` (historia terminada), `battleWin` (combate ganado), `explore` (cuando la exploración autónoma encuentra algo).
- `dailyCaps.<itemId>`: tope diario (UTC) por usuario, guardado en `DailyItemDrop`. Los cofres no cuentan.

`ActivityDropsService.roll` tira con `crypto.randomInt`, como mucho un objeto por tirada, nunca uno oculto, y un fallo no tumba la actividad. Las respuestas traen `bonusItem` y el escritorio lo anuncia («¡Ha caído Enhebrador! Está en tu Mochila»).

Enhebrador: minijuego 2 %, entrenamiento 3 %, aventura 5 %, combate ganado 3 %, exploración 10 % de los hallazgos; tope 1/día. Cofres: oro y diamante `epic`, mítico `legendary`.

## 6. Admin
- `rewards.items: [{ id, qty }]` (≤ 10 líneas, ≤ 99 unidades) en regalos y vouchers, validado contra `foods.json` con cualquier disponibilidad.
- `GET /admin/vouchers/items` da el catálogo con su disponibilidad; el formulario los agrupa en Tienda, Solo drop y Ocultos.
- El panel de precios enseña la columna Disponibilidad.

## 7. Escritorio
- Mascota › **Mochila**: el inventario agrupado por tipo con «Usar»; el Enhebrador y la evolución piden confirmación.
- «Alimentar» en Inicio solo muestra comida.

## 8. Pendiente
- Ejecutar la migración y el seed en cada entorno.
- Android e iOS no tienen Mochila: siguen viendo solo la comida.
