<!-- Hoja de ruta de la migración isométrica. Copia del plan aprobado; actualízala al cerrar cada fase. -->
# Pockai isométrico: sprites 3/4, salas isométricas y skills de arte

## Contexto
Hoy el Pockai es un sprite procedural de perfil (128×128, mirando a la derecha, en `scripts/sprites/species.ts`) y el hábitat es un diorama lateral en CSS. Ese diorama tiene 9 huecos fijos y muebles en emoji (`desktop/src/components/HabitatTab.svelte`, `HomeScene.svelte`). Android pinta una rejilla plana de 14×10 (`HabitatScreen.kt`), y el backend coloca cada mueble en la primera celda libre.

Queremos un estilo **isométrico cozy**:
- Pockai en vista 3/4, con 2 direcciones (la segunda por espejo), usado en todas partes, también en la mascota flotante del escritorio.
- Arte parametrizado por etapa (baby, juvenile, adult, final).
- Salas isométricas renderizadas con **PixiJS como núcleo compartido** (`shared/scene`), con la sala completa a la vista (corte tipo casa de muñecas). El arte se sigue escribiendo en SVG procedural y se rasteriza.
- **Decisión (2026-11-17):** la escena de PixiJS se incrusta en las tres plataformas.
  - Escritorio: Tauri, de forma directa.
  - Android: WebView + WebViewAssetLoader.
  - iOS: WKWebView.
  - Se comunica con la app nativa por un protocolo tipado de mensajes.
  - Los menús siguen nativos. Los widgets (PetWidget y WidgetKit) siguen nativos con PNG pre-horneado.
  - Sustituye a la spec `027-ios-skia` (motor Rust/Skia) y al plan de Compose Canvas.
- Muebles con huella W×D que el usuario coloca y gira; el Pockai pasea con A* y usa los muebles.

Además, convertir `pockai-architect` en una skill que **dibuja el arte real** y lo revisa visualmente, y crear una skill hermana para muebles y salas. El conocimiento isométrico va en nuestras skills, sin reinstalar las de terceros: se revirtieron en el PR #95 por ruido.

Entrega **por fases, un PR por fase**. Cada fase se puede revisar y fusionar por separado.

---

## Convenciones isométricas (se fijan en la fase 1 y las usan todas las demás)
- **Proyección dimétrica 2:1.** Cada celda es un rombo de 32×16 px a escala 1. Pantalla: `sx = (x − y)·16`, `sy = (x + y)·8`. Una sala de 14×10 ocupa unos 384×192 px de suelo, más ~120 px de paredes. Escenario de ~400 px de alto.
- **Orden de profundidad:** `depth = x + y` del vértice más cercano de la huella; si empatan, se ordena por altura. Lo aplica una función común `isoDepth()`.
- **Luz fija arriba a la izquierda.** Las caras superiores son claras, la izquierda media y la derecha oscura (tres tonos del mismo color). Se mantiene el contorno `#1A1A1A` de pegatina (GUIA §1).
- **Sprite 3/4:** el frame sigue siendo de 128×128 y el suelo sigue en y = 120. La sombra pasa a ser una elipse isométrica (relación 2:1). Mira hacia abajo a la derecha, y abajo a la izquierda se consigue con `scaleX(-1)` (ya existe en PetView y HabitatTab).

---

## Fase 1: guía y skills (PR 1)
**Documentación**
- `docs/GUIA_ARTISTICA.md`: nuevo **§7.4 Isométrico**, con la proyección, la luz, los tres tonos por cara, la plantilla 3/4 que sustituye a §7.1 y la escala del Pockai dentro de la sala (unos 72 px de alto). Actualizar §12 (deuda): se quitan los emoji de muebles cuando llegue la fase 4.
- `docs/ART_PIPELINE.md`: hojas por etapa y arte de muebles.

**Skill `pockai-architect`** (`.claude/skills/pockai-architect/`)
- `SKILL.md`:
  - Pulir la `description` para que se dispare también con "rediseña el arte de X", "dibuja el sprite de X" o "evoluciones de X".
  - Nuevo paso **"Dibujar el arte"** entre la integración y la validación. Escribe el `SpeciesArt` 3/4 con `stage`, ejecuta `pnpm generate:sprites` y **revisa la hoja de contactos** (Read del PNG) contra una checklist: silueta legible a 64 px, cara sin patrón, partes móviles, coherencia entre etapas.
  - El cierre ya no deja el arte como TODO.
  - Las preguntas del paso 2 incluyen "rasgo que cambia con la evolución".
- `references/art-brief.md`: se reescribe para 3/4. Incluye las anclas de cara desplazadas hacia el lado visible, qué ojo se ve más pequeño, el parámetro `stage` (proporción cabeza/cuerpo, tamaño de apéndices, accesorio de etapa final) y ejemplos con ignisaur.
- Nuevo `references/iso-style.md`: un resumen de §7.4 orientado a dibujar, con los errores típicos (perspectiva incoherente, sombra circular, patrón sobre la cara).
- `references/sheet-template.md`: se añade la sección "Evolución visual" (qué cambia en cada etapa).
- `references/integration-checklist.md`: añadir las hojas por etapa y el paso de revisión visual.
- Nuevo `scripts/contact_sheet.mjs <id>`: compone un PNG con los clips clave (idle, walk, eat, happy, sleep, attack) × 4 etapas, para revisarlo visualmente. Reutiliza Resvg igual que `scripts/generate-pet-sprites.ts`.
- `scripts/check_species.mjs`: comprobar que existen las hojas de las 4 etapas y que la cara no cae en la zona de patrón (canal B de la máscara bajo las anclas).
- `placeholder_svgs.mjs`: plantilla 3/4 en lugar del círculo frontal.
- Probar la skill con `anthropic-skills:skill-creator`: 2-3 evals (una especie de un elemento nuevo, un rediseño de arte, una petición vaga) y ajustar la description.

**Skill nueva `pockai-habitat-architect`** (`.claude/skills/pockai-habitat-architect/`)
- Diseña muebles y salas:
  - Entrada en `habitats.json` con `footprint`, `mount` (suelo/pared), `interaction` y buffs dentro de `buffCaps`.
  - Arte SVG isométrico en `scripts/sprites/furniture.ts`.
  - Generación y revisión de la hoja de contactos con las 2 orientaciones.
  - Validación.
- Referencias:
  - `furniture-schema.md`: campos y huellas habituales.
  - `iso-furniture-brief.md`: caja base, tres tonos, contorno y punto de anclaje.
  - `balance.md`: precios y buffs frente a los topes.
  - `integration-checklist.md`.

## Fase 2: núcleo `shared/scene` (PixiJS) y bake compartido (PR 2)
- Paquete nuevo `shared/scene` (`@pockai/scene`): PixiJS v8 y TypeScript, build en modo librería con Vite. Se consume como ESM desde el escritorio y como bundle IIFE autocontenido (`dist/embed/index.html` + JS + assets) para los WebView.
- `src/bake/`: el bake de máscara, paleta y patrón (antes en `desktop/src/lib/sprites.ts`) pasa a ser una **función pura compartida** (`bakePixels`) que corre en CPU una vez por mascota (~60 ms) y se sube como textura. Es exacta en todas las plataformas; un filtro WebGL queda como optimización si el perfilado en gama baja lo pide. Mismas reglas: R/G mezclan primario y secundario, B proyecta el patrón con desplazamiento por `visualSeed` (Mulberry32), y se respetan las líneas negras y los brillos blancos. El escritorio ya usa esta misma función, así que la paridad está garantizada por construcción.
- `src/pet/PetSprite.ts`: lee `anim.json` (frameTags), reproduce clips con su `ms` y loop, y aplica espejo.
- `src/protocol.ts`: tipos de los mensajes de entrada y salida.
  - Entrada: `setPet`, `setHabitat`, `setTheme`, `setMode`, `playClip`.
  - Salida: `ready`, `petTapped`, `furnitureMoved`, `petDraggedOut`.
  - Incluye el adaptador `bridge.ts`, que detecta `window.chrome.webview`, `AndroidBridge` o `webkit.messageHandlers`.
- `src/embed.ts`: punto de entrada para los WebView.
- Escritorio: `PetMiniAvatar.svelte` pasa a usar la escena (validación del núcleo). `PetView` sigue con el bake de CPU hasta comprobar transparencia y rendimiento.

## Fase 3: sprites 3/4 y etapas (PR 3)
- `scripts/sprites/species.ts`: redibujar `axolunar`, `florabud` e `ignisaur` en 3/4 con `draw(ctx, pose, stage)` y `stageParams`. La cara va con un rol sin canal B, para que el patrón no la pise.
- `scripts/sprites/egg.ts`, `draw.ts`: sombra isométrica (24×12 en y = 114) y ojo lejano más estrecho.
- `generate-pet-sprites.ts`: adult en la raíz `species/<id>/` (sin duplicar) y `species/<id>/{baby,juvenile,final}/`; `validate-assets.js` valida cada etapa y `build-assets` las descubre solo. **Hecho (fase 3).**
- `shared/scene` y los clientes cargan la hoja por `(especie, etapa)`, con caída a adult y luego a `ignisaur`.

## Fase 4: backend de colocación (PR 4) — hecha
Sin cambios respecto a la "Fase 3" anterior:
- `footprint`, `mount`, `interaction` y `theme` en `habitats.json` y en su esquema zod.
- `rotation` en Prisma y validación de huella.
- `PATCH /habitat/items/:id`, OpenAPI y tests.

## Fase 5: sala isométrica en `shared/scene` + escritorio (PR 5) — hecha
- En `shared/scene/src/iso/`: `projection.ts`, `pathfind.ts` (A*). El `petWander.ts` previsto (necesidades → mueble con `interaction`) no llegó a existir: el paseo vive en `IsoRoom.wander()` y elige al azar. Queda pendiente en la fase 2 del anexo A de `docs/specs/spec-37-mejoras-cerebro-pockai.md`.
- `src/room/IsoRoom.ts`: paredes, suelo con el tema, contenedor con `sortableChildren` ordenado por `isoDepth`, modo edición (arrastrar, giro con R o botón, huella verde/roja), modo noche y `prefers-reduced-motion`. Además, un culling de bucle: `ticker.stop()` cuando la escena no se ve.
- Arte de muebles: `scripts/sprites/furniture.ts` → `shared/assets/furniture/<id>_{a,b}.svg`, rasterizado a un atlas, más la hoja de contactos de muebles.
- Escritorio: `HabitatTab.svelte` y `HomeScene.svelte` montan la escena y traducen los eventos a la API (`moveFurniture`). Se mantiene el arrastre del Pockai al escritorio. Se elimina `FURN_ICON`.

## Fase 6: Android con escena incrustada (PR 6) — hecha
- `PockaiSceneView` (Compose `AndroidView`) con `WebView`, `WebViewAssetLoader` (bundle en `assets/scene/`) y `addJavascriptInterface("AndroidBridge")`.
- `HabitatScreen.kt` y Home la usan. La escena se pausa en `onPause`, y se usa un modo de calidad baja según la RAM disponible.
- `PetWidget` sigue nativo, con la PNG adult/idle pre-horneada.
- La tarea de Gradle copia `shared/scene/dist/embed` a los assets.

## Fase 7: iOS (PR 7) — pendiente (aplazada el 2026-11-17)
No hay cliente iOS todavía; se hará cuando exista (ver `docs/PENDIENTES.md`, ISO-IOS). Lo necesario:
- Un `WKWebView` con el mismo bundle (`shared/scene/dist/embed`) servido desde la app, sin red. Por ejemplo, con un `WKURLSchemeHandler` propio, porque `file://` no admite módulos ES.
- `WKScriptMessageHandler` con el nombre `pockai` (la escena ya lo detecta en `shared/scene/src/bridge.ts`) y el envío con `evaluateJavaScript("window.pockaiScene.receive(...)")`. Como modelo, `SceneController` y `SceneMessages` de Android.
- WidgetKit y Live Activity nativos con PNG (no admiten WebView).
- La spec `027-ios-skia` ya está marcada como sustituida.

---

## Verificación
- **Fase 1:**
  - Ejecutar las evals de skill-creator y revisar el resultado.
  - Ejecutar `node .claude/skills/pockai-architect/scripts/check_species.mjs` y `contact_sheet.mjs ignisaur` (PNG legible).
- **Fase 2:**
  - Ejecutar `pnpm generate:sprites`, `node scripts/validate-assets.js` y `node scripts/validate-game-data.js`.
  - Revisar las hojas de contactos de las 3 especies × 4 etapas.
  - Probar en `preview_start pockai-desktop-dev`: la mascota flotante camina en espejo y el bake cambia con la etapa (dev-seed con mascotas de cada etapa).
- **Fase 3:**
  - Ejecutar los tests de backend (`pnpm --filter backend test`, e2e de hábitat) y la migración de Prisma en local.
  - Casos: colisión de huella, fuera de rejilla, mueble de pared y rotación.
- **Fase 4:**
  - Probar en el navegador con el backend `petai-backend` y el desktop dev: colocar, girar y mover muebles.
  - Comprobar que el orden de profundidad es correcto con el Pockai detrás o delante de la cama, que el A* esquiva los muebles y que el Pockai va a la cama cuando duerme.
  - Comprobar el modo noche y los temas de las 4 salas; hacer capturas.
- **Fase 5:**
  - Hacer el build de Android y probarlo en el emulador; captura de la sala.
