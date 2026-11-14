# Spec: Accessibility & Inclusion

## ID
Feature #32 — Oleada 1 "Amplía TAM + goodwill"

## Resumen
Sistema de accesibilidad integral: alto contraste, reducir movimiento, subtítulos en chat IA, minijuegos alternativos sin timing, "modo simple" para niños 6-10, VoiceOver/TalkBack completo, y patrones color-blind friendly. Un pet accesible genera goodwill y viralidad en comunidades de accesibilidad.

## Contexto
Un companion app que **no es accesible** excluye:
- Usuarios con **baja visión** (contraste, tamaño de texto)
- Usuarios con **movimiento reducido/vestibular** (animaciones constantes, partículas)
- Usuarios **sordos** (sonidos sin subtítulos, chat IA por voz)
- Niños 6-10 (UI compleja, texto denso)
- Usuarios con **discapacidad motora** (minijuegos de reflejos imposibles)

PetAI se posiciona como "compañía emocional". Si un grupo de usuarios no puede disfrutar esa compañía, **no es inclusión real**. Además: ampliar TAM (Total Addressable Market) y generar goodwill viral ("este pet es para TODOS").

Conecta con: Todos los sistemas (es transversal). Afecta PetView, ControlPanel, minijuegos, IA, notificaciones, y el feed social.

## Objetivos
- Hacer que **todos** los usuarios (con o sin discapacidad) puedan disfrutar el pet.
- Ampliar TAM sin comprometer la experiencia de usuarios "típicos".
- Generar goodwill y viralidad en comunidades de accesibilidad.
- Cumplir WCAG 2.1 AA como mínimo.
- "Modo simple" que no siente "ridiculización" (diseño bonito, no "aplicación de niños").

## User Stories
- Como usuario con baja visión, quiero alto contraste y texto grande para leer al pet.
- Como usuario con vértigo, quiero poder **desactivar** partículas y animaciones de fondo.
- Como usuario sordo, quiero ver subtítulos de lo que "dice" el pet (burbujas + chat IA).
- Como niño de 7 años, quiero una UI simplificada con botones grandes y textos cortos.
- Como usuario con discapacidad motora, quiero minijuegos que NO dependan de reflejos/timing.
- Como usuario que usa VoiceOver, quiero que todos los elementos tengan labels descriptivos.
- Como usuario con daltonismo, quiero que los patrones tengan **textura** (no solo color).
- Como usuario, quiero activar/desactivar opciones de accesibilidad desde un panel centralizado.

## Criterios de aceptación
- [ ] AC1: **Alto contraste:** Toggle en settings. Cambia tokens de color a contraste ≥ 7:1 (WCAG AAA). Afecta: ControlPanel, PetView (badge), burbujas, botones.
- [ ] AC2: **Reducir movimiento:** Toggle "Reducir animaciones". Desactiva: partículas, parallax, bounce en transiciones, scroll auto. El pet **todavía se mueve** (caminar) pero sin "efectos extra". Sonidos de fondo se desactivan.
- [ ] AC3: **Subtítulos/Transcripción:** El chat IA muestra el texto **siempre** visible (no solo en burbuja temporal). Cada burbuja del pet tiene texto legible ≥14px. Sonidos del pet tienen icono + texto ("♪ está cantando").
- [ ] AC4: **Minijuegos alternativos:** Cada minigame tiene una variante "accesible":
  - `catch_food` → `catch_food_easy`: Comida cae LENTO (2x), zona de captura 3x más grande, sin tiempo límite.
  - `memory_match` → `memory_match_easy`: 4 pares (no 6), sin timeout, hints visibles.
  - `reflex` → `reflex_easy`: Sin timing. "Toca cuando aparezca" sin penalización por tarde.
- [ ] AC5: **"Modo simple" (niños 6-10):** Toggle que activa:
  - Botones 2x más grandes (min 48×48px)
  - Textos cortos (máx 15 palabras por mensaje)
  - Sin tablas, sin barras de progreso complejas (solo emojis)
  - IA responde en frases cortas (máx 2 frases)
  - Colores más saturados, alto contraste
  - Sin "ELO", sin "stats de combate" (solo "gano/perder")
  - Pet más "expresivo" (más burbujas, más actos)
- [ ] AC6: **VoiceOver/TalkBack:** Todos los elementos interactivos tienen `aria-label` descriptivo:
  - Pet: "Mascota [nombre], [especie], nivel [N]. [Estado: feliz/triste/enfermo]. Toca para interactuar."
  - Botones: "Dar de comer", "Bañar", "Jugar", "Dormir"
## Diseño de UX

### Flujos de usuario

#### Panel de accesibilidad
```
[ControlPanel → Settings → "Accesibilidad"]
  [✓] Alto contraste
  [✓] Reducir animaciones (vestibular)
  [ ] Modo simple (UI simplificada)
  [✓] Subtítulos siempre visibles
  [ ] Minijuegos accesibles
  [ ] Reducir vibración (mobile)
  [Aplicar] [Restablecer]
```

#### Alto contraste + reduced motion
- Colores saturados, borde grueso en pet
- Partículas: NONE
- Transiciones: crossfade (200ms)
- Burbujas: 16px, persistentes (hasta click)
- Badge: sólido, borde 2px

#### Minijuego accesible (catch_food_easy)
- Comida cae LENTO (2x), zona 3x más grande, sin tiempo límite

#### Modo simple (niños 6-10)
- Botones 56×56px, textos 16px, máx 15 palabras/mensaje
- Sin ELO, sin stats complejas → "Ganó 3 peleas ⚔️"
- IA: frases cortas, emojis, sin conceptos complejos
- Colores saturados, pet más expresivo

### Design tokens

| Token | Normal | HC | Simple |
|---|---|---|---|
| text-size | 13px | 16px | 16px |
| btn-size | 32px | 40px | 56px |
| contrast | 4.5:1 | 7:1 | 7:1 |
| particles | yes | no | reduced |
| transition | bounce | fade | fade |

## Diseño técnico

### Backend

**`User.accessibilityPrefs`** (Json):
```json
{
  "highContrast": true, "reduceMotion": true, "simpleMode": false,
  "subtitlesAlways": true, "accessibleMinigames": false,
  "reduceHaptics": false, "textScale": 1.0
}
```

**IA adaptation (simple mode):** Prompt: "Responde en máx 2 frases cortas. Usa emojis. No menciones ELO, stats, ni números."

### Frontend

- `AccessibilityPanel.svelte` — Toggles + preview en vivo
- CSS custom properties (`--petai-text-size`, `--petai-btn-size`, etc.)
- `PetView.svelte`: reduceMotion → `transition:none`, HC → `filter:contrast(1.3)`
- Minijuegos: variantes accesibles (speed ×0.5, zone ×3, time ×2)
- ARIA: `role="img"` en pet, `aria-label` en botones, `aria-live="polite"` en burbujas
- Keyboard: F=feed, C=clean, J=play, S=sleep

## Interfaz de API

### `PATCH /me`
Request: `{ "accessibilityPrefs": { "highContrast": true, "simpleMode": false, ... } }`
Response 200: `{ "ok": true }`

### `GET /me`
Response incluye: `accessibilityPrefs: { ... }`

## Modelo de datos
- `User`: campo `accessibilityPrefs Json?` (patrón similar a `notificationPrefs`)
- Sin modelos nuevos.

## Eventos y sincronización
- Sin WS events específicos (prefs estáticas).
- `user:prefs-updated` → client recalcula UI si cambia simpleMode.

## IA y personalización
- **Simple mode:** "Responde en máx 2 frases. Usa emojis. Usuario es niño 6-10. No menciones stats/ELO."
- **Reduce motion / HC:** No afecta IA (es visual/sensorial).

## Dependencias
- **Transversal:** Afecta todos los componentes.
- Tauri settings, OS `prefers-reduced-motion`
- IA prompt adaptation
- Minijuegos (3 variantes)

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Design tokens + CSS vars + `accessibility.json` | 1 día |
| 2 | `AccessibilityPanel` + PATCH /me | 1.5 días |
| 3 | Alto contraste + reduce motion | 2 días |
| 4 | ARIA + keyboard nav + shortcuts | 1.5 días |
| 5 | Minijuegos accesibles (3 variantes) | 2 días |
| 6 | Modo simple (UI + IA) | 2 días |
| 7 | Color-blind patterns (textura) | 1 día |
| 8 | Tests (a11y audit, screen reader) | 1.5 días |

**Total: ~12.5 días**

## Métricas de éxito
- **WCAG 2.1 AA:** 100% elementos pasan axe-core
- **Usage:** >10% usuarios activan ≥1 toggle
- **Simple mode retention:** Kids 6-10 → 40% D7
- **NPS:** "¿Puedes jugar sin dificultad?" → 8/10
- **Viralidad:** >5 posts en r/accessibility

## Tests
- **A11y:** axe-core, Lighthouse ≥95
- **Screen reader:** VoiceOver + TalkBack (todos flujos)
- **Keyboard:** Todo navegable sin mouse
- **Color-blind:** Simulador protanopia/deuteranopia/tritanopia
- **E2E:** HC → colores, reduce motion → sin partículas
- **User testing:** 5 baja visión, 5 vértigo, 5 niños 6-10

## Riesgos y notas
- **Perf:** HC puede forzar repaints. Verificar 60fps.
- **Simplificación vs richness:** Modo simple NO es "menos". Es diseño limpio.
- **Multi-device:** Prefs sync via `PATCH /me`.
- **Reduced motion ≠ pet estático:** Pet SIEMPRE camina. Sin "efectos extra".
- **OS fallback:** `prefers-reduced-motion` → reduce motion por defecto.

## Preguntas abiertas
1. ¿Modo dark además de HC? → **v2**.
2. ¿Modo simple afecta todos los pets? → **SÍ** (UI global).
3. ¿Compartir config de a11y? → **NO** (personal).
4. ¿Minijuegos accesibles dan mismos rewards? → **SÍ**.
5. ¿Pet "notifica" modo simple? → **NO** (invisible para el pet).
### Datos de juego

**`shared/game-data/accessibility.json`:**
```json
{
  "highContrast": { "minRatio": 7, "textMin": 16 },
  "simpleMode": { "btnSize": 56, "textMax": 15, "aiMaxSentences": 2 },
  "minigames": {
    "catch_food": { "speedMul": 0.5, "zoneMul": 3, "timeMul": 2 },
    "memory_match": { "pairs": 4, "timeout": null, "hints": true },
    "reflex": { "timing": false, "penalty": 0 }
  },
  "shortcuts": { "feed": "F", "clean": "C", "play": "J", "sleep": "S" }
}
```
  - Stats: "Hambre: 70 de 100", "Felicidad: 45 de 100"
  - Panel: "Panel de control de [nombre]. [N] botones disponibles."
- [ ] AC7: **Dynamic Type / Scaling:** El texto escala con el sistema OS (macOS: Text Size, Windows: Display Scaling). Máx escala: 200%. El layout no se rompe (wrap, no overflow).
- [ ] AC8: **Color-blind friendly:** Patrones de pets usan **textura + color** (no solo color). Se detecta con simulador de daltonismo (protanopia, deuteranopia, tritanopia). Elementos de UI usan icono + texto (no solo color).
- [ ] AC9: **Panel centralizado:** `ControlPanel → Settings → Accesibilidad`. Todos los toggles en un solo lugar. Se persisten en `User.accessibilityPrefs`.
- [ ] AC10: **No "ridiculización":** El "modo simple" no es un "modo infantil". Es un diseño **bonito y limpio** que también funciona para adultos con necesidades cognitivas. El pet no "cambia de personalidad", solo la UI se simplifica.
- [ ] AC11: **Keyboard navigation:** Todo es navegable con teclado (Tab, Enter, Space). El pet se puede "cuidar" sin mouse (atajos: F=feed, C=clean, J=play, S=sleep).
- [ ] AC12: **Reduced haptics:** Toggle "Reducir vibración" (mobile). Haptics se reducen a mínimo.