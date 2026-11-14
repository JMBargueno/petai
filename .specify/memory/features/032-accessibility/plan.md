# Implementation Plan: Accessibility & Inclusion

**Branch**: `[032-accessibility]` | **Date**: 2025-02-02 | **Spec**: `./spec.md`

## Summary

Sistema transversal de accesibilidad: un registro de prefs por usuario (persistido) y una config centralizada (`accessibility.json`) que expone los parámetros de alto contraste, modo simple, minijuegos accesibles y atajos. El backend persiste y sirve config; el frontend aplica tokens/ARIA/IA.

## Technical Context

- **Language/Version**: TypeScript (NestJS 10)
- **Primary Dependencies**: `@nestjs/common`, Prisma
- **Storage**: PostgreSQL (`AccessibilityPrefs`); config en `shared/game-data/accessibility.json`
- **Testing**: Jest (unit del clamping y actualización parcial)
- **Target Platform**: backend server
- **Performance Goals**: GET /prefs <100ms
- **Constraints**: prefs personales (no compartibles); actualización parcial
- **Scale/Scope**: 1 módulo, 3 archivos + 1 config JSON

## Project Structure

```text
backend/src/modules/accessibility/
├── accessibility.module.ts
├── accessibility.controller.ts
└── accessibility.service.ts
shared/game-data/accessibility.json   (config de tokens/parámetros)
```

**Structure Decision**: Módulo ligero (config + service). Sin dependencias de otros módulos salvo Prisma.

## Complexity Tracking

Sin violaciones de constitución: solo persistencia y config; toda la lógica de UI es del frontend.
