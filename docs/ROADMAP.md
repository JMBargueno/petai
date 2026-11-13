# PetAI — Roadmap de Implementación

Este documento detalla el desglose por fases, los hitos clave, los entregables de cada etapa y los criterios de aceptación para el proyecto PetAI.

---

## Estado Global del Proyecto

| Fase | Título | Estado | Objetivo Principal |
|---|---|---|---|
| **Fase 0** | Preparación y Monorepo | ✅ Completada | Inicialización de repos, datos compartidos, docker-compose y CI |
| **Fase 1** | Núcleo Backend + Escritorio | ✅ Completada | Ciclo básico: Registro, Eclosión, Cuidado, Sprite interactivo |
| **Fase 2** | Mecánicas de Juego | ✅ Completada | Minijuegos, tienda, evolución y estados de salud |
| **Fase 3** | Inteligencia Artificial (IA) | ✅ Completada (salvo modo suscripción y Redis) | Conexión BYOK/Hermes, streaming SSE, memoria y herramientas |
| **Fase 4** | Peleas Asíncronas | ✅ Completada (falta fin de temporada) | Motor determinista, emparejamiento ELO y repeticiones |
| **Fase 5** | Clientes Móviles Nativos | ✅ Android (salvo Play Billing/FCM) · ⏳ iOS pendiente | Android (Jetpack Compose M3) e iOS (SwiftUI Liquid Glass) |
| **Fase 6** | Pulido y Lanzamiento | 🚧 Hecho lo técnico; pendiente lo que depende de cuentas externas | Seguridad, balance, optimización, tiendas y despliegue |

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
- **Backend** (charla, memoria, agente y moderación ✅):
  - [x] Proveedor agnóstico `LlmProvider` y `OpenAiCompatibleProvider` (OpenAI y Hermes Agent remoto por HTTPS).
  - [x] Cifrado AES-256-GCM de API keys (BYOK); la key nunca se devuelve, solo una máscara.
  - [x] Protección SSRF en `baseUrl` (HTTPS, sin credenciales, sin rangos privados; revalidada en cada uso; sin redirecciones).
  - [x] Streaming por Server-Sent Events, historial, límite de 20 mensajes/min y validación de entrada.
  - [x] Personalidad dinámica según especie, carácter, estado de ánimo y estadísticas; `intelligence` sube al conversar.
  - [x] Memoria contextual a largo plazo (`PetMemory`, intelligence ≥ 200): resumen y hechos extraídos en segundo plano cada 6 mensajes, recuperación por relevancia en el prompt, filtro de datos sensibles y control del usuario (ver y olvidar).
  - [x] Function Calling / agente (intelligence ≥ 500): `get_my_status`, `request_food`, `suggest_minigame`, `search_memory`, `list_reminders` y `create_reminder`. Las herramientas con efectos no se ejecutan hasta que el usuario confirma una tarjeta (acciones pendientes con caducidad de 10 min, argumentos validados y resumen generado por el servidor). Recordatorios con entrega.
  - [x] Moderación local de entrada y salida (datos sensibles, autolesión con recursos de ayuda, manipulación del prompt, fuga del prompt/secretos en la respuesta con filtro en streaming), una respuesta en curso por usuario y cuota mensual de tokens por modo (contador en PostgreSQL, `GET /ai/usage`).
  - [ ] Moderación de contenido con un modelo (odio, sexual, violencia): hoy se delega en el proveedor del usuario.
  - [ ] Modo suscripción (key gestionada por el servidor) y mover límites/cuotas a Redis para varias instancias.
- **Escritorio**:
  - [x] Pestaña "IA": ajustes BYOK, prueba de conexión, chat en streaming y lista de recuerdos (con olvidar uno o todos).
  - [x] Burbuja de chat flotante sobre el sprite.
  - [x] Modo Hermes local (`127.0.0.1:8642`): la app llama a su Hermes con el plugin HTTP de Tauri (permiso limitado a loopback) y el backend sigue construyendo el prompt, moderando y guardando (`/pets/:id/chat/local/context` y `/sync`). Sin herramientas ni extracción de memoria nueva.
  - [x] Tarjetas de confirmación para las acciones propuestas por la mascota y entrega de recordatorios con notificación nativa.
  - [x] Herramientas del escritorio `open_url` y `read_clipboard`: el servidor valida y pide confirmación; se ejecutan en el equipo solo tras confirmar.

---

## Fase 4 — Peleas Asíncronas
- **Backend** ✅:
  - [x] Motor de combate por turnos 100 % determinista (PRNG con semilla, IA de reglas por estrategia, habilidades con enfriamientos y estados, afinidades, ánimo y salud).
  - [x] Reparto de puntos de estadística, habilidades equipables y perfil de combate.
  - [x] Emparejamiento por ELO con ventana creciente, bots deterministas como respaldo, límites diarios y coste de energía.
  - [x] ELO de suma cero, ligas (Bronce → Mítica) y clasificación global y semanal en Redis (con respaldo en PostgreSQL).
  - [x] Registro de repetición reproducible (`log json`) y aviso por WebSocket al defensor.
  - [ ] Recompensas de fin de temporada.
- **Escritorio** ✅:
  - [x] Pestaña Arena: perfil de combate (liga, ELO, límites), reparto de puntos, estrategia, equipamiento de habilidades y búsqueda de rival.
  - [x] Visor de repeticiones animado (barras de vida, golpes, críticos, estados; pausa, velocidad ×1/×2/×4, saltar al final) a partir del registro del servidor.
  - [x] Historial de peleas (como atacante y defensor) con repetición, clasificación global y semanal y aviso al defensor (burbuja + notificación nativa).

---

## Fase 5 — Clientes Móviles Nativos
- **Android** (`mobile/android`): Jetpack Compose con Material 3 Expressive, widgets Glance y Play Billing.
  - [x] v1 «núcleo + chat»: registro/login (tokens cifrados con Android Keystore, refresh automático), eclosión, estado y cuidados de la mascota con sprites SVG compartidos, tienda, chat IA con streaming SSE y ajustes BYOK. Probado en emulador (API 37) contra el backend local (`10.0.2.2:3000`).
  - [x] v2: pestaña «Jugar» (Arena con combate asíncrono, repetición y clasificación; minijuegos Atrapa la comida, Parejas de memoria y Reflejos validados por el servidor), vinculación del escritorio con código de 6 dígitos (`/auth/device/*`), widget Glance 4×2 y avisos locales de cuidados con WorkManager (cada ~30 min, sin FCM).
  - [ ] Pendiente (requiere cuentas externas): Play Billing (Play Console + endpoint de verificación de compras en el backend) y push con FCM (proyecto de Firebase y `google-services.json`).
  - Build: `cd mobile/android && ./gradlew assembleDebug`. En Windows con JDK 25 hace falta `-Djdk.net.unixdomain.tmpdir=C:/t` (ya en `gradle.properties`; exportarlo también en `JAVA_TOOL_OPTIONS` para el cliente de Gradle) y que exista `C:	`.
- **iOS**: SwiftUI con Liquid Glass para iOS 27, Live Activities y StoreKit 2.
- **Sincronización**: Código de vinculación de dispositivos para sincronizar escritorio y móviles.

---

## Fase 6 — Pulido y Lanzamiento
- [x] Empaquetado de escritorio: instalador NSIS de Windows compilado y comprobado (3,85 MiB), URL del backend configurable con `VITE_API_URL`, flujo de release por etiqueta en `.github/workflows/release.yml` (Windows y macOS; sin probar en CI). MSIX no lo soporta Tauri 2.
- [x] Seguridad: límites de intentos, vinculación de dispositivos y límite del chat en Redis (con respaldo en memoria), `helmet`, sondas `/health` y `/health/ready`, cierre ordenado, el seed no crea el usuario demo en producción, `pnpm audit` en CI. Sin pentest externo.
- [x] Pruebas de carga de lectura (`backend/scripts/loadtest.sh`): sin errores a 50 conexiones; cifras en `docs/DEPLOY.md`.
- [x] Despliegue: `backend/Dockerfile` (probado: migra, arranca en producción y queda *healthy*), `docker-compose.prod.yml` y `docs/DEPLOY.md`.
- [ ] Pendiente (requiere cuentas o equipo externo): firma de código de Windows y notarización en macOS, .dmg (hay que compilarlo en un Mac), tienda de Microsoft/Mac App Store, publicación en Play Store/App Store, auto-actualización, servidor de producción y dominio, auditoría externa, balance del juego con datos reales de jugadores.
