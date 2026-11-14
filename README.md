# PetAI

PetAI es una mascota virtual al estilo tamagotchi. Eclosionas huevos de los que salen criaturas con rareza y patrón únicos, las cuidas, las haces subir de nivel con minijuegos y las pones a pelear contra mascotas de otros jugadores. Si conectas un modelo de lenguaje (OpenAI, Hermes Agent u otro compatible), tu mascota puede conversar, recordar y actuar como un pequeño agente personal.

La app es multiplataforma: un backend autoritativo y varios clientes que muestran la misma mascota y sincronizan los cambios al momento.

## Funcionalidades

### Eclosión
- Los huevos se consiguen con monedas, gemas, recompensas diarias y subidas de nivel. Cada tipo tiene su tiempo de incubación, que se puede acelerar con gemas.
- **Rareza** (normal, raro, super-raro, legendario y mítico), tirada en el servidor. Hay un sistema de *pity* que garantiza rarezas altas tras un número de huevos.
- **Patrón** (liso, manchas, rayas, degradado, escamas, cristal, galaxia o aurora), paleta de color y una pequeña probabilidad de variante *shiny*.
- Animación de eclosión según la rareza.

### Cuidado
- Cinco estadísticas vitales (hambre, felicidad, energía, higiene y salud), de 0 a 100.
- El deterioro se calcula al leer el estado, sin tareas en segundo plano por mascota.
- Si una estadística se queda baja mucho tiempo, la mascota puede enfermar (hay que curarla) o ponerse triste (rinde menos en combate).
- Ciclo de sueño según tu zona horaria.
- Etapas de vida: bebé, joven, adulto y forma final, con niveles de desbloqueo.

### Comida, tienda e inventario
- Cada comida tiene efectos distintos. Cada especie tiene una comida favorita que da un bonus.
- La tienda vende comida, medicina, juguetes, huevos y cosméticos. Hay monedas blandas (se ganan jugando) y gemas.

### Niveles
- La experiencia necesaria para subir de nivel crece de forma no lineal, hasta el nivel 100.
- Al subir ganas monedas y puntos de estadística de combate para repartir.
- La cuenta también tiene nivel, que desbloquea más huecos de mascotas, tipos de huevo y la arena.

### Minijuegos
- **Atrapa la comida**, **Parejas de memoria** y **Reflejos**.
- El servidor valida cada partida (duración y puntuación plausible) y limita las recompensas diarias, para evitar trampas.

### Peleas asíncronas (Arena)
- Cada mascota tiene estadísticas de combate (vida, ataque, defensa, velocidad y espíritu), elementos (fuego, agua, planta, eléctrico, sombra y luz) y hasta cuatro habilidades equipables.
- Eliges una estrategia (agresiva, defensiva o equilibrada) y pulsas buscar rival. El servidor empareja por ELO y simula el combate de forma determinista: el mismo combate siempre da el mismo resultado.
- Hay repeticiones animadas, historial, ELO de suma cero, ligas (de Bronce a Mítica) y clasificación global y semanal.
- Límites: pelear gasta energía y hay un máximo diario. El defensor recibe un aviso con el resultado.
- *Pendiente*: recompensas de fin de temporada.

### Inteligencia (IA)
- Conecta tu propia API key (BYOK) o un Hermes Agent. Las keys se cifran en el servidor y nunca vuelven a la app; solo se muestra una máscara.
- La mascota tiene personalidad que depende de su especie, carácter, ánimo y estadísticas. Su estadística `intelligence` sube al conversar y desbloquea tres niveles:
  1. **Charla**: conversación en streaming.
  2. **Memoria**: resume conversaciones y recuerda hechos. Puedes ver y borrar cada recuerdo.
  3. **Agente**: usa herramientas, como consultar su estado, pedir comida, sugerir un minijuego, crear y listar recordatorios, o buscar en su memoria.
- Las acciones con efectos (por ejemplo, crear un recordatorio o abrir una URL en el escritorio) muestran una tarjeta de confirmación antes de ejecutarse.
- Moderación de entrada y salida, y cuotas mensuales de tokens.
- *Pendiente*: modo suscripción con la key del servidor, moderación con un modelo propio y mover los límites a Redis para varias instancias.

## Clientes

| Cliente | Estado | Qué incluye |
|---|---|---|
| **Escritorio** (Windows, Tauri 2 + Svelte) | Funcional | Mascota en una ventana transparente sobre el escritorio que camina, duerme y come, con clics a través de la ventana. Bandeja del sistema, panel de control (cuenta, eclosión, inventario, estadísticas, minijuegos, tienda, Arena, IA), chat flotante y notificaciones nativas. Modo Hermes local. Sincronización por WebSocket. |
| **Android** (Kotlin + Jetpack Compose) | Funcional, sin Play Billing ni FCM | Registro e inicio de sesión, eclosión, cuidados con los sprites compartidos, tienda, pestaña Jugar (Arena y minijuegos), chat IA, ajustes de IA, vinculación con el escritorio por código, widget de pantalla de inicio y avisos locales de cuidados. |
| **iOS** (SwiftUI, Liquid Glass) | Pendiente | — |
| **Web** (Angular 22, [`web/`](web/README.md)) | Landing funcional; panel con datos de ejemplo | Web oficial con el nombre público del juego, **Pockai** (pocket + yokai + AI): landing estática en español e inglés y un panel de administración oculto que, de momento, trabaja con datos simulados y no se conecta al backend. |

Para vincular el escritorio con el móvil, la app de escritorio muestra un código de 6 dígitos que confirmas desde Android.

## Funcionalidades Expandidas (33 features)

Además del núcleo original, PetAI incluye **33 funcionalidades nuevas** organizadas en tres oleadas. Ver detalle en [`docs/NUEVAS_FUNCIONALIDADES.md`](docs/NUEVAS_FUNCIONALIDADES.md) y specs en [`docs/specs/`](docs/specs/).

### Oleada 1 — Hábito e Infraestructura (001-009)

| # | Funcionalidad | Descripción |
|---|---|---|
| 001 | **Misiones diarias/semanales** | Set de misiones generadas cada día/semana. Recompensas progresivas, reset a medianoche, scheduler con paginación. |
| 002 | **Cofres y drops aleatorios** | Cofres comprables (oro, plata, bronce) con tablas de drops ponderadas, pity per-cofre y evento WebSocket `chest:opened`. |
| 003 | **Observabilidad OpenTelemetry** | Spans de request + DB + Redis, métricas (HTTP, GC, SSE), log serialization, trace context W3C en headers. |
| 004 | **DevKit + Hot Reload** | Actions de debug (`/dev/action`), seed rápido, watcher de `game-data/` con hot-reload sin restart. |
| 005 | **Environmental Awareness** | Clima real (Open-Meteo), hora local, festivales, inactividad, contexto ambiental inyectado al prompt de la IA. |
| 006 | **Bonding Meter** | Métrica de vínculo 0-100 por mascota. Sube con interacciones. Niveles de amistad con recompensas. |
| 007 | **Pet Notifications IA** | Notificaciones personalizadas por la IA con tono según personalidad, limitadas por día. |
| 008 | **Logros y Constelación** | Logros desbloqueables con constelación visual, puntos de logro y recompensas únicas. |
| 009 | **Edge/CDN + Preloading** | Assets por CDN, versión con hash, preload predictivo de sprites y game-data. |

### Oleada 2 — Meta e IA (010-018)

| # | Funcionalidad | Descripción |
|---|---|---|
| 010 | **Hábitat / Base** | Espacio decorable. Muebles con bonificaciones pasivas. Habitaciones desbloqueables por nivel. |
| 011 | **Temporadas + Pase** | Ciclos de 8-12 semanas. Pase gratuito y premium. Ligas y clasificación por temporada. |
| 012 | **Breeding** | Dos pets cruzan. Descendencia hereda genes con mutaciones. Ticket + incubación. |
| 013 | **Raid Boss** | Jefe semanal asíncrono. Atacantes contribuyen hits. Progreso global, drops al vencer. |
| 014 | **Torneo Knockout** | Bracket semanal de 64 jugadores (Diamond+). Cuota en gemas. Item exclusivo. |
| 015 | **Cocina / Menú** | Minijuego de cocina. Recetas dan buffs de combate (24h). |
| 016 | **Entrenamiento Elemental** | Buffs temporales de stats. Bonus por elemento rival. |
| 017 | **Genes y Temperamento** | 3 genes ocultos + temperamento que afecta IA de combate y chat. |
| 018 | **Aventura Narrativa IA** | Cuento interactivo diario. Decisiones, recompensas, la mascota lo recuerda. |

### Oleada 3 — Comunidad y Ecosistema (019-033)

| # | Funcionalidad | Descripción |
|---|---|---|
| 019 | **Multi-Model AI Router** | Router de LLMs con fallback cascading, token budget, selección por tipo de tarea. |
| 020 | **Voice AI** | STT/TTS con voz por especie, barge-in, prosodia emocional. |
| 021 | **Multi-Device Presence** | Presencia por dispositivo. Cuidado cooperativo entre amigos. |
| 022 | **Offline-First CRDT** | Sync local-first, funciona sin red, resolución de conflictos merge/LWW. |
| 023 | **Combat Spectator** | Espectación en vivo (delay 10s), highlights de 30s, replays. |
| 024 | **Modding API** | UGC: publicar mods (especies, muebles, minijuegos). Sandbox + rating. |
| 025 | **Public API + Webhooks** | API keys, endpoints públicos, webhooks (`pet.evolved`, `combat.finished`). |
| 026 | **Security Zero-Trust** | Token rotación, device fingerprinting, cifrado de keys de IA. (El "E2E" de chat es solo una clave pública almacenada; el chat sigue en claro por el servidor, ver S-13.) |
| 027 | **iOS + Skia** | Motor de animación unificado (Rust/Skia). Live Activity en Dynamic Island. |
| 028 | **Welcome Back** | Diario visual de ausencia, ritual de disculpa, regalos sorpresa. |
| 029 | **Pet Buddies** | Dos pets interactúan. Bonus de bonding mutuo. |
| 030 | **Rituals** | Hábitos y streaks. El pet "aprende" rutinas del jugador. |
| 031 | **Mood Theater** | Micro-narrativas espontáneas. Stickers compartibles. |
| 032 | **Accessibility** | Alto contraste, minijuegos accesibles, modo simple 6-10, VoiceOver. |
| 033 | **Gifting & Care Packages** | Regalos entre jugadores, care packages, group feeding. |

## Arquitectura

```
petai/
  backend/            API NestJS 11 (Prisma, PostgreSQL, Redis)
  desktop/            Escritorio con Tauri 2 (Rust) y Svelte/TypeScript
  mobile/android/     App Android (Kotlin, Jetpack Compose)
  shared/
    game-data/        Especies, patrones, comidas, habilidades y balance (JSON)
    assets/           Sprites SVG compartidos
    openapi/          Contrato de la API generado por el backend
  docs/               Documentación técnica (ver abajo)
  docker-compose.yml  PostgreSQL y Redis para desarrollo
```

- El backend es la única fuente de verdad. Los clientes no calculan rarezas, combates ni recompensas.
- Los datos de juego viven en `shared/game-data` y el backend los carga en la base de datos.
- La API REST está bajo `/v1`, con WebSocket (`/realtime`) para sincronizar mascotas y avisos.

## Documentación

- [`docs/PROYECTO.md`](docs/PROYECTO.md): visión, decisiones de diseño, arquitectura detallada y fases de implementación.
- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md): reglas del juego (incluye las 33 features de la Fase 7).
- [`docs/API.md`](docs/API.md): referencia de la API.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): estado de cada fase (incluye Fase 7 con las 33 features).
- [`docs/PANTALLAS.md`](docs/PANTALLAS.md): pantallas y opciones que debe tener cada app (móvil y ordenador), con su estado actual.
- [`docs/NUEVAS_FUNCIONALIDADES.md`](docs/NUEVAS_FUNCIONALIDADES.md): análisis y priorización de las 33 funcionalidades.
- [`docs/specs/`](docs/specs/): especificaciones de detalle por feature (33 specs).
- [`docs/DEPLOY.md`](docs/DEPLOY.md): despliegue del backend en producción.
- [`docs/informes/`](docs/informes/): informes de auditoría y SDD de solución — [`AUDITORIA_SEGURIDAD.md`](docs/informes/AUDITORIA_SEGURIDAD.md), [`SDD_SEGURIDAD.md`](docs/informes/SDD_SEGURIDAD.md) y [`MEJORAS_FUNCIONALIDAD_RENDIMIENTO.md`](docs/informes/MEJORAS_FUNCIONALIDAD_RENDIMIENTO.md).

## Puesta en marcha (desarrollo)

Requisitos: Node.js 22 LTS (el `backend/Dockerfile` usa `node:22-slim` y la CI corre con Node 22), pnpm, Docker y, para el escritorio, Rust y las dependencias de Tauri. Para Android hace falta Android Studio con un SDK reciente.

1. Instala las dependencias desde la raíz:

   ```bash
   pnpm install
   ```

2. Copia el fichero de variables de entorno y ajústalo:

   ```bash
   cp .env.example backend/.env
   ```

3. Levanta PostgreSQL y Redis:

   ```bash
   docker compose up -d
   ```

4. Arranca el backend en modo desarrollo:

   ```bash
   pnpm backend:dev
   ```

5. En otra terminal, arranca el escritorio:

   ```bash
   pnpm desktop:dev
   ```

6. Android: abre `mobile/android` en Android Studio, o compila desde la línea de comandos:

   ```bash
   cd mobile/android && ./gradlew assembleDebug
   ```

## Pruebas

```bash
pnpm backend:test      # tests unitarios del backend
pnpm test:all          # unitarios y e2e del backend
pnpm validate:data     # valida los datos de juego en shared/game-data
```

## Estado del proyecto

Consulta [`docs/ROADMAP.md`](docs/ROADMAP.md) para ver el detalle de cada fase. Resumen:
- Backend, escritorio y minijuegos, IA (salvo modo suscripción) y Arena: completados.
- **33 funcionalidades expandidas (Fase 7)**: implementadas en el backend. Oleada 1: con tests unitarios y e2e. Oleadas 2 y 3 (010-033): la mayoría de los módulos sin tests (hay unitarios en `cooking`, `modding`, `presence`, `sync` y `webhooks`) y ningún cliente las consume; 021 (cuidado cooperativo), 023 (spectator) y 026 (E2E) son prototipos y 013 (raid) y 014 (torneo) tienen defectos de lógica pendientes. Ver [`docs/informes/MEJORAS_FUNCIONALIDAD_RENDIMIENTO.md`](docs/informes/MEJORAS_FUNCIONALIDAD_RENDIMIENTO.md), F-03 a F-10.
- Android: funcional, pendientes Play Billing y FCM (requieren cuentas externas).
- iOS y el despliegue público de las apps: pendientes.
