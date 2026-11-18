# Pase de concepto con una IA de imagen

Para legendarios y míticos, el usuario sube el nivel de un diseño pasando la hoja de contactos del generador por una IA de imagen. El resultado es una **referencia de diseño**: enseña qué piezas, materiales y proporciones le faltan a la especie. No es un asset, porque el juego necesita `base.png` y `mask.png` exactos, 31 animaciones por etapa y arte que admita paleta y patrón.

## Cuándo proponerlo
- La especie es legendaria o mítica.
- La hoja de contactos pasa la checklist pero «se queda corta», o el usuario lo dice.
- El usuario pide ideas para una etapa final.

Tú no generas la imagen: preparas el prompt, el usuario lo ejecuta en su herramienta con la hoja de contactos adjunta y te devuelve el resultado.

## Prompt
Dos partes: la plantilla base, que fija la cuadrícula y el estilo, y el párrafo de la especie.

**Plantilla base** (igual para todas):

> Rediseño profesional en pixel art de 16 bits con bordes duros (sin suavizado ni anti-aliasing) de esta sprite sheet de 4 filas por 10 columnas. Mantén exactamente la misma posición, pose, expresión facial y partículas (destellos, Z de sueño, confeti, esfera roja) de cada celda sobre un fondo sólido uniforme, aplicando sombreado con cambio de tono (hue-shifting) y contornos oscuros limpios.

**Párrafo de la especie** (uno por especie):

> [Plantilla base] <Verbo> la criatura <tipo> en cuatro etapas cohesivas con <color base>, sombras <tono frío> y luces <tono claro>: 1) <cría: forma redondeada y un rasgo>. 2) <juvenil: forma y dos estrenos>. 3) <adulto: forma y tres estrenos>. 4) <final: adjetivo que impone, un material nuevo y tres o cuatro estrenos>.

Cómo rellenarlo:
- **Colores:** el primario y el secundario de `defaultPalette`, con nombre («azul cobalto», «amarillo dorado»). Di hacia dónde giran la sombra y la luz.
- **Una frase por etapa**, sacada de la tabla de evolución de la ficha: forma del cuerpo y estrenos. No describas poses: las da la hoja.
- **Etapa final:** un adjetivo («imponente», «majestuoso») y un material nuevo («caparazón oscuro texturizado», «doble par de cuernos oscuros»).
- **No pidas** otro encuadre, fondo, texto ni más celdas: la plantilla base fija las 4 filas por 10 columnas.

Ejemplos que funcionaron (dieron las hojas de `examples/`):

> [Plantilla base] Evoluciona la criatura marina en cuatro etapas cohesivas con tonos azul cobalto, sombras índigo y luces cian brillante: 1) Cría acuática redondeada con cola corta. 2) Forma juvenil alargada con cuello erguido y aletas laterales definidas. 3) Serpiente marina esbelta con placas ventrales marcadas, cuernos incipientes y bigotes cortos. 4) Dragón leviatán imponente con un caparazón oscuro texturizado en el lomo, aletas dorsales afiladas, cuernos largos y bigotes fluidos.

> [Plantilla base] Transforma la criatura vegetal con corteza de madera detallada y follaje frondoso en tonos verde esmeralda y lima: 1) Semilla/brote redondeado con dos hojas superiores. 2) Retoño bípedo con tronco pequeño y copa de hojas esponjosa. 3) Árbol joven robusto con raíces firmes, brazos de rama y follaje denso con hojas en la boca. 4) Árbol anciano majestuoso con raíces gruesas entrelazadas, copa amplia con volumen y pequeños frutos dorados colgando de sus ramas.

> [Plantilla base] Rediseña el dragón elemental combinando escamas amarillo dorado con sombreado ámbar, marcas de rayo blancas y alas/cuernos en degradado azul eléctrico y cian: 1) Cría pequeña y rechoncha con aletas diminutas. 2) Dragón juvenil bípedo con cuello alargado y alas triangulares. 3) Dragón esbelto con vientre segmentado, garras definidas y alas membranosas abiertas. 4) Dragón adulto imponente con musculatura marcada, doble par de cuernos oscuros y azulados, garras afiladas y alas desplegadas de gran envergadura.

## Qué hacer con el resultado
1. Guárdalo en `sprite-previews/` (o, si va a servir de ejemplo, en `examples/`) y ábrelo con Read.
2. Compáralo con tu hoja etapa por etapa y apunta **qué estrena cada etapa** que la tuya no tiene: piezas, materiales, puntas, cambios de cara, planos de profundidad. Usa las diez lecciones de `design-lessons.md` como guion.
3. Descarta lo que no encaja: detalles de menos de 2 px, cambios de diseño entre celdas, frames borrosos y cualquier cosa que cambie el plan corporal o la paleta acordados.
4. Pasa esos estrenos a la tabla de evolución de la ficha y redibuja con el generador.
5. Dile al usuario qué has incorporado y qué no se puede alcanzar todavía («Lo que el generador aún no hace»).
