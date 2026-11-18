# PetAI — Pipeline de Arte y Composición por Capas en Tiempo Real

Este documento técnico describe el estándar de assets, el algoritmo de renderizado determinista basado en `visualSeed`, los shaders por plataforma, la técnica de *In-Memory Baking* y el catálogo de animaciones para PetAI.

---

## 1. Visión y Principios del Sistema

Para que el arte no bloquee el desarrollo y la apariencia sea 100% idéntica en **Tauri (Svelte/Canvas)**, **Android (Jetpack Compose / AGSL)** e **iOS (SpriteKit / SKShader)**, el pipeline visual opera como un **sistema de composición por capas en tiempo real** en lugar de generar y exportar miles de sprites estáticos pre-renderizados.

### Ventajas clave
1. **Huella de memoria mínima**: Cada una de las 21 especies requiere únicamente 3 hojas de sprites (`base.png`, `mask.png`, `anim.json`), ocupando menos de 300 KB por especie.
2. **Determinismo absoluto**: El servidor guarda un único `visualSeed` (entero de 32 bits). A partir de él, un PRNG idéntico (`Mulberry32`) deriva desplazamientos, rotaciones y variaciones sutiles de tono en todos los clientes.
3. **60 FPS garantizados (In-Memory Baking)**: Como los colores y patrones de una criatura no cambian durante la sesión, la composición se ejecuta **una sola vez** al montar la criatura en memoria, generando un framebuffer/textura en caché (`baked_sheet`). El bucle de animación simplemente recorta cuadros de esa textura.

---

## 2. Estándar de Archivos en `shared/assets/`

```
shared/assets/
├── species/
│   ├── ignisaur/                   # ID de la especie (en species.json)
│   │   ├── base.png                # Líneas negras, ojos, boca y sombreado neutro (escala de grises)
│   │   ├── mask.png                # Canales RGBA usados como máscaras de color
│   │   └── anim.json               # Formato Aseprite JSON Array (frames, duración, tags)
│   ├── axolunar/
│   │   ├── base.png
│   │   ├── mask.png
│   │   └── anim.json
│   └── florabud/
│       ├── base.png
│       ├── mask.png
│       └── anim.json
├── patterns/
│   ├── stripes.png                 # Texturas tileables (256x256 px) en blanco/alfa
│   ├── spots.png
│   ├── scales.png
│   ├── crystal.png
│   └── galaxy.png
└── palettes.json                   # Paletas curadas por elemento/rareza + variantes Shiny
```

### Codificación del canal RGBA en `mask.png`
Para condensar todas las capas en un único archivo de máscara y ahorrar memoria de GPU y llamadas de textura:
- **Canal Rojo (R)**: Máscara para la zona del **color primario** (ej. pelaje/cuerpo principal).
- **Canal Verde (G)**: Máscara para la zona del **color secundario** (ej. vientre, puntas de orejas, cola).
- **Canal Azul (B)**: Máscara para la zona de **proyección del patrón** (lomo, alas, hombros, respetando cara y ojos).
- **Azul puro (R = 0, G = 0, B = 255)**: zona del **color de acento** (`palette.accent`): cuernos, garras, caparazones. No recibe patrón. Si la paleta no trae acento, se usa el primario oscurecido.
- **Negro puro**: color literal; se copia `base.png` tal cual (ojos, boca, efectos, brillos).
- **Canal Alfa (A)**: **Silueta total** de la criatura para recorte duro y recorte del patrón.

---

## 3. Algoritmo Determinista (visualSeed)

Cada mascota posee un `visualSeed` (entero de 32 bits asignado autoritativamente por el servidor al eclosionar).

### PRNG idéntico: Mulberry32
El generador `Mulberry32` garantiza la misma secuencia exacta de números pseudoaleatorios en JavaScript/TypeScript, Kotlin y Swift:

#### TypeScript (Desktop)
```typescript
export function createMulberry32(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

#### Kotlin (Android)
```kotlin
class Mulberry32(seed: Long) {
    private var state: Int = seed.toInt()

    fun nextFloat(): Float {
        state = state + 0x6D2B79F5
        var t = state xor (state ushr 15)
        t = Math.imul(t, 1 or state)
        t = (t + Math.imul(t xor (t ushr 7), 61 or t)) xor t
        val res = (t xor (t ushr 14)) ushr 0
        return (res.toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }
}
```

#### Swift (iOS)
```swift
struct Mulberry32 {
    private var state: UInt32

    init(seed: UInt32) {
        self.state = seed
    }

    mutating func nextFloat() -> Float {
        state = state &+ 0x6D2B79F5
        var t = state ^ (state >> 15)
        t = t &* (1 | state)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        let res = t ^ (t >> 14)
        return Float(res) / 4294967296.0
    }
}
```

### Derivación de Parámetros Visuales
Con `Mulberry32(visualSeed)` se derivan los siguientes atributos sin requerir columnas extra en base de datos:
- `patternOffsetX`, `patternOffsetY`: Desplazamiento entero entre `0` y `255` px sobre la textura tileable.
- `patternScale`: Factor de escala entre `0.85` y `1.15`.
- `patternRotation`: Rotación sutil entre `-0.15` y `+0.15` radianes.
- `hueShiftDeg`: Variación tonal ligera de $\pm 8^\circ$ sobre los colores de la paleta base.

---

## 4. Pipeline de Composición por Capas (4 Pasos)

Para componer un cuadro o la hoja de sprites completa:

```
[ mask.png (R: Primario, G: Secundario) ] ───────┐
                                                 ├──> [ Capa Base de Color ]
[ palettes.json (Colores con ±8° hueShift) ] ────┘           │
                                                             ▼
[ patterns/*.png (offset, rot, scale) ] ───────────> [ Proyección de Patrón (Mask B) ]
                                                             │
                                                             ▼
[ base.png (Multiply Sombras + Normal Lineart) ] ──> [ Sombreado y Contornos ]
                                                             │
                                                             ▼
[ Pase Shiny (Banda especular 4s + Destellos) ] ───> [ Sprite Final Compuesto ]
```

1. **Capa Base de Color**: Se evalúa `mask.png`. Cada píxel se colorea interpolando `palette.primary` (ponderado por el canal R) y `palette.secondary` (ponderado por el canal G); el azul puro se pinta con `palette.accent`.
   - **Giro de tono en la sombra**: al multiplicar por el gris de `base.png`, el color gira hacia el violeta y se satura en proporción a lo oscuro que sea ese gris (`shadeShift` en `shared/scene/src/bake/bakePixels.ts`). Solo se aplica cuando `base.png` es un gris; un `base.png` con color propio multiplica tal cual.
2. **Proyección del Patrón**: Se muestrea `patterns/{patternId}.png` aplicando el transform `(offsetX, offsetY, scale, rotation)`. El valor se multiplica por el canal `B` de `mask.png` y se combina con la capa base. De esta forma, el patrón solo cubre las zonas permitidas y nunca mancha los ojos, boca o vientre.
3. **Sombreado y Lineart**: Se superpone `base.png`. Las sombras en escala de grises actúan en modo de fusión `Multiply`, oscureciendo el color y el patrón subyacente. Los contornos negros y los reflejos blancos de los ojos se dibujan en modo `Normal`.
4. **Efecto Shiny (si `shiny == true`)**: Se aplica un shader con una banda diagonal blanca semitransparente que recorre la silueta (máscara canal A) cada 4 segundos, acompañado de un emisor de partículas de estrellas o chispas.

---

## 5. Implementación Técnica por Plataforma

> **Decisión 2026-11:** la escena (sala, Pockai y bake) pasa a ser un **núcleo compartido con PixiJS** en `shared/scene`. Ver §9. El bake por plataforma de §5.1–5.3 queda como referencia histórica y como fallback de los widgets nativos, que no pueden alojar un WebView.

### 5.1 Escritorio (Tauri 2 / Svelte / Canvas)
- **Modo Producción**: Un `<canvas>` offscreen en memoria ejecuta la composición de los 4 pasos una sola vez al cargar la mascota (`bakeSpriteSheet()`).
- El resultado se almacena en una imagen `ImageBitmap` o `HTMLCanvasElement` en RAM.
- La reproducción de las animaciones a 60 FPS se realiza mediante llamadas directas `ctx.drawImage(bakedCanvas, sx, sy, sw, sh, dx, dy, dw, dh)` según las coordenadas de `anim.json`.

### 5.2 Android (Jetpack Compose / AGSL)
- **Dispositivos Android 13+ (API 33 a 37)**:
  - Se utiliza `android.graphics.RuntimeShader` (AGSL) con `RenderEffect.createRuntimeShaderEffect()`.
  - Recibe las texturas `u_base`, `u_mask`, `u_pattern` y los uniformes de color `u_primary`, `u_secondary`, `u_pattern_offset`.
  - La composición se realiza en un único *draw call* en GPU.
- **Dispositivos Android 8.0 a 12 (API 26 a 32)**:
  - Fallback mediante `android.graphics.Canvas` y `PorterDuff.Mode.MULTIPLY` / `BlendModeCompat`.
- **Baking en memoria**: El resultado se dibuja una sola vez sobre un `Bitmap` de dimensiones idénticas al sprite sheet, reciclando dicho `Bitmap` durante la vida del composable `PetSprite`.

### 5.3 iOS (SwiftUI + SpriteKit / Metal)
- En `SpriteView`, se instancia un `SKScene` con un `SKSpriteNode`.
- El sprite utiliza un `SKShader` personalizado en Metal/GLSL:
  - Uniformes: `u_base` (`sampler2D`), `u_mask` (`sampler2D`), `u_pattern` (`sampler2D`), `u_primary_color` (`vec4`), `u_secondary_color` (`vec4`), `u_pattern_transform` (`vec4`).
- Al inicializar el nodo, se renderiza la textura horneada mediante `SKRenderer` o `SKView.texture(from:)`, evitando evaluar el shader completo en cada frame de animación.

---

## 6. Catálogo de Animaciones (14 Estados)

La resolución estándar es de **128 × 128 px por frame**. El sprite sheet completo (~44 frames) pesa menos de 300 KB por especie.

| Categoría | Tag en `anim.json` | Frames | Bucle | Cuándo se dispara |
|---|---|:---:|:---:|---|
| **Vida Diaria** | `idle` *(crítico)* | 4 | Sí | Estado por defecto en reposo. |
| | `idle_alt` | 4 | No | Cada ~15–20 s (bostezar, rascarse, mirar alrededor). |
| | `walk` *(crítico)* | 4 | Sí | Desplazamiento por pantalla en Tauri o escena. |
| | `sit` | 2 | Sí | En escritorio al estar un tiempo quieto. |
| | `sleep` *(crítico)* | 2 | Sí | Ciclo nocturno o energía agotada ($E < 15$). |
| **Cuidado** | `eat` *(crítico)* | 4 | No | Alimentar o dar medicina. |
| | `clean` | 4 | No | Bañar/limpiar (sacudida de agua/jabón). |
| | `happy` *(crítico)* | 4 | No | Caricias, comida favorita, subida de nivel. |
| | `sad` | 2 | Sí | Felicidad o hambre $< 25\%$. |
| | `sick` | 2 | Sí | Salud baja ($S < 20$) o enfermedad activa. |
| **Arena** | `attack` *(crítico)* | 4 | No | Ataque físico estándar. |
| | `cast` | 4 | No | Habilidad especial/elemental (carga de poder). |
| | `hurt` | 2 | No | Al recibir impacto en el combate. |
| | `faint` | 3 | No | Mascota derrotada (0 HP). |
| **IA / Chat** | `talk` | 3 | Sí | Durante streaming de respuesta de chat o alerta proactiva. |

### Reglas para Optimizar el Trabajo Artístico
1. **Fallbacks Automáticos en `PetView`**:
   Si una especie no tiene definidos los 14 estados en su `anim.json`, el visor aplica de inmediato los siguientes respaldos sin interrumpir la ejecución:
   - `cast` $\rightarrow$ `attack`
   - `sit` / `idle_alt` $\rightarrow$ `idle`
   - `talk` $\rightarrow$ `happy`
   - `clean` $\rightarrow$ `happy`
   - `sad` / `sick` / `hurt` $\rightarrow$ `idle`
   - `faint` $\rightarrow$ `sleep`
2. **Reutilización de Frames Clave**:
   - `talk` (3 frames): Es el frame 0 de `idle` alterando únicamente 4 píxeles de la boca.
   - `hurt` (2 frames) y `faint` (3 frames): Comparten postura base con desplazamiento o rotación.
   - `clean` y `happy`: Comparten animación corporal modificando solo la expresión ocular.
3. **Transformaciones Procedurales por Código**:
   - *Squash & Stretch*: Al interactuar o hacer clic en la mascota, escalar `scaleX = 1.15, scaleY = 0.85` durante 120 ms con curva de rebote elástica.
   - *Retroceso en combate*: En `hurt`, desplazar `X = -12 px` con flash blanco (`tintex`) durante 80 ms.
   - *Partículas superpuestas*: Corazones (`happy`), burbujas (`clean`), `Zzz` (`sleep`), gotas (`sick`) y chispas (`cast`) son sprites genéricos compartidos por todas las especies.

---

## 7. Validación Automatizada en CI (`validate-assets.js`)

El script de validación se ejecuta en GitHub Actions (`npm run validate:assets`) para garantizar la integridad del pipeline de arte:

- **Errores Críticos (Detienen la compilación / CI falla)**:
  - Carpeta ausente para una especie definida en `species.json`.
  - Ausencia de `base.png`, `mask.png` o `anim.json`.
  - Discrepancia en las dimensiones de píxel entre `base.png` y `mask.png`.
  - Falta de cualquiera de los 6 tags críticos: `idle`, `walk`, `eat`, `happy`, `sleep`, `attack`.
  - Archivos de patrón inexistentes en `shared/assets/patterns/`.
- **Advertencias Recomendadas (Warnings con fallback activo)**:
  - Ausencia de tags recomendados (`idle_alt`, `sit`, `clean`, `sad`, `sick`, `cast`, `hurt`, `faint`, `talk`). El validador notifica qué animación de respaldo se utilizará en su lugar.

---

## 8. Migración isométrica (3/4 por etapa y muebles)

Reglas visuales en [`GUIA_ARTISTICA.md` §7.4](GUIA_ARTISTICA.md#74-isométrico-objetivo-sustituye-a-la-vista-de-perfil).

### Hojas por etapa
- Cada especie es un `PixelSpecies` en `scripts/sprites/pixel/species.ts`, con una geometría por etapa (`baby | juvenile | adult | final`). No hay un dibujo escalado: cada etapa tiene su propio plan corporal ([`GUIA_ARTISTICA.md` §7.5](GUIA_ARTISTICA.md)).
- `pnpm generate:sprites` escribe la etapa **adult en la raíz** `shared/assets/species/<id>/{base.png, mask.png, anim.json, anchors.json}` (así los clientes antiguos y el manifiesto del CDN siguen funcionando sin duplicar bytes) y `baby`, `juvenile` y `final` en `species/<id>/<etapa>/`.
- La cara se pinta en la máscara con primario **sin canal B** (papel `skin`), así que el patrón nunca la pisa.
- Los clientes piden `(especie, etapa)`. Si no existe, usan `adult` y, si tampoco existe, `ignisaur`.

### Muebles
- `scripts/sprites/furniture.ts` dibuja cada mueble en SVG isométrico con 2 orientaciones (`a` = rotación 0 y `b` = rotación 1). Las rotaciones 2 y 3 son el espejo de `b` y `a`.
- Salida: `shared/assets/furniture/<id>_{a,b}.svg`. Los datos (huella, montaje, interacción) están en `shared/game-data/habitats.json`.

### Pixel art
- El generador no rasteriza SVG: `scripts/sprites/pixel/raster.ts` dibuja cada frame desde cero en una rejilla de **64×64** a partir de elipses y polígonos ya transformados por la pose, y guarda la hoja a ×2 (frames de 128×128). Nunca se escala ni se gira un mapa de bits.
- El formato de `base.png` y `mask.png` no cambia, así que el horneado de los clientes (§4) es el mismo. Tonos en `base.png`: contorno 62, sombra 172, base y luz 239. El tono de luz se consigue sumando en la máscara una parte del secundario (G = 64; brillo, G = 128).
- `anim.json` lleva `meta.pixelArt = { native: 64, scale: 2 }`. Los clientes escalan por enteros y con vecino más próximo.
- `anchors.json` (junto a cada `anim.json`): anclas de accesorio por ranura y su desplazamiento por frame ([spec 38 §5](specs/spec-38-accesorios-pockai.md)).
- Los `sprites/<id>_*.svg` de vista previa son el mismo pixel art, hecho de rectángulos.

### Revisión visual
- `npx tsx .claude/skills/pockai-architect/scripts/contact_sheet.ts <id>` compone una hoja de contactos PNG (poses clave × etapas, más las cuatro siluetas) a color con la paleta por defecto, para revisarla antes de commitear.

---

## 9. Núcleo de escena compartido (`shared/scene`, PixiJS)

Un único renderizador para escritorio, Android e iOS, que sustituye a la spec `027-ios-skia`.

| Plataforma | Cómo se monta |
|---|---|
| Escritorio (Tauri + Svelte) | Import ESM directo de `@pockai/scene` en los componentes |
| Android (Compose) | `WebView` + `WebViewAssetLoader` con el bundle `dist/embed/` en `assets/scene/`, y puente `AndroidBridge` |
| iOS (SwiftUI) | `WKWebView` con el mismo bundle y `WKScriptMessageHandler` |
| Widgets (PetWidget, WidgetKit, Live Activity) | Nativos, con PNG pre-horneado (no admiten WebView) |

**Qué vive en el núcleo:**
- El bake (máscara + paleta + patrón) como filtro de Pixi.
- El reproductor de clips (`anim.json`).
- La sala isométrica: proyección, orden de profundidad, A*, paseo y modo edición.
- Las partículas.

**Qué queda nativo:** menús, pantallas, compras y llamadas a la API. La app nativa traduce los eventos de la escena a la API.

**Protocolo** (`shared/scene/src/protocol.ts`): mensajes JSON tipados.
- Entrada: `setPet`, `setHabitat`, `setTheme`, `setMode`, `playClip`.
- Salida: `ready`, `petTapped`, `furnitureMoved`, `petDraggedOut`.

**Android** (`mobile/android`):
- `pnpm --filter @pockai/scene build:embed` genera `shared/scene/dist/embed/`. La tarea Gradle `syncPockaiScene` (en `preBuild`) lo copia a `assets/scene/` y falla con un mensaje claro si falta.
- `ui/scene/PockaiSceneView.kt`: un `WebView` que sirve el bundle con `WebViewAssetLoader` desde `https://appassets.androidplatform.net/assets/scene/` y bloquea cualquier otra navegación.
  - Los eventos llegan por `AndroidBridge.postMessage`.
  - `SceneController` encola los mensajes hasta `ready` y, si la página se recarga, repite el último estado.
  - Se pausa en `ON_PAUSE`.
- `ui/scene/SceneMessages.kt` construye los mensajes del protocolo (v2); `restClip` es el equivalente de `resolveBaseState`.
- En builds debug, `adb shell am start -n com.petai.app/.debug.SceneDebugActivity` abre la sala con datos de ejemplo, sin backend (eventos en logcat con la etiqueta `PockaiScene`).

**Reglas:**
- El bundle se carga desde los assets de la app, sin red.
- La escena para su ticker cuando no se ve.
- Hay modo de calidad baja para gamas bajas.
