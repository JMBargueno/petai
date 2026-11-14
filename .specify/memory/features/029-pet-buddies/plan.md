# Implementation Plan: Pet Buddies

**Branch**: `[029-pet-buddies]` | **Date**: 2025-01-30 | **Spec**: `./spec.md`

## Summary

Sistema de interacciones espontáneas entre 2 pets del mismo usuario. Un motor de "roll" ponderado elige el tipo de interacción, aplica efectos (bonding + happiness) a ambos pets, respeta cooldown/daily cap y persiste la interacción. Emite evento WS para que el frontend anime.

## Technical Context

- **Language/Version**: TypeScript (NestJS 10)
- **Primary Dependencies**: `@nestjs/common`, Prisma, `PetsService`, `BondingService`, `RealtimeGateway`
- **Storage**: PostgreSQL (modelos `BuddyPair`, `BuddyInteraction`)
- **Testing**: Jest (unit del motor de roll; integration de trigger)
- **Target Platform**: backend server
- **Performance Goals**: trigger <300ms p95
- **Constraints**: sin duplicar logic de stats (delegar a PetsService/BondingService)
- **Scale/Scope**: 1 módulo, 4 archivos

## Project Structure

```text
backend/src/modules/buddies/
├── buddies.module.ts
├── buddies.controller.ts
├── buddies.service.ts
└── interaction-engine.service.ts
```

**Structure Decision**: Módulo de dominio estándar (controller → service → engine), alineado con `seasons`/`minigames`.

## Complexity Tracking

Sin violaciones de constitución: reutiliza servicios existentes, sin nueva infraestructura.
