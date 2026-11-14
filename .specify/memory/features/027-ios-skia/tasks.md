# Tasks: iOS + Cross-Platform Animation (Skia)

## Asset Pipeline (entregado)

- [x] T1: Crear `shared/assets/animation-specs.json` (formato AnimationSpec: frames, fps, easing, triggers) para los 3 species.
- [x] T2: Crear `scripts/validate-animations.ts` (valida specs: frames, fps, easing, triggers, huérfanos).
- [x] T3: Revisar/actualizar `shared/game-data/` si el spec de animaciones requiere metadatos.

## Motor (Rust) — cliente

- [ ] T4: `petai-skia` crate: `AnimationSpec` (parse + validation).
- [ ] T5: `FramePlayer` (fps, easing, triggers, state machine).
- [ ] T6: `SpriteRenderer` (SVG → path → rasterize) + `PaletteSystem`.
- [ ] T7: Backend wgpu (Tauri) + integración en `main.rs`.
- [ ] T8: Backend JNI (Android) + SurfaceView/TextureView.
- [ ] T9: Swift Package + MTKView (iOS).

## App iOS (SwiftUI)

- [ ] T10: App iOS: login (Keychain), API client, pet care.
- [ ] T11: iOS: chat IA + battle + minigames.
- [ ] T12: Live Activity (Dynamic Island, iOS 16.2+).
- [ ] T13: WidgetKit (2×2 home screen).
- [ ] T14: APNs push.

## Tests

- [ ] T15: Shared test suite: 10 animaciones, pixel diff < 2% entre las 3 plataformas.
- [ ] T16: Performance: 60fps sostenido 60s.
- [ ] T17: Fallback: device sin GPU → software renderer.
- [ ] T18: CI: `validate-animations.ts` corre en cada PR.

## Dependencias

- Tauri 2.0, `tauri.conf.json`, `main.rs`
- Android Compose, NDK, JNI
- SwiftUI, WidgetKit, ActivityKit
- Skia (`skia-safe`), wgpu, Metal (MTKView)
- `RealtimeGateway`, `PetsService`, `PersonalityService` (backend, sin cambios)
- CDN para `AnimationSpec` + sprites SVG
