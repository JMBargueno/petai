# Spec: iOS Support + Cross-Platform Animation (Skia)

## ID
27 — Oleada 3 "Comunidad + Ecosistema" (NUEVAS_FUNCIONALIDADES §27)

## Resumen
App iOS nativa (SwiftUI) con Live Activity en Dynamic Island y WidgetKit, más motor de animación unificado en Rust (Skia/wgpu) que compila para Tauri (wgpu), Android (JNI→SurfaceView), e iOS (Swift Package→MTKView). Un `AnimationSpec` JSON controla las animaciones en las 3 plataformas con pixel diff < 2%.

## Contexto
PetAI hoy existe en Desktop (Tauri/WebView) y Android (Compose). No hay iOS, que es el target #1 para companion apps. Las animaciones actuales se hacen en CSS/SVG dentro del WebView, lo que da inconsistencias entre plataformas y no permite 60fps consistente. Un motor de animación en Rust con Skia unifica: un solo spec de animación → renderizado nativo en las 3 plataformas.

Conecta con: Tauri architecture (`Cargo.toml`, `main.rs`), Android Compose (existing), sprites SVG, `RealtimeGateway` (pet state updates), `PersonalityService` (mood → animation triggers).

## Objetivos
- App iOS funcional: login, pet care, chat, battle, notifications.
- Live Activity: pet visible en Dynamic Island (estado, stats, mood).
- WidgetKit: widget home screen con pet + stats.
- Motor animación Rust unificado: Tauri (wgpu), Android (JNI), iOS (MTKView).
- `AnimationSpec` JSON: una definición → 3 plataformas, pixel diff < 2%.
- 60fps consistente en las 3 plataformas.

## User Stories
- Como jugador iOS, quiero instalar PetAI en mi iPhone, para tener mi pet conmigo.
- Como jugador, quiero ver mi pet en la Dynamic Island, para un glance sin abrir la app.
- Como jugador, quiero un widget con mi pet en el home screen, para un acceso rápido.
- Como dev, quiero definir una animación una vez (JSON), para que se vea igual en las 3 plataformas.
- Como jugador, quiero animaciones a 60fps en cualquier device, para que se sienta fluida.
- Como dev, quiero un test suite shared, para verificar consistencia visual entre plataformas.

## Criterios de aceptación
- [ ] AC1: App iOS: login, pet care (feed/play/clean), chat IA, battle, minigames.
- [ ] AC2: Live Activity: pet en Dynamic Island con stats (hunger, happiness) + mood icon.
- [ ] AC3: WidgetKit: widget home screen 2×2 con pet + level + element.
- [ ] AC4: Motor animación Rust: `petai-skia` crate con backends wgpu/JNI/MTL.
- [ ] AC5: `AnimationSpec` JSON: frames, fps, easing, triggers. Un spec → 3 plataformas.
- [ ] AC6: 60fps en: M1/M2 (iOS), Snapdragon 8 Gen (Android), i5+ (Desktop).
- [ ] AC7: Test suite: 10 animaciones, pixel diff < 2% entre las 3 plataformas.
- [ ] AC8: Transiciones de estado: idle→walk→attack→hit→victory (10+ states).
- [ ] AC9: El motor renderiza sprites SVG + palette (mismo sistema que Tauri actual).
- [ ] AC10: Fallback: si el device no soporta GPU accelerated, usar software renderer (lower quality).

## Diseño técnico

### Arquitectura del Motor Skia
```
┌─────────────────────────────────────────────────────────────────────┐
│  petai-skia (Rust crate) — core engine                              │
│                                                                     │
│  ├── AnimationSpec (JSON parse + validation)                       │
│  ├── FramePlayer (fps, easing, triggers, state machine)             │
│  ├── SpriteRenderer (SVG → path → rasterize)                       │
│  ├── PaletteSystem (color interpolation, shiny)                     │
│  └── Backend abstraction:                                          │
│      ├── wgpu::Surface (Tauri desktop)                              │
│      ├── JNI → ANativeWindow (Android SurfaceView/TextureView)      │
│      └── MTKView via Swift Package (iOS)                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Cargo workspace (expandido)
```toml
# petai-skia/Cargo.toml
[package]
name = "petai-skia"

[dependencies]
skia-safe = "1.11"        # Skia bindings
serde_json = "1.0"
wgpu = "0.20"             # WebGPU (Tauri)

[target.'cfg(target_os = "android")'.dependencies]
jni = "0.21"
ndk = "0.9"

[target.'cfg(target_os = "ios")'.dependencies]
# (exposed via Swift Package, no direct deps here)

[target.'cfg(target_os = "macos")'.dependencies]
cocoa = "0.25"
```

### Tauri integration
- `Cargo.toml`: añadir `petai-skia` como dependency.
- `main.rs`: nuevo `tauri::command` → `render_frame(window, animation_spec, state)`.
- Reemplaza el renderizado CSS/SVG del WebView por un wgpu surface overlay.
- Click-through sigue funcionando (hit regions no cambian).

### Android integration
- Swift Package → no. Se usa JNI: Rust compila a `.so` (NDK).
- `SurfaceView` con `ANativeWindow` → wgpu surface.
- `Compose` → `AndroidView { SurfaceView }`.
- Foreground service para animations en background (Live Activity equivalente).

### iOS (SwiftUI)
- **App:** SwiftUI + `UIViewRepresentable` para MTKView (render Skia).
- **Live Activity:** `ActivityAttributes` con pet stats. Dynamic Island: compact → pet icon + mood. Expanded → stats bars.
- **WidgetKit:** `TimelineProvider` → 2×2 widget con pet snapshot + level.
- **Background:** `BGAppRefreshTask` (no real-time, solo updates periódicas).
- **Push:** APNs para notificaciones del pet.
## Interfaz de API
- Sin endpoints nuevos específicos para iOS/Skia. Reutiliza la API existente.
- iOS auth: Keychain storage de tokens (equivalente a Tauri OS keychain).
- APNs: mismo flow que FCM Android (device token → push service).
- Live Activity data: `GET /realtime/pet-state?petId={id}` (poll 30s, o WS).

## Modelo de datos
- Sin cambios en Prisma. iOS usa la misma API.
- `DeviceLink` (existing): platform = `ios` (nuevo valor).
- Live Activity: data en memoria (no persistida), refrescada cada 30s.

## Protocolos y comunicación
- **AnimationSpec JSON:**
```json
{
  "id": "walk_cycle",
  "fps": 12,
  "frames": ["frame_0.svg", "frame_1.svg", ...],
  "palette": { "primary": "#FF6B35", "secondary": "#FFD700" },
  "easing": "linear",
  "triggers": { "start": "state_change:walk", "stop": "state_change:idle" },
  "loop": true,
  "direction": "right"
}
```
- **State machine:** `idle → walk → attack → hit → victory → idle`.
- **Cross-platform sync:** El `AnimationSpec` se distribuye vía CDN (static, versioned).
- **Realtime:** `RealtimeGateway` → `pet:update` → trigger animación.

## Security
- iOS: Keychain para tokens. App Transport Security (TLS 1.3).
- Skia: No ejecuta código dinámico. Solo renderiza assets versionados.
- AnimationSpec: servido de CDN con hash (integrity check). No se puede inyectar código.
- Live Activity: Data mínima (stats), sin tokens en el widget.

## Dependencias
- Tauri 2.0 (existing), `tauri.conf.json`, `main.rs`.
- Android Compose (existing), NDK, JNI.
- SwiftUI, WidgetKit, ActivityKit (iOS 16.2+).
- Skia (`skia-safe`), wgpu, Metal (MTKView).
- `RealtimeGateway`, `PetsService`, `PersonalityService` (backend, no cambia).
- CDN para AnimationSpec JSON + sprites SVG.
- APNs (Apple Push Notifications).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `petai-skia` crate: AnimationSpec + FramePlayer + SpriteRenderer | 5 días |
| 2 | Backend wgpu (Tauri) + integration en main.rs | 3 días |
| 3 | Backend JNI (Android) + SurfaceView integration | 4 días |
| 4 | iOS: Swift Package + MTKView + SwiftUI app | 7 días |
| 5 | iOS: Live Activity (Dynamic Island) | 3 días |
| 6 | iOS: WidgetKit (home screen) | 2 días |
| 7 | iOS: Auth (Keychain) + API client + pet care | 3 días |
| 8 | iOS: Chat IA + Battle + Minigames | 3 días |
| 9 | Test suite shared: 10 animaciones, pixel diff | 3 días |
| 10 | Performance tuning: 60fps en 3 plataformas | 2 días |
| 11 | App Store prep + docs | 2 días |

**Total: ~37 días (~6-8 semanas, paralelizables: Skia core + iOS en paralelo)**

## Performance y escalabilidad
- 60fps: 16.6ms/frame budget. Skia render: ~2-4ms. Easing/compute: <1ms.
- Memory: 1 animation spec × 20 frames × 512×512 RGBA = ~4MB. 5 animations = 20MB.
- Battery (iOS): Live Activity ~0.5% battery/hour. MTKView 60fps ~5%/hour.
- wgpu (Tauri): GPU accelerated, same as browser WebGL2 but faster (no WebView overhead).
- Android: ANativeWindow → direct GPU compositing. No WebView.
- Scaling: Motor es local (client-side). Sin impacto en backend.

## Tests
- **Shared test suite:** 10 animaciones (idle, walk, attack, hit, victory, sleep, happy, sad, shiny_sparkle, evolution).
- **Pixel diff:** Render frame N en 3 plataformas → compare → <2% diff.
- **Performance:** 60fps sustained 60s (no thermal throttling).
- **Integration:** AnimationSpec trigger → frame change → correct sprite.
- **iOS:** Live Activity update, Widget refresh, APNs delivery.
- **Tauri:** Click-through sigue funcionando con Skia overlay.
- **Fallback:** Device sin GPU → software renderer → 30fps (acceptable).

## Riesgos y notas
- **Skia en Rust:** `skia-safe` es una binding, no Skia puro. Performance comparable a C++ Skia pero con GC overhead mínimo.
- **wgpu maturity:** wgpu es estable pero tiene diferencias entre drivers (NVIDIA/AMD/Intel). Mitigar: test matrix.
- **iOS App Store:** Review process. Live Activity requiere iOS 16.2+. WidgetKit requiere iOS 14+.
- **Android NDK:** Compilar Rust→.so añade 10-15MB al APK. Aceptable.
- **Consistencia visual:** SVG rendering puede variar entre Skia backends. Mitigar: rasterizar en el backend y enviar bitmaps.
- **Costo iOS:** Dev iPhone + Mac = hardware requirement. App Store fee $99/año.
- **Skia license:** BSD-3, compatible con uso comercial.
- **Maintenance:** 3 plataformas × Skia integration = 3x bug surface.

## Preguntas abiertas
1. ¿Skia puro o `skia-safe` (Rust binding)? → `skia-safe` (ergonomía Rust).
2. ¿Reemplazar completamente el render CSS/SVG del Tauri actual? → Sí (v1 de este spec).
3. ¿iOS: SwiftUI o UIKit? → SwiftUI + UIViewRepresentable para MTKView.
4. ¿Min iOS version? → 16.2 (Live Activity). Fallback 14 (sin Live Activity).
5. ¿AnimationSpec generado por AI? → No v1. v2: AI genera specs para nuevas especies.
6. ¿Cross-platform hot-reload de animaciones? → Sí (CDN versioned, auto-update).