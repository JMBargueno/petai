# Guía artística de Pockai

Referencia visual común para la **web**, la **app de escritorio** (Tauri + Svelte), **Android** (Compose) y la futura **iOS**.

- **La marca canónica es la de la web** (sistema v2). Las apps deben converger hacia ella. Lo que aún no lo hace está en [§12 · Deuda](#12--deuda-diferencias-actuales).
- **El código manda.** Cada valor lleva su fichero de origen. Si cambias un token, cambia el código y luego actualiza esta guía.
- El detalle técnico de cómo se generan los sprites está en [`ART_PIPELINE.md`](ART_PIPELINE.md). Las pantallas de cada app, en [`PANTALLAS.md`](PANTALLAS.md).

---

## 1 · Principios

1. **Pegatina y juguete.** Formas redondas y rellenos planos de colores vivos, con un contorno fino que los recorta. Nada de realismo ni de texturas recargadas.
2. **El contorno es la firma.** Las tarjetas, chips y pegatinas llevan 1 px de `--line`, y los sprites 3 px de `#1A1A1A`.
3. **Profundidad moderada.** Las sombras van tintadas de violeta y nunca son negro puro. Hay una sombra dura "de pegatina" para los momentos destacados.
4. **Un color, un significado.** Cada tema, elemento y rareza tiene un color fijo y lo mantiene en todas las plataformas (§3.5–3.7).
5. **Calma.** Como mucho un elemento en bucle por pantalla. Las entradas son fundidos cortos y siempre se respeta `prefers-reduced-motion`.
6. **Claro y oscuro de primera.** Todo se diseña con tokens semánticos que cambian con el esquema de color.

## 2 · Marca

| Elemento | Regla | Origen |
|---|---|---|
| Nombre | **Pockai**, siempre con mayúscula inicial y sin espacios. "PetAI" es solo el nombre interno del código (paquetes, `productName`, temas Android) y no se muestra al usuario. | `web/src/app/site.json` |
| Logotipo | Palabra "POCKAI" en la tipografía display, en mayúsculas, a 22 px en cabecera, precedida de la marca. | `web/src/styles/base.css` (`.logo`) |
| Marca (isotipo) | Cuadrado de 40 px con radio de 14 px, relleno `--grad-accent`, letra "P" blanca, girado −6°, con sombra `--shadow-1` y brillo interior. | `base.css` (`.logo__mark`) |
| Favicon | Círculo `#ffd731` (sunburst) con un huevo blanco con dos ojos, contorno negro de 3 px. | `web/public/favicon.svg` |
| Icono de app | El huevo de Pockai. **Objetivo:** el mismo dibujo que el favicon (huevo blanco sobre sunburst con contorno) en todas las plataformas. | — |
| Imágenes OG | 1200×630, fondo `--grad-hero`/`--grad-ether`, eyebrow y titular display. Se generan con script. | `web/scripts/generate-og.mjs` |

## 3 · Color

Tokens en [`web/src/styles/tokens.css`](../web/src/styles/tokens.css).

### 3.1 Paleta de marca

Es fija, igual en claro y en oscuro. Se usa para rellenos de pegatinas, tarjetas temáticas y acentos.

| Token | Hex | Uso |
|---|---|---|
| `--color-carbon` | `#0b0a14` | Texto y contorno principal, banda oscura |
| `--color-paper-white` | `#ffffff` | Superficie, relleno de iconos |
| `--color-sky-wash` | `#dceeff` | Fondo del hero en claro |
| `--color-concrete-gray` | `#d6d4e0` | Neutro de apoyo |
| `--color-soft-mist` | `#eeedf4` | Neutro claro de apoyo |
| `--color-electric-blue` | `#4da2ff` | Arena, agua, rareza "raro" |
| `--color-mint-pop` | `#55db9c` | Social, planta, rareza "normal" |
| `--color-lavender` | `#e9ccff` | IA, neutral, rareza "super-raro" |
| `--color-ember` | `#fb4903` | Énfasis "caliente", fuego, rareza "mítico" |
| `--color-sunburst` | `#ffd731` | Cuidado, rareza "legendario", favicon |
| `--color-voltage-violet` | `#5c4ade` | Acento de marca, lore |

### 3.2 Tokens semánticos (claro / oscuro)

Los componentes deben usar **estos** y no la paleta directamente.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#fbfaff` | `#0d0c19` | Fondo de página |
| `--surface` | `#ffffff` | `#17162a` | Tarjetas, paneles |
| `--surface-2` | `#f2f1f8` | `#201e37` | Superficie secundaria, hover |
| `--surface-glass` | blanco 72 % | `#17162a` 72 % | Cabecera y paneles de vidrio |
| `--ink` | `#0b0a14` | `#f4f2ff` | Texto principal |
| `--ink-muted` | `#4b4862` | `#b9b5d8` | Texto secundario |
| `--line` | `#0b0a14` | `#3d3a63` | Contornos de 1 px |
| `--line-soft` | negro 12 % | blanco 10 % | Separadores suaves |
| `--on-color` | `#0b0a14` | = | Texto sobre la paleta de marca |
| `--on-dark` | `#ffffff` | = | Texto sobre carbón o violeta |

### 3.3 Bandas (fondos de sección)

| Token | Claro | Oscuro |
|---|---|---|
| `--band-sky` | `#dceeff` | `#0f1d33` |
| `--band-white` | `#ffffff` | `#12111f` |
| `--band-gray` | `#ecebf3` | `#181729` |
| `--band-lavender` | `#f1e2ff` | `#1f1734` |
| `--band-ink` | `#0b0a14` | `#0b0a14` |

Regla de ritmo: **como mucho una banda oscura (`--band-ink`) por página**. El resto alterna bandas claras.

### 3.4 Acento

- `--accent` `#5c4ade` (violeta): rellenos, puntos del eyebrow, foco.
- `--accent-ink` `#4a39c9` en claro y `#b3a8ff` en oscuro: **texto** de acento y enlaces, con contraste AA.
- La acción principal usa el degradado `--grad-accent` (§3.8).

### 3.5 Color por tema

Cada tema usa siempre el mismo color en todas las plataformas.

| Tema | Token | Color |
|---|---|---|
| Arena / combate | `--theme-arena` | electric-blue `#4da2ff` |
| IA / conversación | `--theme-ai` | lavender `#e9ccff` |
| Cuidado | `--theme-care` | sunburst `#ffd731` |
| Social | `--theme-social` | mint-pop `#55db9c` |
| Lore / Mundo | `--theme-lore` | voltage-violet `#5c4ade` |
| Énfasis caliente | `--theme-hot` | ember `#fb4903` |

### 3.6 Color por elemento (interfaz)

Se usa en chips, la rueda elemental y las etiquetas de habilidades. Origen: `web/src/app/landing/content.ts` (`ELEMENT_COLORS`).

| Elemento | Color de UI |
|---|---|
| Fuego | ember `#fb4903` |
| Agua | electric-blue `#4da2ff` |
| Planta | mint-pop `#55db9c` |
| Neutral | lavender `#e9ccff` |
| Eléctrico, Sombra, Luz | *pendiente de asignar* (propuesta: sunburst, violet, soft-mist) |

> Ojo: el **color de UI** de un elemento no es el **color del sprite**. Los cuerpos de los Pockais usan su propia paleta ilustrativa (§7.2).

### 3.7 Color por rareza

Origen: `content.ts` (`RARITY_COLORS`).

| Rareza | Color |
|---|---|
| Normal | mint-pop `#55db9c` |
| Raro | electric-blue `#4da2ff` |
| Super-raro | lavender `#e9ccff` |
| Legendario | sunburst `#ffd731` |
| Mítico | ember `#fb4903` |
| Shiny | pastilla con `--grad-accent` y destello; se suma a la rareza, no la sustituye |

### 3.8 Degradados y textura

| Token | Definición | Uso |
|---|---|---|
| `--grad-accent` | 135°: `#6d5bff` → `#5c4ade` → `#3f8cff` | Botón principal, isotipo, pastilla shiny |
| `--grad-hero` | Tres radiales (lavanda, menta, amarillo) sobre sky-wash, con su versión oscura | Hero de cada página |
| `--grad-ether` | Radiales violeta y azul sobre carbón | Bandas oscuras, lore, "el Éter" |
| `--grain` | Ruido fractal al 7 % | Textura sutil sobre degradados |

Los degradados solo se usan en estos puntos, nunca como fondo de tarjetas de contenido.

### 3.9 Islas de tono

Un contenedor con fondo de la paleta de marca (pastel) fija `color-scheme: light`, con la clase `.tone` o `.tone.tone--x`. Así, dentro de él, los tokens semánticos resuelven en su versión clara y el texto sigue siendo oscuro aunque la página esté en modo oscuro. **Sobre un pastel el texto es siempre `--on-color`.**

### 3.10 Estados (propuesta común)

Todavía no están como tokens en la web. Se propone añadirlos a la web y a las apps como `--success`, `--warning` y `--danger`:

| Estado | Color |
|---|---|
| Éxito | mint-pop `#55db9c` (texto: `#1d7a4f`) |
| Aviso | sunburst `#ffd731` (texto: `#8a6a00`) |
| Error | ember `#fb4903` (texto: `#b33200`) |

## 4 · Tipografía

| Rol | Fuente | Sustituto libre (actual) | Estilo |
|---|---|---|---|
| Display (titulares, logo, números grandes) | **Lateral** | Bowlby One | MAYÚSCULAS, interlineado 0,86–1, tracking −0,01 em |
| Interfaz y texto | **Aeonik Pro** | Inter Variable | Normal, tracking −0,011 em |

Lateral y Aeonik Pro son comerciales. Si se instalan, la pila las coge sola; mientras tanto se auto-alojan los sustitutos con `@fontsource`.

**Escala** (`tokens.css`):

| Token | Tamaño | Interlineado |
|---|---|---|
| `--text-caption` | 12 px | 1,56 |
| `--text-label` | 13 px | 1,35 (botones y texto denso de la app) |
| `--text-body` | 14 px | 1,5 (cuerpo en el escritorio) |
| `--text-title` | 18 px | 1,1 (títulos de sección dentro del panel) |
| `--text-body-lg` | 16 px | 1,5 |
| `--text-subheading` | 22 px | 1,2 |
| `--text-heading-sm` | 30 px | 1,1 |
| `--text-heading` | clamp(40 px, 6vw, 64 px) | 1 |
| display | hasta el ancho disponible | 0,86 |

Pesos: 500 (medio), 700 (negrita) y 800 (extra).

**Mínimo de 12 px:** ningún texto de interfaz baja de `--text-caption`. En el escritorio los `font-size` van siempre con token; solo quedan en píxeles los glifos que hacen de ilustración (emoji de minijuegos, el reloj del pomodoro).

**Etiquetas:** el eyebrow y `.label-caps` van a 12 px, en negrita, en MAYÚSCULAS y con tracking 0,08 em. El eyebrow es una pastilla con un punto de color `--accent`. Los `.tag` usan tracking 0,04 em.

**Apps:**

| Plataforma | Cómo aplicarlo |
|---|---|
| Svelte | Las mismas pilas como variables CSS. |
| Compose | Un `Type.kt` con `displayLarge…headlineSmall` en Bowlby One/Lateral, y `title*`, `body*` y `label*` en Inter/Aeonik Pro (`labelSmall` = 12 sp en negrita y mayúsculas). |
| iOS | `.largeTitle` y `.title` en display; el resto en Inter. |

## 5 · Forma y espacio

| Concepto | Valor |
|---|---|
| Radios | 8 px (`--radius-sm`) y 12 px (`--radius-md`) para controles y miniaturas dentro de tarjetas, 16 px (`--radius-2xl`: chips grandes, inputs), **20 px** (`--radius-cards`: tarjetas), 28 px (`--radius-3xl`), 32 px (`--radius-cards-elevated`: tarjetas destacadas), 9999 px (botones y pastillas) |
| Espaciado | Escala 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 60 · 80 · 128 px. El token `--spacing-24` vale 24 px |
| Relleno de tarjeta | clamp(20 px, 2,4vw, 28 px) |
| Márgenes laterales | `--gutter` = clamp(16 px, 4vw, 48 px); ancho máximo 1280 px |
| Breakpoints | 640 px (móvil → tableta), 960 px (tableta → escritorio), 1280 px |
| Contorno | `--outline` = 1 px sólido `--line`. Sobre un relleno de la paleta de marca el contorno es `--on-color`; `--color-carbon` no se usa directamente en componentes |
| Controles | `--control-h` = 36 px (botones), `--control-h-icon` = 32 px (botones de icono en filas) y `--hit-min` = 44 px (zona de clic mínima) |
| Capas | Escala `--z-*`: `below` −1, `base` 0, `raised` 1, `sticky` 10, `overlay` 30, `pet` 50, `dock` 90, `panel` 100, `popover` 200, `modal` 900, `toast` 1000. Las capas locales de un componente se expresan con `calc()` sobre la más cercana |
| Foco | `--focus-ring` = 3 px sólido `#5c4ade` en claro y `#b3a8ff` en oscuro; siempre visible con teclado |

**Elevación** (sombras tintadas con `--shadow-c`, que es `#261e6e` en claro y negro en oscuro):

| Token | Uso |
|---|---|
| `--shadow-1` | Reposo de chips, isotipo |
| `--shadow-2` | Tarjetas, botones en hover |
| `--shadow-3` | Paneles flotantes, menú |
| `--shadow-4` | Diálogos |
| `--shadow-pop` | `4px 5px 0 var(--line)`: sombra dura de pegatina, para tarjetas `.card--pop` |
| `--glow-accent` | Halo violeta del botón principal en hover |

## 6 · Iconos y pegatinas

**Pegatinas** (`web/src/app/shared/ui/sticker.ts`):
- Hay 13 iconos: `egg`, `heart`, `bolt`, `star`, `chat`, `coin`, `shield`, `phone`, `flame`, `drop`, `leaf`, `moon` y `sun`.
- Dibujo: retícula de 24×24, **relleno blanco, trazo negro de 1,25** con uniones redondeadas. Ocupa el 62 % de la pegatina.
- Soporte: cuadrado de 72 px por defecto, radio 20 px y contorno de 1 px, con fondo de la paleta de marca según el tema (§3.5).
- Son decorativas (`aria-hidden`). Nunca son el único portador de información.
- Pueden ir giradas unos grados solo si son decoración suelta. **Las tarjetas con texto no se giran.**

**Iconos de interfaz** (botones, navegación, pestañas):
- Un único set de **trazo** en todas las plataformas. Se propone **Lucide**, que ya es dependencia del escritorio: trazo de 2 px, esquinas redondeadas, 20–24 px y color `currentColor`.
- **Ni emoji ni Material Icons rellenos en la UI.** Los emoji solo se admiten dentro de textos de chat de la mascota.
- Iconos nuevos de marca (cofre, sartén, espada, constelación…): mismas reglas que las pegatinas (relleno blanco, contorno negro y formas simples).

## 7 · Ilustración de Pockais

Sprites en `shared/assets/sprites/*.svg`.

### 7.1 Plantilla

- Lienzo `viewBox 0 0 128 128`.
- **Sombra de suelo:** elipse centrada en (64, 116), radios 36×8, negra al 20 %.
- **Cuerpo:** círculo centrado en (64, 68), r = 42, contorno `#1A1A1A` de **3 px**.
- **Barriga:** elipse de radios 26×20, blanca al 35 %.
- **Ojos:** círculos de r = 6 en `#1A1A1A`, con brillo blanco de r = 2.
- **Boca:** curva de 2 px con extremos redondeados. Abierta (happy/eat) en `#8B0000`.
- **Accesorios** (hoja, cuerno, branquias): contorno de 2 px en el color *accent* de su elemento.
- **Estados con SVG:** `idle`, `happy`, `eat` y `sleep`. En `sleep` se dibuja "Zzz" en negrita, en `#3B82F6`.
- Requeridos por el pipeline: idle, walk, eat, happy, sleep y attack (ver [`ART_PIPELINE.md`](ART_PIPELINE.md)).

### 7.2 Paletas por elemento

Origen: `shared/assets/palettes.json`. Cada elemento tiene un trío primario / secundario / acento, más su variante shiny.

| Elemento | Normal | Shiny |
|---|---|---|
| Fuego | `#E25822` / `#F3C544` / `#6D1600` | `#4CC9F0` / `#F72585` / `#7209B7` |
| Agua | `#38A3A5` / `#80ED99` / `#22577A` | `#FFB703` / `#FB8500` / `#023047` |
| Planta | `#57CC99` / `#C7F9CC` / `#22577A` | `#9D4EDD` / `#E0AAFF` / `#3C096C` |
| Eléctrico | `#FFD166` / `#FFEBB3` / `#FF9F1C` | `#06D6A0` / `#B8F2E6` / `#118AB2` |
| Sombra | `#4A4E69` / `#9A8C98` / `#22223B` | `#E63946` / `#F1FAEE` / `#A8DADC` |
| Luz | `#F4F1DE` / `#E07A5F` / `#F2CC8F` | `#3D405B` / `#81B29A` / `#F4F1DE` |

Especies con arte: **Axolunar** (agua, `#38A3A5`), **Florabud** (planta, `#57CC99`) e **Ignisaur** (fuego, `#E25822`).

### 7.3 Huevos y patrones

- **Huevo:** relleno `#FDE047`, contorno `#1A1A1A` de 3 px, manchas `#F59E0B` al 60 %. El huevo agrietado añade una grieta en zigzag de 3 px.
- **Patrones:** puntos, rayas, escamas y degradado en SVG con `currentColor`. Aurora, cristal y galaxia existen como PNG mosaico en `shared/assets/patterns/`.
- Cada patrón tiene una rareza mínima (`shared/game-data/patterns.json`).
- **Variación por mascota:** la semilla `visualSeed` decide el desplazamiento, la escala (0,85–1,15), el giro (±0,15 rad) y el tono (±8°). Nunca se colorea sobre la cara ni los ojos (canal B de la máscara).

### 7.4 Isométrico (objetivo; sustituye a la vista de perfil)

El mundo de Pockai pasa a una **vista isométrica cozy**: las salas son dioramas vistos desde arriba en diagonal y los Pockais se dibujan en **3/4**. Mientras se migra, el arte de perfil (§7.1) sigue siendo válido; todo arte **nuevo** se hace con estas reglas.

**Proyección**
- **Dimétrica 2:1** (la "isométrica" de los juegos): cada celda del suelo es un rombo de **32×16 px** a escala 1.
- De rejilla a pantalla: `sx = (x − y) · 16`, `sy = (x + y) · 8`. El eje `x` va hacia abajo-derecha y el `y` hacia abajo-izquierda.
- Altura: 1 unidad vertical = 1 px hacia arriba. Una pared mide 120 px y un mueble bajo, de 16 a 32 px.
- **Orden de profundidad:** se pinta antes lo que tiene menor `x + y` (del vértice más cercano a la cámara de su huella). Si empatan, va antes lo más bajo. Muebles y Pockai comparten **una sola lista** ordenada.

**Luz y color**
- Luz fija desde **arriba a la izquierda**.
- Cada volumen tiene **tres tonos del mismo color**: cara superior = color base +12 % de luz, cara izquierda = base, cara derecha = base −18 % de luz. Nada de degradados realistas.
- Se mantiene la firma de pegatina: contorno exterior `#1A1A1A` de 3 px en Pockais y de 2 px en muebles; las aristas interiores van a 1–1,5 px y al 60 % de opacidad.
- Las sombras de suelo son **elipses 2:1** (rx = 2·ry), negras al 20 %, nunca circulares.

**Pockai en 3/4**
- Frame de 128×128, suelo en y = 120. Mira **abajo-derecha**; la dirección abajo-izquierda se consigue con espejo (`scaleX(-1)`), así que el dibujo no lleva textos ni asimetrías que delaten el espejo.
- Cuerpo girado unos 30°: se ven la cara y el costado derecho. Las anclas de la cara se desplazan hacia el lado visible. El **ojo lejano** es el de la **derecha de la pantalla**, junto al contorno de la cara: más estrecho (unos 0,75 en ancho). La boca queda bajo el punto medio de los ojos. Las patas lejanas asoman detrás del cuerpo, desplazadas a la derecha y arriba. Patas: las cercanas más grandes y bajas; las lejanas asoman.
- Sombra: elipse 2:1 centrada en (64, 114), con radios de 24×12 (no debe pasar de y ≈ 126 para no recortarse en el frame).
- **Etapas** (baby, juvenile, adult, final): mismo dibujo con parámetros.

| Etapa | Cabeza/cuerpo | Apéndices | Extras |
|---|---|---|---|
| Baby | 1,4 (cabezón) | 0,6 | ojos más grandes |
| Juvenile | 1,15 | 0,85 | — |
| Adult | 1,0 | 1,0 | rasgo icónico completo |
| Final | 0,95 | 1,15 | un accesorio de etapa final (cresta, aura, corona) |

Tabla orientativa: los valores exactos (escala total, cabeza, apéndices y ojos) están en `STAGE_PARAMS` de `scripts/sprites/species.ts`. La etapa final **no crece de tamaño**, para no salirse del frame en las poses con desplazamiento; destaca por sus apéndices y su accesorio.

- Dentro de una sala, el Pockai se muestra a unos **72 px** de alto (escala ≈ 0,56); en la mascota flotante, a 128 px.

**Salas** (se renderizan con el núcleo compartido de PixiJS en `shared/scene`: ver `ART_PIPELINE.md` §9)
- Corte tipo "casa de muñecas": suelo de 14×10 celdas y **dos paredes al fondo** (la derecha a lo largo de `y = 0` y la izquierda a lo largo de `x = 0`), sin paredes delanteras.
- Cada sala tiene su tema (pared, suelo, zócalo, ventana y luz) y su variante de noche.
- **Muebles:** SVG isométrico con huella `W×D` en celdas, de suelo o de pared, con 2 orientaciones dibujadas (las otras 2 salen por espejo). El punto de anclaje es el vértice superior de la celda (x, y) de la huella.
- **Ni emoji ni iconos** como muebles.

## 8 · Movimiento

Tokens en [`web/src/styles/motion.css`](../web/src/styles/motion.css):

| Token | Valor | Uso |
|---|---|---|
| `--dur-1` | 0,15 s | Hover, pulsación |
| `--dur-2` | 0,3 s | Transiciones de componente |
| `--dur-3` | 0,6 s | Entradas por scroll |
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | Por defecto |
| `--ease-bounce` | `cubic-bezier(.34, 1.56, .64, 1)` | Pegatinas, reacción de la mascota |

Reglas:
- Las entradas por scroll (`.reveal`) son solo un fundido que sube 24 px.
- Al cambiar de página se usa una transición de vista; la cabecera no se anima.
- **Como mucho un bucle por pantalla** (el marquee no cuenta). La mascota no cambia sola: reacciona al tocarla.
- Botones: suben 2 px en hover; al pulsar bajan 1 px y escalan a 0,97.
- Con `prefers-reduced-motion: reduce` no se mueve nada. Android: respetar "Quitar animaciones"; iOS: "Reducir movimiento".

**Mascota** (`shared/assets/animation-specs.json` y `ART_PIPELINE.md`):
- Va a 60 fps y cada frame dura 150 ms.
- Easings: elástico para happy y victory, `easeInOutSine` para eat y `easeOutCubic` para attack.
- **Al tocarla:** se aplasta (escala 1,15 × 0,85) durante 120 ms y rebota con un elástico.
- **Al recibir daño:** retrocede 12 px con un destello blanco de 80 ms.
- **En reposo:** flota suavemente (*bob*), con un ciclo de 3,2 s.
- Partículas compartidas: corazones, burbujas, Zzz, gotas y chispas.

## 9 · Componentes base

| Componente | Regla |
|---|---|
| Botón principal | Pastilla con `--grad-accent`, texto blanco, `--shadow-2` y brillo interior. En hover, `--glow-accent`. Uno por vista. |
| Botón secundario | Pastilla con `--surface`, contorno de 1 px y texto `--ink`. |
| Botón ink | Pastilla con fondo `--ink` y texto `--bg`, para contraste máximo sobre bandas claras. |
| Botón ghost | Transparente. En hover, `--ink` al 8 %. |
| Tamaños | Normal y `--sm`: alto mínimo de 36 px, 13 px de texto (12 px en `--sm`). Los botones de icono en filas miden 32 px. Área de clic mínima de 44×44: en el escritorio el botón la amplía con un `::after` invisible, sin cambiar su tamaño visual. |
| Tarjeta | `--surface`, contorno de 1 px, radio de 20 px, `--shadow-1`/`2`. `.card--pop` usa la sombra dura. Si es temática, va sobre un pastel con isla de tono. |
| Eyebrow / tag | §4. Pastillas con contorno. |
| Cabecera de sección | Eyebrow + titular display + entradilla (`.section-head`). En secciones secundarias, titular más pequeño (`.section-title--sm`). |
| Palabra resaltada | `.hl`: una palabra del titular sobre sunburst, con contorno carbón de 1 px, sombra dura y giro de −2,5°. Una por titular. |
| Burbuja de chat de la mascota | Norma: superficie blanca casi opaca, contorno de 1 px, radio de 16 px, cola hacia la mascota y texto de interfaz con interlineado 1,35. |
| Vidrio | `--surface-glass` con desenfoque de 8–16 px. Solo en cabeceras y en elementos superpuestos al escritorio o al juego. |

## 10 · Por plataforma

### Web (`web/`)
Es la referencia: aplica todo lo anterior con tokens en `tokens.css`, componentes en `base.css` y movimiento en `motion.css`. El modo oscuro se activa con `prefers-color-scheme`.

### Escritorio (`desktop/`, Tauri + Svelte)
- Ventana transparente, sin bordes y siempre encima. La mascota "vive" sobre el escritorio del usuario.
- Crear un fichero de tokens con las **mismas variables CSS** que la web (copiar `tokens.css` sin `@theme`) y sustituir los hex sueltos.
- Los elementos superpuestos (burbuja, chip de estado, panel de control) usan vidrio y la tipografía Inter/Aeonik.
- Los iconos de interfaz usan `lucide-svelte` (§6), y el nombre visible es **Pockai**.
- **Tema:** por defecto sigue al sistema. En Ajustes › Escritorio se puede forzar claro u oscuro; se aplica con `data-theme` en `<html>`, que solo cambia `color-scheme` (los tokens `light-dark()` hacen el resto).
- **Diálogos:** usan `Modal` (o la acción `focusTrap`): el foco entra al abrir, no sale con Tab y vuelve al cerrar.

### Android (`mobile/android`, Compose)
- `MaterialExpressiveTheme` con la paleta de marca. El **color dinámico va desactivado por defecto** (como mucho, una opción en Ajustes).
- Mapeo de roles:

| Rol M3 | Claro | Oscuro |
|---|---|---|
| `primary` | `#5c4ade` | `#b3a8ff` |
| `onPrimary` | `#ffffff` | `#0b0a14` |
| `secondary` | `#4da2ff` | `#4da2ff` |
| `tertiary` | `#ffd731` | `#ffd731` |
| `background` | `#fbfaff` | `#0d0c19` |
| `surface` | `#ffffff` | `#17162a` |
| `surfaceVariant` | `#f2f1f8` | `#201e37` |
| `onSurface` | `#0b0a14` | `#f4f2ff` |
| `onSurfaceVariant` | `#4b4862` | `#b9b5d8` |
| `outline` | `#0b0a14` | `#3d3a63` |
| `error` | `#b33200` | `#fb4903` |

- Añadir un `Type.kt` (§4) y un `Shape.kt` con radios small 16, medium 20, large 28 y extraLarge 32 dp.
- Icono adaptativo: el huevo de marca (§2) con capa monocroma.

### iOS (pendiente)
- La marca va sobre el estilo nativo (Liquid Glass): `AccentColor` = `#5c4ade` en claro y `#b3a8ff` en oscuro, con los mismos fondos y tipografía que Android.
- El vidrio nativo sustituye a `--surface-glass`.

## 11 · Accesibilidad

- **Contraste AA** (4,5:1 en texto normal, 3:1 en texto grande y en iconos).
- **Sobre ember `#fb4903`, el texto es oscuro** (`#0b0a14`, unos 6:1); blanco no llega.
- **Sobre violeta `#5c4ade`, el texto es blanco** (unos 5,8:1); oscuro no llega.
- Sobre pasteles (sky, mint, lavender, sunburst) el texto es siempre `--on-color`.
- Para texto de acento, usar `--accent-ink`, no `--accent`.
- Foco siempre visible (§5).
- Rareza y elemento **nunca solo por color**: van siempre con su nombre o icono.
- Las animaciones respetan la preferencia de movimiento reducido (§8).

## 12 · Deuda: diferencias actuales

Esta sección lista lo que existe hoy y no sigue esta guía. Corregirlo es trabajo pendiente.

| Dónde | Hoy | Según la guía |
|---|---|---|
| Nombre | "PetAI" visible en el tema Android y los docs (el escritorio ya muestra Pockai) | "Pockai" visible; PetAI solo interno |
| Android: color | Sky `#38BDF8` / Night `#0F172A`; color dinámico en Android 12+ | Mapeo de §10, sin color dinámico por defecto |
| Android: tipografía y forma | Sin `Type.kt` ni `Shape.kt`; radios inline de 12–36 dp | §4 y §5 |
| Android: iconos | Material Icons rellenos | Lucide o equivalente de trazo |
| Huevo | Icono Android `#FDE68A` con manchas azules; sprite `#FDE047` con manchas `#F59E0B` | Un solo huevo de marca (§2) |
| Emoji de contenido | En el escritorio quedan emoji como contenido de juego (frutas de minijuegos, accesorios y muebles, iconos de elemento) | Pegatinas/Lucide cuando haya arte propio; los muebles, en SVG isométrico (§7.4) |
| Vista | Pockais de perfil y hábitat en diorama lateral (CSS) | Pockais en 3/4 por etapa y salas isométricas (§7.4) |
| Elementos | Eléctrico, Sombra y Luz sin color de UI | Completar §3.6 |
| Docs vs arte | Los docs hablan de 14 estados y 21 especies | Hay 4 estados en SVG y 3 especies con arte |
