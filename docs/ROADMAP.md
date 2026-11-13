# PetAI — Roadmap de Implementación

Este documento detalla el desglose por fases, los hitos clave, los entregables de cada etapa y los criterios de aceptación para el proyecto PetAI.

---

## Estado Global del Proyecto

| Fase | Título | Estado | Objetivo Principal |
|---|---|---|---|
| **Fase 0** | Preparación y Monorepo | ✅ Completada | Inicialización de repos, datos compartidos, docker-compose y CI |
| **Fase 1** | Núcleo Backend + Escritorio | ✅ Completada | Ciclo básico: Registro, Eclosión, Cuidado, Sprite interactivo |
| **Fase 2** | Mecánicas de Juego | ✅ Completada | Minijuegos, tienda, evolución y estados de salud |
| **Fase 3** | Inteligencia Artificial (IA) | 🔄 En curso (charla, memoria y agente ✅) | Conexión BYOK/Hermes, streaming SSE, memoria y herramientas |
| **Fase 4** | Peleas Asíncronas | ⏳ Pendiente | Motor determinista, emparejamiento ELO y repeticiones |
| **Fase 5** | Clientes Móviles Nativos | ⏳ Pendiente | Android (Jetpack Compose M3) e iOS (SwiftUI Liquid Glass) |
| **Fase 6** | Pulido y Lanzamiento | ⏳ Pendiente | Seguridad, balance, optimización, tiendas y despliegue |

---

## Fase 0 — Preparación y Monorepo
- [x] Inicialización de Git y `.gitignore` multiplataforma (Node, Rust/Tauri, Android, iOS).
- [x] Definición de `docs/` (`ROADMAP.md`, `GAME_DESIGN.md`, `API.md`).
- [x] Configuración de datos de juego compartidos en `shared/game-data/` (`species.json`, `patterns.json`, `foods.json`, `balance.json`).
- [x] Placeholders iniciales de sprites en `shared/assets/sprites/`.
- [x] `docker-compose.yml` para PostgreSQL y Redis, y `.env.example`.
- [x] Workflow de GitHub Actions (`.github/workflows/ci.yml`).

---

## Fase 1 — Núcleo del Backend + Mascota de Escritorio
- **Backend (NestJS + Prisma)**:
  - Configuración con variables de entorno validadas con Zod.
  - Esquema de base de datos Prisma y migraciones.
  - Carga de semillas (seeds) de `shared/game-data/`.
  - Módulos: `auth` (Argon2id + JWT access/refresh), `users`, `game-data`, `hatching` (rareza, patrón, pity), `pets` (tick perezoso, alimentar, dormir, curar), `inventory`/`shop` básico.
  - Gateway WebSocket (`/realtime`) para emitir `pet:update`.
  - Exportación de OpenAPI a `shared/openapi/openapi.json`.
- **Escritorio (Tauri 2 + Svelte/TS)**:
  - Ventana transparente siempre visible sin marco.
  - Bucle de detección de cursor para clics a través de la ventana (*click-through* inteligente).
  - Renderizador `PetView` con capas compuestas: sprite base + máscara de patrón + paleta de color.
  - Máquina de estados: caminar, sentarse, comer, dormir.
  - Panel de control auxiliar: registro/login, eclosión animada, estado vital y comida.
- **Criterio de éxito**: Registrar una cuenta en el panel de escritorio, eclosionar un huevo con animación, ver a la criatura caminar por la pantalla, alimentarla y comprobar que sus estadísticas varían en tiempo real con persistencia en el backend.

---

## Fase 2 — Mecánicas de Juego
- **Backend** ✅:
  - [x] Módulo `minigames`: sesiones con seed del servidor, un solo uso, caducidad, cooldown, límite diario y validación de puntuaciones (duración mínima y máximo por segundo).
  - [x] Tienda completa con compras atómicas y consumo de inventario validado por tipo.
  - [x] Ciclo de sueño sincronizado con la zona horaria del usuario.
  - [x] Sistema de evolución por etapas (bebé nivel 1, joven nivel 10, adulto nivel 25, forma final nivel 50 con `evolution_stone`).
- **Escritorio** ✅:
  - [x] Implementación de 3 minijuegos: Atrapa la comida, Parejas de memoria y Reflejos (pestaña "Juegos", semilla del servidor).
  - [x] Notificaciones nativas del sistema (plugin Tauri) cuando la mascota requiere atención, con cooldown de 30 min por tipo.

---

## Fase 3 — Inteligencia Artificial (IA)
- **Backend** (charla, memoria y agente ✅):
  - [x] Proveedor agnóstico `LlmProvider` y `OpenAiCompatibleProvider` (OpenAI y Hermes Agent remoto por HTTPS).
  - [x] Cifrado AES-256-GCM de API keys (BYOK); la key nunca se devuelve, solo una máscara.
  - [x] Protección SSRF en `baseUrl` (HTTPS, sin credenciales, sin rangos privados; revalidada en cada uso; sin redirecciones).
  - [x] Streaming por Server-Sent Events, historial, límite de 20 mensajes/min y validación de entrada.
  - [x] Personalidad dinámica según especie, carácter, estado de ánimo y estadísticas; `intelligence` sube al conversar.
  - [x] Memoria contextual a largo plazo (`PetMemory`, intelligence ≥ 200): resumen y hechos extraídos en segundo plano cada 6 mensajes, recuperación por relevancia en el prompt, filtro de datos sensibles y control del usuario (ver y olvidar).
  - [x] Function Calling / agente (intelligence ≥ 500): `get_my_status`, `request_food`, `suggest_minigame`, `search_memory`, `list_reminders` y `create_reminder`. Las herramientas con efectos no se ejecutan hasta que el usuario confirma una tarjeta (acciones pendientes con caducidad de 10 min, argumentos validados y resumen generado por el servidor). Recordatorios con entrega.
  - [ ] Moderación de contenido, cuotas mensuales (Redis) y modo suscripción.
- **Escritorio**:
  - [x] Pestaña "IA": ajustes BYOK, prueba de conexión, chat en streaming y lista de recuerdos (con olvidar uno o todos).
  - [x] Burbuja de chat flotante sobre el sprite.
  - [ ] Modo Hermes local directo (`localhost:8642`) sin pasar por el backend.
  - [x] Tarjetas de confirmación para las acciones propuestas por la mascota y entrega de recordatorios con notificación nativa.
  - [ ] Herramientas del escritorio `open_url` y `read_clipboard` (siempre con confirmación).

---

## Fase 4 — Peleas Asíncronas
- **Backend**:
  - Motor de combate por turnos 100% determinista basado en semillas fijas.
  - Sistema de ELO, ligas y tabla de líderes en Redis.
  - Generación de registro de repetición (`log json`).
- **Escritorio**:
  - Interfaz de Arena y visualizador de repeticiones animadas.

---

## Fase 5 — Clientes Móviles Nativos
- **Android**: Jetpack Compose con Material 3 Expressive, widgets Glance y Play Billing.
- **iOS**: SwiftUI con Liquid Glass para iOS 27, Live Activities y StoreKit 2.
- **Sincronización**: Código de vinculación de dispositivos para sincronizar escritorio y móviles.

---

## Fase 6 — Pulido y Lanzamiento
- Empaquetado instalable para Windows (MSIX/NSIS) y macOS (.dmg).
- Pruebas de estrés y auditoría de seguridad.
- Documentación de despliegue en producción.
