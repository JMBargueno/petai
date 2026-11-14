# Plan: iOS + Cross-Platform Animation (Skia)

## Arquitectura

```
shared/assets/animation-specs.json   (AnimationSpec: frames, fps, easing, triggers)
scripts/validate-animations.ts       (validación en CI + dev)
petai-skia (Rust crate)              (AnimationSpec → FramePlayer → SpriteRenderer → backend)
  ├── wgpu::Surface                   (Tauri desktop)
  ├── JNI → ANativeWindow            (Android SurfaceView/TextureView)
  └── MTKView via Swift Package      (iOS)
mobile/ios (SwiftUI + WidgetKit + ActivityKit)
```

El backend **no** se modifica: el motor es 100% client-side. `RealtimeGateway` envía los
triggers de estado (mood, vitals) que el FramePlayer consume.

## Formato AnimationSpec

```json
{
  "version": 1,
  "species": "axolunar",
  "states": {
    "idle": {
      "frames": [0, 1, 2, 3],
      "fps": 60,
      "easing": "linear",
      "loop": true,
      "triggers": [
        { "on": "mood=happy", "to": "happy" },
        { "on": "vitals=sleep", "to": "sleep" }
      ]
    },
    "attack": {
      "frames": [18, 19, 20, 21],
      "fps": 60,
      "easing": "easeOutCubic",
      "loop": false,
      "triggers": [{ "on": "finish", "to": "idle" }]
    }
  }
}
```

Campos:
- `frames`: índices (o rangos) de frames del sprite sheet (`anim.json`).
- `fps`: fotogramas por segundo (60 para 60fps; permite < 60 para estados lentos).
- `easing`: `linear | easeInQuad | easeOutCubic | easeInOutSine | elastic`.
- `loop`: bucle o una sola vez.
- `triggers`: transiciones `{ on, to, once? }` donde `on` es un evento del estado del pet.

## Validation (`scripts/validate-animations.ts`)

Reglas:
1. `version` presente y = 1.
2. `species` no vacío.
3. Cada estado: `frames` no vacío y ordenado; `fps` ∈ (0, 240]; `easing` válida; `loop` booleano.
4. Todo `trigger.to` debe referenciar un estado definido.
5. `frames` debe encajar en el rango del sprite sheet (si se provee el `anim.json`).
6. No hay estados huérfanos sin transición de salida (salvo terminales explícitos).

Salida: JSON report `{ ok, errors[], warnings[] }`; exit code 0/1.

## Flujos

### Render (client-side)
1. `FramePlayer` lee el `AnimationSpec` + el sprite sheet (`anim.json` + `base.png`).
2. Al recibir un trigger del estado del pet, resuelve `trigger.to` y cambia de estado.
3. `SpriteRenderer` rasteriza el frame (SVG → path → raster) con la palette.
4. El backend de GPU (wgpu/JNI/MTL) presenta el frame a 60fps.
5. Fallback: si no hay GPU, `software renderer` a 30fps.

### Live Activity (iOS)
1. Se actualiza con los vitals (hunger, happiness) + mood icon (data mínima, sin tokens).

### Widget (iOS)
1. WidgetKit 2×2: pet + level + element; refresco periódico.

## Decisiones de Diseño

- **`skia-safe`** (Rust binding) para ergonomía.
- **Cifrado de integrity**: el `AnimationSpec` se sirve de CDN con hash SHA-256; no inyecta código.
- **Rangos de frames**: se permite `frames: [0, 3]` como abreviación para listas largas.
- **Triggers desde backend**: `RealtimeGateway` publica `pet.state` (mood, vitals) → el FramePlayer los mapea.
