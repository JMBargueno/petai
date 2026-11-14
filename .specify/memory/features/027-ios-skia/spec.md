# Feature Specification: iOS Support + Cross-Platform Animation (Skia)

**Feature Branch**: `027-ios-skia`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "App iOS nativa (SwiftUI) con Live Activity en Dynamic Island y WidgetKit, más motor de animación unificado en Rust (Skia/wgpu) que compila para Tauri, Android (JNI) e iOS (MTKView). Un AnimationSpec JSON controla las animaciones en las 3 plataformas con pixel diff < 2%."

> Nota: esta feature es predominantemente de configuración + asset pipeline + validación de
> animaciones. El backend no se modifica (el motor Skia es 100% client-side). Aquí se entrega
> el SDD, el formato `AnimationSpec` (`animation-specs.json`) y el script de validación.

## User Scenarios & Testing

### User Story 1 - Definir una animación una vez (Priority: P1)

Como dev, quiero definir una animación una vez (AnimationSpec JSON) para que se vea igual en las 3 plataformas.

**Why this priority**: Es el núcleo del motor unificado.

**Independent Test**: `scripts/validate-animations.ts` valida `animation-specs.json` (frames, fps, easing, triggers).

**Acceptance Scenarios**:
1. **Given** un AnimationSpec válido, **When** se valida, **Then** pasa sin errores.
2. **Given** un spec con un trigger que apunta a un frame inexistente, **When** se valida, **Then** falla con un mensaje claro.

---

### User Story 2 - App iOS funcional (Priority: P1)

Como jugador iOS, quiero instalar PetAI en mi iPhone (login, care, chat, battle).

**Independent Test**: La app compila y completa el flujo login → care → chat.

**Acceptance Scenarios**:
1. **Given** un iPhone con iOS 16.2+, **When** instalo y uso PetAI, **Then** login/care/chat funcionan.
2. **Given** un spec de animación, **When** se renderiza en MTKView, **Then** 60fps.

---

### User Story 3 - Live Activity + Widget (Priority: P2)

Como jugador, quiero ver mi pet en la Dynamic Island y un widget 2×2 en el home screen.

**Independent Test**: Live Activity muestra stats (hunger, happiness) + mood; widget muestra level + element.

### Edge Cases

- Device sin GPU → software renderer (30fps, acceptable).
- iOS < 16.2 → sin Live Activity (fallback 14).
- Pixel diff > 2% entre plataformas → alerta en test suite.

## Requirements

### Functional Requirements

- **FR-001**: `AnimationSpec` JSON DEBE contener frames, fps, easing y triggers; validable por `validate-animations.ts`.
- **FR-002**: El motor `petai-skia` (Rust) DEBE soportar backends wgpu (Tauri), JNI (Android) y MTKView (iOS).
- **FR-003**: Un spec DEBE renderizarse con pixel diff < 2% entre las 3 plataformas.
- **FR-004**: App iOS: login, pet care, chat IA, battle, minigames.
- **FR-005**: Live Activity (Dynamic Island): stats + mood icon.
- **FR-006**: WidgetKit: widget 2×2 con pet + level + element.
- **FR-007**: Transiciones de estado (idle→walk→attack→hit→victory, 10+ states) vía triggers.
- **FR-008**: Fallback a software renderer si el device no soporta GPU accelerated.

### Key Entities

- **AnimationSpec**: `{ id, species, states: { [name]: { frames, fps, easing, loop, triggers } } }`.
- **AnimationTrigger**: `{ on, to, frames, easing, once? }` — cambio de estado.
- **Shared test suite**: 10 animaciones, pixel diff < 2%.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 60fps sostenido 60s en M1/M2, Snapdragon 8 Gen, i5+.
- **SC-002**: Pixel diff < 2% entre Tauri/Android/iOS para las 10 animaciones del test suite.
- **SC-003**: `validate-animations.ts` detecta specs inválidos (frames vacíos, fps inválido, trigger roto).
- **SC-004**: Un `AnimationSpec` se sirve de CDN con hash (integrity); no inyecta código.

## Assumptions

- El motor Skia corre client-side; el backend (RealtimeGateway/PetsService) no cambia.
- Los sprites SVG + palette usan el mismo sistema que Tauri actual.
- `animation-specs.json` se valida en CI antes de servir por CDN.
