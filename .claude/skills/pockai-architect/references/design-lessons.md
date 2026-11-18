# Lecciones de diseño: del generador al objetivo

En `examples/` hay tres pares de hojas. `<id>-generador.png` es lo que dibujó el generador procedural para los míticos; `<id>-objetivo.*` es el mismo sprite sheet rehecho por una IA de imagen a partir de él, y es **el nivel que el usuario quiere**. Antes de diseñar una especie legendaria o mítica, abre un par con Read y compáralo: lo que sigue es lo que cambia de una hoja a la otra.

Las hojas objetivo son una referencia de diseño, no assets: tienen frames borrosos, el diseño baila de una celda a otra, no llevan máscara y no admiten paleta ni patrón. Lo que se aprende de ellas se dibuja con el generador.

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

## Lo que el generador aún no hace
Estas cuatro cosas separan hoy al generador del objetivo y no se arreglan con reglas de diseño. Están apuntadas en `docs/PENDIENTES.md` §8c:

1. **Tercer color de paleta.** La hoja solo distingue primario y secundario; el `accent` de la mascota no llega a los sprites. Hace falta un papel de color nuevo.
2. **Rampas con giro de tono y cinco tonos.** El color sale de multiplicar un gris por la paleta, así que la sombra es el mismo color más oscuro.
3. **Tramas de relleno.** No hay un relleno de «escamas», «corteza» u «hojas»: cada trama se pinta pieza a pieza.
4. **Plano lejano.** No hay una forma de mandar una pieza «al fondo» que la oscurezca y la apague de una vez.

Mientras no existan, acércate con `mark`, capas de tono y colores literales, y dile al usuario qué parte del objetivo no se puede alcanzar todavía.
