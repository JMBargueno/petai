# Rareza, desbloqueo y precios

Las prendas son cosméticas, así que aquí no hay equilibrio de combate: hay **economía y reparto**.
Los precios son orientativos y provisionales (la spec 38 deja pendiente fijarlos en `balance.json`).
Parten de lo que ya hay en el catálogo y de referencias del juego: un mueble cuesta entre 150 y
400 monedas, un logro de bronce da 50 monedas y uno épico, 25 gemas.

## Rareza frente a vía

| Rareza | Vía habitual | Precio orientativo |
|---|---|---|
| `normal` | Monedas | 150–350 monedas |
| `rare` | Monedas o gemas | 400–800 monedas, o 8–15 gemas |
| `super_rare` | Gemas o logro | 20–40 gemas |
| `legendary` | Logro (épico o legendario) o gemas | 60–120 gemas |
| `mythic` | Solo logro legendario o evento | No se vende |

- Una prenda `normal` nunca cuesta gemas: tiene que poder comprarse jugando.
- Una prenda de logro tiene la rareza del logro o una por debajo: logro `epic` → `super_rare`, logro `legendary` → `legendary`.
- El precio final lo ajusta el panel de admin; en el JSON pon el de salida.

## Reparto del catálogo

Objetivos al añadir prendas, para que la tienda no quede coja:

- Las cuatro ranuras con un número parecido de prendas. Si una tiene el doble que otra, la siguiente va a la que menos tiene.
- Al menos la mitad del catálogo comprable con monedas.
- Como mucho una de cada cinco prendas es `legendary` o `mythic`.
- Dentro de una ranura, no repitas rampa hasta haber usado al menos cuatro distintas.
- Cada categoría de logro (cuidado, combate, IA, colección, social) con alguna prenda propia.

## Premios de logro pendientes

`achievements.json` tiene premios `ach_item_*` que hoy se entregan como un cosmético genérico sin
arte. Convertir uno en prenda es añadir a `accessories.json` una entrada con ese mismo `id` y
`unlock: { "type": "achievement", "achievementId": "<id del logro>" }`. El script
`check_accessories.mjs` lista los que quedan.

No todos tienen por qué ser prendas: una medalla o un trofeo no se llevan puestos. Convierte los
que tengan sentido como gorro, gafas, bufanda o capa y deja el resto.
