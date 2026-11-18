# Arte por hoja objetivo: generar, importar y validar

Es el flujo para el arte final de una especie. El generador procedural (`scripts/sprites/pixel/species.ts`) no alcanza la calidad que pide el usuario dibujando con formas, así que su dibujo pasa a ser un **boceto de disposición**: fija cuántas poses hay, dónde van y hacia dónde miran. El arte lo dibuja una IA de imagen (Nano Banana, por la API de Gemini) y el repo lo **importa** píxel a píxel al formato del juego.

Hechas con este flujo: Leviatín, Livolt, Inktopus, Solarejo, Fénixel, Kirisol, Yggdrito y Primpulso (`scripts/sprites/pixel/imported/`).

```
boceto (generador) ─┐
                    ├─► Nano Banana ─► hoja de 10 poses ─► import ─► roles ─► generador ─► base.png + mask.png
diseño (referencia) ─┘                    (una por etapa)   64×64    papel y tono   31 animaciones
```

## Requisitos
- **Clave de la API de Gemini** en la variable de entorno `GEMINI_API_KEY` o en `.env.local` (ignorado por git), en una línea `GEMINI_API_KEY=…`. **La pone el usuario.** No la escribas tú en ningún archivo ni comando, aunque te la pegue en el chat: pídele que cree el archivo y, si la ha pegado, recomiéndale revocarla.
- Cada imagen se cobra y las hojas salen hacia un servicio de Google: confirma con el usuario antes de la primera llamada de una sesión y dile cuántas imágenes llevas.
- `node scripts/sprites/concept/generate.mjs --list` enseña los modelos de imagen disponibles con la clave. El modelo por defecto es `gemini-nano-banana-2.1`; los nombres cambian, así que compruébalos.

## Las dos imágenes de referencia
El modelo recibe **dos imágenes** con papeles distintos. Con una sola no funciona: si solo ve el boceto, lo calca.

1. **Disposición:** la hoja base de una etapa, con sus 10 poses en 2 filas de 5. La hace `base-sheet.mjs` a partir de la hoja de contactos del generador.
2. **Diseño:** la criatura con su diseño definitivo en esa etapa. Sale de la fila correspondiente de la hoja objetivo de la especie (`references/examples/<id>-objetivo.*`).

Si la especie **no tiene hoja objetivo**, hay que conseguir antes ese diseño: genera con el formato largo de `concept-prompt.md` una hoja de las cuatro etapas, enséñasela al usuario y, cuando la apruebe, guárdala en `examples/` como `<id>-objetivo`. No sigas sin su visto bueno: es la decisión de diseño de la especie.

## Paso a paso (una etapa cada vez)

```bash
# 0. Hoja de contactos del boceto (las 10 poses clave por etapa)
npx tsx scripts/sprites/pixel/contact.ts <id>

# 1. Generar una etapa (0 baby, 1 juvenile, 2 adult, 3 final)
node scripts/sprites/concept/stage.mjs <id> <etapa> <hoja-objetivo> "<descripción de la criatura en esa etapa>"
#    → sprite-previews/nano/<id>-<etapa>.jpg

# 2. Importar a 64 px: <colores> y la altura nativa de la pose de reposo
node scripts/sprites/concept/import.mjs <id>-<etapa> sprite-previews/nano/<id>-<etapa>.jpg <colores> h=<alto>
#    → sprite-previews/nano/<id>-<etapa>-64.png (vista) y .json (datos)

# 3. Con las cuatro etapas importadas: papeles de color y datos del generador
node scripts/sprites/concept/roles.mjs <id>          # → scripts/sprites/pixel/imported/<id>.json
node scripts/sprites/concept/set-palette.mjs <id>    # paleta por defecto en species.json

# 4. Hoja de contactos real, sprites y validación
npx tsx scripts/sprites/pixel/contact.ts <id>
pnpm generate:sprites && pnpm validate:all
```

**Mira cada imagen antes de seguir** (Read del `.jpg` reducido o de la vista `-64.png`). Empieza por la etapa final, enséñasela al usuario y sigue con las demás cuando la apruebe.

Valores que han funcionado:

| Etapa | Alto de reposo (`h=`) | Colores |
|---|---|---|
| baby | 24 | 10 |
| juvenile | 34 | 10 |
| adult | 45 | 12 |
| final | 53 | 14 |

El alto es el de la pose de reposo; las poses de salto pueden pasarse y el generador las recoloca. No superes los máximos de `pixel-style.md` (28, 36, 46 y 54).

## El prompt
La plantilla está en `scripts/sprites/concept/plantilla.txt` y `stage.mjs` le mete la descripción de la criatura. Lo que la hace funcionar:

- **Dos imágenes con su papel dicho en el texto:** de la 1, solo la disposición («NO copies su dibujo: es un boceto tosco»); de la 2, el diseño.
- **Tamaño:** cada criatura grande, ocupando casi toda su celda. Sin esto las etapas pequeñas salen con pocos píxeles y se importan con ruido.
- **Estilo «low-poly»:** muy baja resolución, píxeles grandes, formas simples y angulosas, tres tonos planos por material, unos 12 colores, sin texturas ni detalle fino. Es el estilo que ha pedido el usuario.
- **Expresiones descritas una a una:** no «mantén la expresión de la celda», sino las 10 poses con su cara y su cuerpo (reposo, reposo mirando, andar, comer, alegría, dormir, ataque, tristeza, celebración, golpe). Es lo que hace que se lean.
- **Partículas separadas:** manzana, Z, confeti y estrella de impacto no deben tocar a la criatura.
- **Mismo diseño en las 10 celdas.**

En la descripción de la criatura:

- Nombra el animal y su edad, sus piezas y lo que **no** tiene («sin patas ni brazos», «sin caparazón»).
- En **baby y juvenile** añade proporciones de cría: cabeza enorme, cara que ocupa casi toda la cabeza, ojos de un cuarto del ancho de la cara con brillo blanco, boca grande.
- En **adult**, cabeza grande para el cuerpo y ojos expresivos.
- En **final**, las piezas y el material que estrena.

## Qué mirar en cada hoja
- [ ] Hay 10 criaturas, en 2 filas de 5, sin recortar.
- [ ] El diseño es el de la referencia y es el mismo en las 10.
- [ ] Cada expresión corresponde a su pose (la cría es la etapa que más se equivoca).
- [ ] Las partículas no tocan a la criatura.
- [ ] No hay sombras de suelo, texto ni marcos.
- [ ] La silueta no cambia de animal entre poses (una cría que se pone erguida «como un fantasma» al saltar).

Si falla, **regenera solo esa etapa**: dos llamadas iguales dan resultados distintos. Si falla siempre lo mismo, cambia el prompt, no insistas.

## Qué hace el importador
`import.mjs` localiza las 10 criaturas por su mancha conexa (no por una rejilla fija, así que da igual que el modelo las desplace), las reduce todas con la misma escala apoyándolas en el suelo, las pasa a una paleta corta común y las limpia:

- quita las partículas sueltas y, solo si el amarillo y el naranja son raros en la especie, las manchas grandes de ese color pegadas a la criatura (estrellas de impacto). En una especie dorada, crema o de fuego no se quitan, porque ese color es su cuerpo: si ves **zonas blancas o huecas** dentro de una criatura, es este filtro comiéndosela;
- quita píxeles sueltos de la silueta y rellena agujeros de 1 px;
- funde con su entorno los píxeles aislados que se parecen al color de al lado. Los que contrastan (brillos, ojos) se respetan.

Si una etapa sale **con ruido**, casi siempre es que la criatura era pequeña en la imagen: regenera pidiéndola más grande, o baja los colores.

## Qué hace `roles.mjs`
Clasifica cada color en primario, secundario, acento, línea o color literal, y le da el tono del generador que deja su luminancia más cerca. Así la especie sigue admitiendo **paleta y patrón por mascota**.

- Agrupa los colores en tres familias por parecido real (k-medias en Lab), no por tono dominante: vale igual para una especie azul, una crema con crin naranja o una dorada con alas cian. La familia con más píxeles es el primario; la segunda, el secundario; la tercera, el acento.
- El color más oscuro de cada etapa es siempre el contorno.
- Los colores escasos que no se parecen a ninguna familia (boca, comida, chispas) y los brillos blancos pequeños son literales.
- Si el papel elegido dejaría un color irreconocible (más de 30 de distancia en Lab), ese color se guarda literal. Pasa con las llamas: en una especie roja de vientre crema caían en la familia crema y salían pardas. Un literal no cambia con la paleta de la mascota, así que el reparto imprime su porcentaje: por encima del 15–20 % conviene revisar la hoja.

Imprime el reparto. Es normal que la línea ronde el 25–35 % (el contorno pesa mucho en un sprite pequeño). Desconfía si una familia se queda en 0 o si la paleta propuesta no se parece a la hoja: **mira siempre la hoja de contactos real**, porque un reparto mal hecho cambia los colores de toda la especie.

Propone la paleta por defecto de la especie para que el horneado reproduzca la hoja; `set-palette.mjs` la pone en `species.json`. Actualiza también el bloque JSON de la ficha.

## Anclas de accesorio
La silueta no dice dónde está la cabeza: lo más alto puede ser una llama, una flor, la copa de un árbol o el chorro de una ballena. Por eso las anclas del arte importado se anotan a mano en `scripts/sprites/pixel/imported/anchors.json`, una línea por etapa:

```json
"adult": { "size": "S", "head": [45, 38], "face": [46, 43], "neck": [40, 48], "back": [28, 42] }
```

- Coordenadas nativas (0–63) sobre la **pose de reposo**. `head`: donde se posa el gorro (centro de lo alto de la cabeza). `face`: entre los ojos. `neck`: donde cruza la bufanda. `back`: de donde cuelga la capa.
- `size`: talla de las prendas en esa etapa. Por defecto la del boceto (S, M, L, L); bájala si la cabeza es pequeña (hasta 14 px de ancho, S; hasta 20, M). Un cuadrúpedo de cabeza pequeña con un gorro L queda tapado.
- En una especie de tres cabezas, las anclas van en la central.
- Para verlas, hace falta una rejilla de coordenadas: amplía el reposo de cada etapa ×8 con líneas cada 4 píxeles y lee las posiciones.

**En las otras nueve poses** las anclas se calculan solas (`poseAnchorsOf` en `species.ts`): se busca el recorte de la cara del reposo cerca de donde caería si la silueta entera se hubiera movido, y gorro, gafas y bufanda se desplazan lo mismo. Si no aparece y la criatura se ha tumbado, el gorro se posa en lo más alto de la silueta. No es infalible: **revisa las diez poses de las cuatro etapas con un conjunto puesto** (capa, bufanda, gafas y gorro) antes de dar una especie por buena, y corrige el ancla del reposo si una pose se va.

## Cómo se anima
Los ojos cerrados sueltos (un parpadeo) no cambian de pose: solo la pose con «zzz» es la de dormir. Si un parpadeo usara la pose de dormir, la criatura se tumbaría un frame en mitad del reposo.

Una especie con `imported/<id>.json` se dibuja con sus píxeles (`drawImported` en `species.ts`). Cada frame de las 31 animaciones usa la pose clave que le toca (reposo, andar, comer, alegre, dormir, atacar, triste, celebrar, golpe) y la desplaza en **píxeles enteros**. No hay deformación ni frames intermedios, y la cara va dibujada en la pose.

El `PixelSpecies` de formas sigue haciendo falta: da el boceto de disposición y la posición de los efectos.

## Especies sin hoja objetivo: la hoja de diseño
Si la especie no tiene una hoja objetivo hecha a mano, el diseño se aprueba antes de gastar las cuatro imágenes de arte final:

1. **Hoja de diseño** (1 imagen): las cuatro etapas en reposo, en fila, sobre fondo claro. Referencias: el boceto con las cuatro etapas y una imagen con Pockais ya aprobados, que fija el **estilo** (contorno, tamaño de píxel, sombreado plano, caras). El prompt pide copiar el estilo y no las criaturas, describe cada etapa y prohíbe parecerse a personajes existentes.
2. **Aprobación del usuario.** Es el momento de cambiar la forma: en esta tanda el Ignisaurio pasó de lagarto bípedo con llama en la cola (demasiado parecido a un personaje conocido) a dinosaurio cuadrúpedo de gorguera.
3. `node scripts/sprites/concept/split-design.mjs <id> <hoja>` la parte en una referencia por etapa (`sprite-previews/nano/<id>-<etapa>-diseno.png`).
4. `stage.mjs <id> <etapa> - "<descripción>"`: con `-` en lugar de la hoja objetivo usa esas referencias.

Las hojas aprobadas quedan en `examples/<id>-diseno.jpg`. Si el arte final cambia el plan corporal, el boceto de formas deja de coincidir: pasa a `import.mjs` la altura de reposo que quieres para cada etapa y apunta que el boceto está por rehacer.

Una imagen puede salir mal compuesta (tres filas, criaturas cortadas): se ve en la hoja de contactos como una pose recortada. Se repite solo esa etapa.

## Tandas
Para varias especies seguidas, un script que recorra especies y etapas llamando a `stage.mjs`, `import.mjs` y, al acabar cada especie, a `roles.mjs` y `set-palette.mjs`, y que escriba un registro. Son unos 35 segundos por imagen: lánzalo en segundo plano. Si la API responde 429 por el tope de gasto mensual, para: no lo rodees; lo sube el usuario y la tanda se relanza reutilizando los `.jpg` que ya existen. Reimportar y reclasificar no gasta imágenes: si falla el importador o el reparto de color, corrige el script y repite solo esos pasos sobre los `.jpg` que ya tienes.

## Límites conocidos
- **Piezas sueltas:** lo que no toca a la criatura se descarta como partícula. Un aura de esquirlas o de hojas flotantes no se puede importar; no la pidas en el prompt.
- **Animación pobre:** 10 poses por etapa. Si una animación necesita una pose que no está, hay que pedir una hoja más.
- **Accesorios:** las anclas del reposo se anotan a mano (véase «Anclas de accesorio»); en el resto de poses se siguen solas y pueden fallar. Revisa siempre las diez poses con un conjunto puesto.
- **Color:** al pasar por la paleta, los tonos salen algo más saturados que en la hoja.
- **No es determinista:** no se puede regenerar una hoja idéntica. Lo que queda versionado es el resultado importado, no la imagen.
- **Las imágenes del modelo no se versionan:** son intermedias y viven en `sprite-previews/nano/`.
