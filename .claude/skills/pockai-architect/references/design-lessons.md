# Lecciones de diseño: del generador al objetivo

En `examples/` hay ocho pares de hojas. `<id>-generador.png` es lo que dibujó el generador procedural; `<id>-objetivo.*` es el mismo sprite sheet rehecho por una IA de imagen a partir de él, y es **el nivel que el usuario quiere**. `examples/prompts.md` guarda el prompt que dio cada hoja objetivo.

| Par | Rareza | Qué enseña sobre todo |
|---|---|---|
| `livolt` | rara | Rayas que crecen por etapa, collar de pelusa, alas con dibujo y una etapa final más oscura y rica |
| `inktopus` | rara | Cuerpo blando: tentáculos gruesos, curvos y ondulados, nunca rectos |
| `solarejo` | rara | Proporción de conejo de verdad, rayas en un tercer color y cristales flotando en la etapa final |
| `fenixel` | legendaria | Plumas con degradado de la base a la punta y abanico de cola más grande que el cuerpo |
| `kirisol` | legendaria | Anatomía de caballo (patas con articulación, hocico, crin en mechones) y una extremidad nueva en la etapa final: las alas |
| `leviatin` | mítica | Cara que madura, terminaciones afiladas y un material nuevo: el caparazón |
| `yggdrito` | mítica | Trama por material: racimos de hojas, veta, raíces entrelazadas |
| `primpulso` | mítica | Articulaciones, planos de profundidad y un tercer color en la etapa final |

Antes de diseñar una especie, abre con Read el par de su rareza que más se le parezca y compáralo: lo que sigue es lo que cambia de una hoja a la otra. **Vale para todas las rarezas**: las tres raras mejoran tanto como los míticos. La rareza decide cuántas piezas y materiales lleva la especie, no cuánto cuidado se pone en dibujarla.

Estas lecciones valen para escribir la descripción de cada etapa en el prompt (`target-sheet-pipeline.md`) y para el boceto procedural.

Las hojas objetivo son una referencia de diseño, no assets: tienen frames borrosos, el diseño baila de una celda a otra, no llevan máscara y no admiten paleta ni patrón. Lo que se aprende de ellas se dibuja con el generador.

## 0. Proporción de animal, no de muñeco
- **Objetivo:** el conejo tiene ancas y pecho; el potro, patas con articulación y hocico; la abeja, abdomen. Cada especie se reconoce por la proporción del animal de verdad, simplificada.
- **Generador:** casi todo era la misma cabeza redonda sobre el mismo torso, con las orejas o las alas cambiadas.
- **Regla:** antes de dibujar, apunta tres rasgos de proporción del animal real (dónde tiene el peso, qué largo tiene el cuello, cómo son las patas) y cúmplelos de juvenile en adelante. La cría puede ser una bola.

## 1. La forma dice la edad: redondo de cría, afilado de adulto
- **Objetivo:** la cría es una bola con ojos grandes. Cada etapa cambia curvas por puntas: aletas en rombo, cuernos, garras, púas. La etapa final casi no tiene una terminación redonda.
- **Generador:** las terminaciones seguían siendo lóbulos redondos hasta la etapa final (velos, cola, crines), y por eso todo parecía de peluche.
- **Regla:** en baby, todo redondo. En juvenile, la primera punta. En adult, las terminaciones (aletas, orejas, cola) ya acaban en punta. En final, además, cuernos y garras. Usa `spike`, `feather`, `fan` y `bolt` para terminar piezas; deja `plumes` y las elipses para crías.

## 2. La cara madura
- **Objetivo:** la cría tiene ojos redondos y enormes. En la etapa final el ojo es pequeño, rasgado y con ceja, y la cabeza tiene mandíbula, hocico y arco sobre el ojo. La expresión pasa de tierna a serena o fiera.
- **Generador:** misma cara en las cuatro etapas, con sonrisa de cría en un leviatán adulto.
- **Regla:** la cara cambia con la edad dentro de una misma familia. Baby: ojo grande por defecto. Final: ojo más pequeño (menos `w` y `h`) y un estilo más duro (`fierce`, `almond`, `slit`, `spark`), con `brow`. Lo que se mantiene es dónde están los ojos y su color, no su tamaño. La cabeza de una etapa final es una forma diseñada (hocico, mandíbula en otro tono, cresta sobre la frente), no una bola.

## 3. Cada etapa estrena algo, y la final estrena un material
- **Objetivo:** cada etapa añade dos o tres piezas con nombre. La final añade además un material que no existía antes: un caparazón oscuro con textura, un segundo par de cuernos azul noche, frutos dorados.
- **Generador:** la etapa final era la adulta con las piezas más largas.
- **Regla:** escribe la evolución como una lista de estrenos, con este formato (es el del prompt que produjo las hojas objetivo):
  > 1) Cría redondeada con cola corta. 2) Juvenil alargado con cuello erguido y aletas laterales. 3) Serpiente esbelta con placas ventrales, cuernos incipientes y bigotes cortos. 4) Leviatán con caparazón oscuro texturizado, aletas dorsales afiladas, cuernos largos y bigotes fluidos.

  Una frase por etapa: forma del cuerpo y de dos a cuatro estrenos. En la final, uno de ellos es un material nuevo, en `mark` (primario oscurecido) o en color literal.

## 4. Un tercer color, guardado para el final
- **Objetivo:** las tres primeras etapas van a dos colores. La final introduce un oscuro que no había (cuernos azul noche del dragón, caparazón del leviatán) y con eso parece otra categoría de criatura.
- **Generador:** dos colores en las cuatro etapas. El `accent` de la paleta no se usa en los sprites.
- **Regla:** reserva `mark` y los colores literales para adult y final. Una etapa final necesita una pieza oscura grande que contraste con el resto.

## 5. Planos de profundidad
- **Objetivo:** el ala, la pata y el cuerno de detrás van en un tono más oscuro y apagado (el ala lejana del dragón es ocre, no cian). Se lee qué está delante.
- **Generador:** las dos alas del mismo color, pegadas.
- **Regla:** lo que queda detrás va con `tone: 'shade'` y, si es una pieza de color (ala, aleta), en el otro papel: lejana en `skin` u oscurecida, cercana en `trait`.

## 6. Anatomía con articulaciones
- **Objetivo:** la pata del dragón tiene muslo, caña, pie y tres garras; el brazo, codo y mano; el ala, brazo, dedos y membrana. Las raíces del árbol se cruzan unas sobre otras.
- **Generador:** un muslo en elipse sobre un pie en elipse.
- **Regla:** de adult en adelante, cada extremidad tiene al menos dos tramos y un remate (garra, casco, hoja). Dibuja los tramos con `tube` y el remate con `spike`.

## 7. Textura por material
- **Objetivo:** cada material tiene su trama: placas en el vientre, veta y nudos en la madera, racimos de hojas con borde propio en la copa, radios en las aletas, músculo marcado en el dragón.
- **Generador:** superficies lisas con una luz y una sombra.
- **Regla:** cada material lleva su trama con capas de tono (`{ clip, keep, tone: 'shade' | 'light' }`): placas (`scutes`), vetas, racimos (`canopy`), radios de aleta. Sin trama solo se quedan las crías.

## 8. Luz con color
- **Objetivo:** cuatro o cinco tonos por material y con giro de tono: las sombras se van al frío (índigo, verde azulado, ámbar) y las luces al claro (cian, lima, amarillo). Además, un brillo especular a lo largo del lomo.
- **Generador:** tres tonos y un brillo, y la luz solo suma una parte del secundario.
- **Regla:** añade a mano el cuarto tono donde importa: una franja `light` a lo largo del lomo y un punto `hi` en el volumen principal. El giro de tono no se puede dibujar hoy (ver «Lo que el generador aún no hace»).

## 9. Base ancha y encuadre lleno
- **Objetivo:** la etapa final ocupa la celda entera: raíces tan anchas como la copa, alas hasta el borde, anillos que llenan el suelo.
- **Generador:** ya se acerca (53 px de alto), pero con huecos a los lados.
- **Regla:** en la etapa final, más de 50 px de ancho y cerca de 54 de alto, con la base (raíces, anillos, cola) tan ancha como lo de arriba.

## 10. Contraste entre la cría y la forma final
- **Objetivo:** la cría es tan simple que cuesta creer en qué acaba. Ese salto es lo que hace que la etapa final impresione.
- **Regla:** no «mejores» la cría para que se parezca a la final. Cuanto más rara la especie, mayor la distancia entre las dos.

## 11. Lo blando se curva, lo duro se quiebra
- **Objetivo:** los tentáculos del Inktopus son gruesos, se ondulan y acaban enroscados. El prompt lo pide en negativo: «sin patas articuladas ni aspecto de insecto o araña».
- **Generador:** tentáculos en elipses rectas que salían en abanico, y por eso parecía una araña.
- **Regla:** decide de qué está hecha cada pieza. Lo blando (tentáculos, colas, crines, velos, raíces) va con `tube` y al menos tres puntos de control que dibujen una S. Lo duro (cuernos, garras, púas, patas de insecto) va con rectas y ángulos. Nunca una elipse recta para algo blando.

## 12. Las marcas crecen con la edad
- **Objetivo:** el Livolt pasa de liso a rayas en el lomo y a rayas de tigre por todo el cuerpo; el Solarejo, de liso a vientre de color, rayas y emblema en el vientre; el Kirisol gana motas. Las marcas son el reloj de la especie.
- **Generador:** dos o tres manchas pequeñas en adult y unas franjas en final, casi invisibles.
- **Regla:** baby liso; juvenile con una zona de color (vientre, pecho); adult con un patrón que se vea de lejos (rayas, motas, anillos); final con ese patrón por todo el cuerpo y un emblema. Las rayas ocupan al menos una cuarta parte de la superficie donde van.

## 13. Degradado dentro de la pieza
- **Objetivo:** las plumas del Fénixel van de naranja en la base a amarillo en la punta; las alas del Primpulso, de azul a cian.
- **Generador:** cada pluma de un solo color.
- **Regla:** en las piezas largas del rasgo icónico (plumas, aletas, mechones), pinta la punta o la base en otro tono con una capa (`{ clip, keep, tone: 'light' }` hacia la punta, `'shade'` hacia la base).

## 14. La etapa final cambia de registro
- **Objetivo:** la etapa final del Livolt y del Leviatín es más oscura y saturada que las anteriores, además de más grande. Se nota que es otra cosa antes de mirar los detalles.
- **Generador:** las cuatro etapas con el mismo valor.
- **Regla:** en la etapa final, sube la proporción de `mark` y de sombra: franjas anchas, lomo oscuro, extremidades en oscuro (`boots`). Que al entornar los ojos se vea más oscura que la adulta.

## 15. Aura: piezas sueltas en la etapa final
- **Objetivo:** el Solarejo final tiene cristales flotando alrededor de la cabeza y los hombros; el Yggdrito adulto, hojas cayendo.
- **Generador:** todo pegado al cuerpo.
- **Regla:** la etapa final de una especie rara o superior puede llevar de cuatro a seis piezas sueltas (cristales, chispas, hojas, gotas) alrededor de la cabeza. Van en `behind`, dentro de `appendage` para que laten, y a no más de 6 px del cuerpo.

## 16. Un material entre la cabeza y el cuerpo
- **Objetivo:** el Livolt y el Solarejo llevan un collar de pelusa que separa la cabeza del cuerpo y rompe la silueta con un borde en zigzag.
- **Regla:** donde se juntan dos volúmenes, pon un material de transición (pelusa, plumón, melena, collar) con borde dentado, no una línea limpia.

## 17. Una extremidad nueva en la etapa final
- **Objetivo:** el Kirisol final tiene alas; el Primpulso, un segundo par de cuernos; el Inktopus, tres crestas.
- **Regla:** además del material nuevo, la etapa final de un legendario o un mítico puede estrenar una extremidad que cambie qué animal parece (un potro pasa a alicornio). Decídelo con el usuario al diseñar: cambia el concepto.

## Con qué pieza del generador se hace cada lección
El generador (v2) tiene una pieza para cada cosa que antes solo se podía imitar:

| Lección | Pieza | Cómo se usa |
|---|---|---|
| 4. Tercer color | Papel `accent` | `g.ellipse(pieza, 'accent', …)`, `spike(g, pieza, 'accent', …)`, `tube(g, pieza, 'accent', …)`. Se pinta con el `accent` de la paleta de la mascota. Resérvalo para adult y final |
| 5. Planos de profundidad | `g.dim(pieza, …)` | Tras dibujar el ala, la pata o la aleta de detrás, oscurece sus piezas un paso. Llámalo dos veces para alejarla más |
| 7. Trama por material | `g.texture(pieza, TEX.…, papel?)` | `TEX.scales(tamaño)`, `TEX.bark(periodo)`, `TEX.leaves(tamaño)`, `TEX.fur(periodo)` y `TEX.stripes(periodo, ancho, grados)`. Va después de pintar la pieza y dentro de su mismo bloque, para que la trama se mueva con ella. El tercer argumento la limita a un papel (solo el cuerpo, no el vientre) |
| 8. Luz con color | Automático | El horneado gira las sombras hacia el violeta y las satura, y el sombreado tiene un quinto tono (`deep`). No hay que hacer nada; `tone: 'deep'` existe para forzarlo |
| 12. Marcas que crecen | `TEX.stripes` | Rayas atigradas sobre una pieza entera, sin dibujar franja a franja |
| 13. Degradado en la pieza | Capas de tono | `{ clip, keep, tone: 'light' }` hacia la punta y `'shade'` o `'deep'` hacia la base |
| 7 y 16. Mechones, plumas, pliegues | `g.ink(pieza, puntos)` | Trazo interior de 1 px en el oscuro de la pieza: separa mechones o plumas sin partirla en piezas |

Una trama es un patrón de 1 px sobre el tono que ya tiene la pieza: no se ve sobre piezas en `flat` muy pequeñas ni por debajo de 3 px de tamaño. Mira siempre el resultado ampliado.

## Lo que el generador aún no hace
- **Contorno interior automático.** `g.ink` traza las líneas que tú le des; no separa racimos o plumas por su cuenta.
- **Tramas que siguen una curva.** Las tramas van en una rejilla recta: las escamas no giran con el cuello de una serpiente.
- **Giro de tono distinto por material.** Todas las sombras tiran al mismo violeta; las hojas objetivo llevan las de la madera al rojizo y las de la hoja al azulado.

Dile al usuario qué parte del objetivo no se puede alcanzar todavía.
