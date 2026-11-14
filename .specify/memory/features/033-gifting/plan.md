# Implementation Plan: Gifting & Care Packages

**Branch**: `[033-gifting]` | **Date**: 2025-02-02 | **Spec**: `./spec.md`

## Summary

Economía social colaborativa: transferencia de items entre jugadores (gifts), care packages para pets enfermos y group feeding (room de cocina). Tres servicios especializados (gifting, care-package, group-feeding) sobre un controlador, con rate limits por día, transferencia sin duplicación y WS events.

## Technical Context

- **Language/Version**: TypeScript (NestJS 10)
- **Primary Dependencies**: `@nestjs/common`, Prisma, `Prisma.$transaction`, `RealtimeGateway`
- **Storage**: PostgreSQL (`Gift`, `CarePackage`, `GroupSession`)
- **Testing**: Jest (unit de rate limits y reparto; integration de send→accept)
- **Target Platform**: backend server
- **Performance Goals**: send <400ms p95 (transacción)
- **Constraints**: sin duplicación de items; rate limits estrictos
- **Scale/Scope**: 1 módulo, 5 archivos

## Project Structure

```text
backend/src/modules/gifting/
├── gifting.module.ts
├── gifting.controller.ts
├── gifting.service.ts
├── care-package.service.ts
└── group-feeding.service.ts
```

**Structure Decision**: Módulo con 3 servicios especializados (gifting, care, group-feeding) para separar responsabilidades; el controller expone los endpoints.

## Complexity Tracking

Sin violaciones de constitución: reutiliza inventario y realtime; transacciones para atomicidad de la transferencia.
