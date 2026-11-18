# Precio, efectos y vías de obtención

Las bandas salen de lo que ya hay en `foods.json`. Son orientativas: `check_items.mjs` avisa cuando un objeto se sale, y el precio final lo ajusta el panel de admin.

Para comparar, **beneficio** es la suma de los efectos positivos (`hunger + happiness + energy + health`).

## Bandas

| Banda | Ejemplo | Precio | Efectos | Beneficio | Notas |
|---|---|---|---|---|---|
| Básica | Manzana Crujiente | 10 mon. | hambre 25, felicidad 5, salud 2 | ~30 | La barata de siempre. Sacia y poco más. Con una basta |
| De Flujo | Baya Ígnea y las otras cinco | 25 mon. | 20 / 15 / 5 / 5 | 45 | Las seis iguales: ningún Flujo come mejor que otro. Su gracia es el 50 % extra para los suyos |
| Saludable | Ensalada Silvestre | 30 mon. | hambre 18, felicidad 5, energía 5, salud 15 | ~45 | Cambia hambre y alegría por salud |
| Capricho | Pastel de Fresas | 40 mon. | hambre 30, felicidad 35, energía 10, salud −5 | 75 | Mucho de una cosa, con contrapartida |
| Remedio | Elixir Reparador | 80 mon. + 1 gema | salud 40, felicidad −10, cura | — | Cura siempre; los demás efectos se aplican como en la comida |
| Evolución | Piedra de Evolución | 20 gemas | — | — | Única |

## Reglas
- **Comida:** entre 10 y 60 monedas, nunca gemas. Tiene que poder comprarse jugando.
- **Techo de eficiencia:** como mucho 3,5 puntos de beneficio por moneda (el de la Manzana). Cuanto más cara, menos eficiente: la de 25 da 1,8 y la de 40, 1,9.
- **Ningún efecto suelto pasa de ±40.** Una comida no llena de golpe una barra de 100.
- **A partir de 60 de beneficio, contrapartida:** un efecto negativo de al menos 5 puntos en otra estadística.
- **Una segunda favorita de un Flujo** no puede ser estrictamente mejor que la primera: mismo beneficio (45) repartido de otra forma, o más cara. Si no, la primera deja de comprarse.
- **Con la favorita, cuenta el ×1,5:** una comida de Flujo con hambre 30 da 45 a los suyos. Calcula el caso bueno antes de fijar el número.
- **Medicina:** entre 60 y 150 monedas. Un remedio menor (salud 15–25) cabe por debajo del Elixir, pero recuerda que cualquier medicina quita la enfermedad: si es barata, abarata curar. Dilo en la propuesta.
- **Todo objeto de tienda lleva precio.** Uno con los dos precios a 0 no se puede comprar (el servidor lo rechaza), pero la tienda lo lista igual: déjalo a 0 solo si de verdad sale únicamente de cofres o regalos.

## Tiers de cofre

Los cofres (`balance.json` → `chests`) reparten por tier: `common`, `uncommon`, `rare`, `epic`, `legendary`. El tier es la rareza práctica del objeto.

| Tier | Qué va | Hoy |
|---|---|---|
| `common` | Básica y de Flujo, de 1 a 4 unidades | Manzana, Baya Ígnea, Coral Glaseado |
| `uncommon` | De Flujo y capricho, de 1 a 3 | Semilla Solar, Pastel |
| `rare` | Saludable y remedios, 1 o 2 | Ensalada, Elixir (en oro) |
| `epic` | Remedios y evolución | Elixir, Piedra (en oro y más) |
| `legendary` | Evolución | Piedra |

- Un objeto entra en los cofres donde tenga sentido por precio: lo barato en bronce y plata, lo caro de oro hacia arriba. El cofre mítico no tiene `common`.
- El mismo objeto puede tener tiers distintos en cofres distintos (la Piedra es `legendary` en bronce y `epic` en diamante).
- Al añadir una línea a una `dropTable` no hay que tocar `tierWeights`: el peso se reparte entre los objetos del tier. Por eso, meter un objeto en un tier **baja la probabilidad de los demás** de ese tier. Dilo si el tier tenía un solo objeto (la Piedra en `legendary`).
- `qtyMax` de comida barata, hasta 4 o 5; de remedios y evolución, 1 o 2.

## Otras vías
- **Hallazgos** (`personality.autonomy.itemFind.items`): lo que la mascota encuentra sola, como mucho 2 al día. Solo comida básica o de Flujo, barata. Nunca remedios ni evolución.
- **Minijuegos** (`minigames.games.<id>.itemDrop`): un objeto por juego, con puntuación mínima y probabilidad. Que tenga que ver con el juego: la Forja Térmica da Baya Ígnea.
- **Tienda:** todo lo que tenga precio aparece, ordenado por tipo y precio.

## Huecos conocidos
`check_items.mjs` los lista al día. Los de partida:
- Caramelo de Chispa, Mora de Medianoche y Miel de Alba no salen en ningún cofre ni se encuentran explorando; Baya, Coral y Semilla sí.
- Cada Flujo tiene una sola favorita, compartida por todas sus especies, también las legendarias y míticas.
- Hay una sola medicina, y toda medicina quita la enfermedad.
