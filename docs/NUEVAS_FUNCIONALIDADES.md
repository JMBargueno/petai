# PetAI — Propuesta de Nuevas Funcionalidades

> Análisis realizado por un equipo de tres agentes especializados (diseño de juego, arquitectura técnica y UX/engagement) sobre el estado actual del proyecto (Fases 0–6 del ROADMAP).
>
> Todas las propuestas son **mecánicas/features nuevas** que no existen actualmente.

---

## Índice

- [Resumen ejecutivo](#resumen-ejecutivo)
- [Quick wins](#-quick-wins)
- [Nuevos mecanismos de juego](#-nuevos-mecanismos-de-juego)
- [Mejoras técnicas](#-mejoras-técnicas)
- [UX / Engagement](#-ux--engagement)
- [Priorización](#-priorización)
- [Notas de balance y dependencias](#notas-de-balance-y-dependencias)

---

## Resumen ejecutivo

| # | Funcionalidad | Categoría | Complejidad | Retención | Monetización |
|---|---|---|:---:|:---:|:---:|
| 1 | Misiones y desafíos diarios/semanales | Retención / Hábito | Media | ★★★★★ | Baja–Media |
| 2 | Cofres y drops aleatorios | Economía / Retención | Baja–Media | ★★★★ | Alta |
| 3 | Observabilidad (OpenTelemetry) | Técnico / Ops | Media | — | — |
| 4 | DevKit + Hot Reloading de Game Data | Técnico / DX | Media | — | — |
| 5 | Environmental Awareness & "Mood Weather" | UX / Engagement | Media | ★★★★ | — |
| 6 | Bonding Meter (Métrico de Vínculo) | UX / Progresión | Media | ★★★★★ | — |
| 7 | Pet Notifications con Personalidad | UX / Retención | Media | ★★★★ | — |
| 8 | Logros y Constelación Visual | UX / Colección | Media | ★★★★ | — |
| 9 | Edge Computing + CDN + Predictive Preloading | Técnico / Performance | Media | — | — |
| 10 | Hábitat / Base Personalizable | Gameplay loop | Alta | ★★★★★ | Media |
| 11 | Temporadas + Pase de Temporada | Estacional / Meta | Alta | ★★★★★ | Alta |
| 12 | Cruzamiento (Breeding) | Progresión / Colección | Alta | ★★★★★ | Media |
| 13 | Boss de Raid asíncrono | Competitivo / Colectivo | Media | ★★★★ | Media |
| 14 | Torneo Knockout semanal | Competitivo | Alta | ★★★★ | Alta |
| 15 | Minijuego: Cocina / Menú del día | Minijuego nuevo | Media | ★★★★ | Baja |
| 16 | Minijuego: Entrenamiento Elemental | Minijuego nuevo | Baja–Media | ★★★ | Baja |
| 17 | Genes y Temperamento (rasgos ocultos) | Profundidad / IA | Media–Alta | ★★★★ | Media |
| 18 | Aventura Narrativa IA | IA / Contenido diario | Alta | ★★★★★ | Media |
| 19 | Multi-Model AI Router con Fallback | Técnico / IA | Alta | — | — |
| 20 | Voice AI: Conversación por Voz | Técnico / IA | Alta | ★★★★★ | Media |
| 21 | Multi-Device Presence y Co-op Pet Care | Técnico / Social | Alta | ★★★★★ | — |
| 22 | Offline-First con CRDT Sync | Técnico / UX | Alta | ★★★★ | — |
| 23 | Combat Spectator en Tiempo Real | Técnico / Engagement | Media–Alta | ★★★★ | Media |
| 24 | Modding API + Workshop de Pets | Técnico / Ecosistema | Alta | — | — |
| 25 | Public API + Webhooks para Terceros | Técnico / Ecosistema | Media | — | — |
| 26 | Security: Zero-Trust + E2E Encryption | Técnico / Seguridad | Alta | — | — |
| 27 | iOS + Cross-Platform Animation (Skia) | Técnico / Plataforma | Alta | ★★★★★ | — |
| 28 | "Welcome Back" — Re-engagement Cinemático | UX / Retención | Alta | ★★★★★ | — |
| 29 | "Pet Buddies" — Interacción entre Pets | UX / Social | Alta | ★★★★★ | — |
| 30 | "Rituals" — Hábitos y Rituales | UX / Hábito | Media | ★★★★★ | — |
| 31 | "Mood Theater" — Micro-narrativas Diarias | UX / Contenido | Media–Alta | ★★★★ | Baja |
| 32 | Accessibility & Inclusion | UX / Inclusión | Media | — | — |
| 33 | "Gifting & Care Packages" | UX / Social | Alta | ★★★★★ | Media |

**Total: 33 funcionalidades nuevas** que transforman a PetAI de un "tamagotchi con chat" a un **ecosistema de acompañamiento digital** con comunidad, contenido infinito y diferenciador IA real.

---

## 🚀 Quick wins

Implementables a corto plazo con bajo riesgo y alto retorno.

### 1. Misiones y desafíos diarios/semanales

**Descripción:**
Sistema de misiones que ancla el login diario y conecta todos los sistemas del juego:
- **Diarias** (3-5): "Alimenta a tu pet", "Completa 1 minijuego", "Pelea en Arena", "Chatea 5 mensajes con tu pet", "Cuida la higiene".
- **Semanales** (5-7): "Sube de nivel", "Gana 3 peleas", "Eclosiona un huevo raro+", "Visita el hábitat 3 veces", "Comparte un logro".
- Cada misión da monedas/gemas/XP. Al completar todas las diarias se desbloquea un **cofre diario**.
- Las misiones se generan dinámicamente (se evitan repetir exactamente las mismas 3 días seguidos).

**Por qué es atractiva:**
Crea un objetivo claro al abrir la app cada día. Conecta todos los sistemas (cuidado, minijuegos, Arena, IA) en un bucle cohesivo.

**Complejidad:** Media. Backend: módulo `missions` con modelos de tipo, dificultad, recompensa y caducidad. Frontend: panel de misiones con progreso.

**Impacto en retención:** ★★★★★ — Ancla el login diario y crea un hábito de 2-3 min al día.

---

### 2. Cofres y drops aleatorios

**Descripción:**
Cofres que contienen items aleatorios (comida, medicina, huevos, gemas, muebles, skins). Se consiguen con misiones, victorias en Arena, evoluciones, eventos especiales o compra directa.

Tipos: Cofre Bronce, Plata, Oro, Diamante, Mítico (solo eventos). Cada cofre tiene una tabla de drops en `balance.json` con **pity** (tras N cofres del mismo tipo, garantiza un item de rareza mínima).

**Por qué es atractiva:**
Micro-recompensa constante. El FOMO de "¿qué caerá?" mantiene el engagement. Los cofres míticos de eventos crean picos de actividad.

**Complejidad:** Baja–Media. Backend: módulo `chests` con tablas de drop y pity. Frontend: animación de apertura de cofre.

**Impacto en retención:** ★★★★ — Micro-dopamina frecuente.

---

### 3. Observabilidad con OpenTelemetry + Anomaly Detection

**Descripción técnica:**
- Instrumentar el backend con **OpenTelemetry** (tracing, metrics, logs unificados).
- Traces distribuidos: cada request (REST + WebSocket + BullMQ job) genera un trace que se correlaciona.
- **Grafana** + **Prometheus** para dashboards: p95/p99 de latencia, throughput, errores, memoria, CPU.
- **Anomaly detection:** alertas si la latencia p95 sube >20% en 5min, error rate >1%, o cola BullMQ >1000 jobs.

**Valor:** Sin esto, cualquier incidente en producción es un "fuego a ciegas". Prerrequisito para escalar a producción real.

**Complejidad:** Media (1-2 semanas). Setup de OTel SDK, Prometheus, Grafana, y alert rules.

---

### 4. DevKit + Hot Reloading de Game Data

**Descripción técnica:**
Un `petai-devkit` (CLI + lib) que permite:
- **Hot reload de game data:** Cambiar `species.json`, `balance.json`, `skills.json` y ver el cambio sin reiniciar el backend.
- **Test harness:** API para simular acciones (alimentar, pelear, evolucionar) sin UI.
- **Seed generator:** `petai-devkit seed --users=100 --pets=500 --level=range(1,100)`.
- **Balance simulator:** `petai-devkit simulate --combats=10000 --seed=42`.

**Valor:** Reduce el ciclo de feedback de "cambiar JSON → reiniciar backend → probar" de 2min a 2s.

**Complejidad:** Media (1-2 semanas). CLI + watcher + seed script.

---

### 5. Environmental Awareness & "Mood Weather"

**Descripción:**
El pet reacciona en tiempo real al contexto del usuario:
- **Hora del día:** 7 AM → bosteza, 11 PM → somnoliento, 3 AM → "¿descansas?"
- **Clima real:** lluvia → paraguas/poncho, calor → suda y pide agua, nieve → bolas de nieve.
- **Actividad del PC:** inactivo 2h+ → juega solo, CPU sostenido → deja "café virtual" ☕.
- **Festividades:** 24 dic → sombrerito de Navidad, cumpleaños → pide "regalo sorpresa".

**Impacto en engagement/retención:**
Rompe la cuarta pared. Genera "micro-momentos" de deleite que se comparten en redes.

**Complejidad:** Media — API de meteo (OpenWeather), listener de inactividad, calendario festivo por zona horaria.

---

### 6. Bonding Meter (Métrico de Vínculo 0-100)

**Descripción:**
Sistema cuantitativo que mide la relación emocional jugador-pet. Rangos: "Acostumbrado" → "Compañero" → "Aliado" → "Alma gemela" → "Leyenda".

- **Sube** con interacciones variadas: alimentar, jugar, hablar, tocar, minijuegos, pelear.
- **Baja** lentamente si el jugador lo ignora por más de 48h.
- **Umbrales de comportamiento:**
  - 30+: Saluda al iniciar sesión ("¡Hola! ¡Te extrañé!").
  - 60+: Recupera conversaciones previas sin que se lo pidas.
  - 80+: Reacciones emocionales personalizadas.
  - 100: "Alma gemela" — patrón cromático exclusivo + duerme cerca del cursor.

**Impacto en engagement/retención:**
Crea un objetivo a largo plazo. El decay genera una "cost of abandonment" emocional.

**Complejidad:** Medium — nuevo sistema de puntuación, tracking de interacciones, decay timer, nuevos assets.

---

### 7. Pet Notifications con Personalidad

**Descripción:**
Reemplazar notificaciones genéricas por mensajes **personalizados según personalidad, bonding y contexto**:
- Pet valiente + bonding bajo: "¡Oye! Aquí estoy. ¿Me dejas solo otra vez? 🙄"
- Pet tímido + bonding alto: "Hoy no quise molestarte, pero si necesitas un momento, estoy aquí. 🌸"
- Arena: "Acabo de pelear con un rival Mítico. ¡Ganamos por 3-1! 🏆"
- IA recordatorio: "Me acordé de que me dijiste que te iba a llamar tu abuela el viernes."

Generadas con la IA del pet (respetando nivel de IA del usuario), emitidas por WorkManager/tray/FCM.

**Impacto en engagement/retención:**
Las notificaciones dejan de ser "spam" y se convierten en "mensajes de tu mascota". Aumenta el open rate y el vínculo emocional.

**Complejidad:** Medium — integración con módulo IA, plantillas por personalidad, rate-limiting.

---

### 8. Logros y Constelación Visual

**Descripción:**
Sistema de logros con progresión visual:
- **Categorías:** Cuidado, Batalla, IA, Colección, Social.
- **Progresión visual:** Cada logro desbloquea una "estrella" en una **constelación** que el pet ilumina en su perfil.
- **Rewards:** Monedas/gemas/item exclusivo. Logros raros ("Alimentar 1000 veces") dan item único.
- **Social:** Logros visibles en perfil público (opt-in).

**Impacto en engagement/retención:**
Objetivo a largo plazo ("completar todas las constelaciones") y "status" visible.

**Complejidad:** Medium — módulo `achievements` con condiciones, tracking de eventos, UI de constelación.

---

### 9. Edge Computing + CDN + Predictive Preloading

**Descripción técnica:**
- **CDN para assets:** Sprites SVG, animaciones y game-data JSON desde CDN (Cloudflare/Vercel Edge) con versioning por hash.
- **Edge functions para auth:** `/v1/auth/refresh` en edge para latencia < 50ms.
- **Predictive preloading:** El cliente pre-carga assets según estado (evolución inminente → sprites nueva etapa; evento en 1h → assets del evento).

**Valor:** Reduce latencia de carga (especialmente mobile) y mejora el tiempo de apertura.

**Complejidad:** Media (1-2 semanas). CDN, versioning, y lógica de predictive loading.

---

## 🎮 Nuevos mecanismos de juego

### 10. 🏡 Hábitat / Base Personalizable ("El Territorio")

**Descripción:**
Espacio persistente y decorable donde la mascota vive. El jugador coloca **muebles** (cajitas, fuentes, camas, lámparas, plantas, acuarios) que otorgan **bonificaciones pasivas**:
- *Camita mullida* → energía +10% al dormir.
- *Fuente de agua* → higiene decae 20% más lento.
- *Comedor temático* → felicidad cae más despacio en horario activo.
- *Pósters / acuarios* → puramente estético (colección).

Habitaciones se desbloquean por nivel de evolución (Sala 1 → Bébé, Jardín → Joven, Santuario → Adulto, Cita final → Forma Final).

**Atractivo:**
Es el bucle emocional central de un Tamagotchi: *hacer la casa de tu mascota*. Objetivo a largo plazo, espacio para coleccionar, logro que no depende de peleas.

**Complejidad:** Alta. Nuevo módulo `habitat`, modelos Prisma, seed de muebles, renderizado de escena, `habitat.json`.

**Impacto en retención:** ★★★★★ — Crea un "hogro" constante.

---

### 11. 🔄 Temporadas + Pase de Temporada

**Descripción:**
Ciclos de 8-12 semanas con un tema (elemento, evento). Pase gratuito (recompensas básicas) y premium (gemass: skins, huevos temáticos, muebles de temporada, cofres míticos). Al terminar: recompensas según liga y clasificación.

**Atractivo:**
Estructura de meta a largo plazo. FOMO estacional. Contenido nuevo cada temporada sin cambiar el juego base.

**Complejidad:** Alta. Módulo `seasons` con calendario, rewards, tracking de progreso.

**Monetización:** Alta (pase premium, ~$3-5/mes).

**Impacto en retención:** ★★★★★ — Columna vertebral de ingresos.

---

### 12. 🧬 Cruzamiento (Breeding)

**Descripción:**
Dos mascotas del mismo elemento pueden "cruzarse" (ticket especial + 2h incubación). La descendencia hereda genes parentales (elemento, patrón, temperamento) con mutaciones aleatorias. 10% de chance de rareza superior si ambos son raro+.

Se beneficia del sistema de **genes y temperamento** (#17): genes ocultos se heredan (50%) o mutan (10% gen nuevo).

**Atractivo:**
Meta a muy largo plazo: "conseguir el pet perfecto". Incertidumbre del resultado genera engagement.

**Complejidad:** Alta. Sistema de genética, pool de rarezas, balance económico, UI de "pedigree".

**Impacto en retención:** ★★★★★ — Meta a muy largo plazo, colección.

---

### 13. 👾 Boss de Raid asíncrono

**Descripción:**
Cada semana aparece un "jefe" elemental (boss mítico con stats ×3, 10M HP global). Los jugadores atacan secuencialmente (combate determinista contra el boss). Progreso global: cuando todos suman suficientes hits, el boss cae y reparte rewards proporcionales al daño.

**Atractivo:**
Bucle colectivo diario: "¿cuánto nos falta para matar al boss hoy?". Usa el tema de temporada.

**Complejidad:** Media. Módulo `raid` con boss del día, HP global, ranking de contribución.

**Impacto en retención:** ★★★★ — Bucle colectivo diario.

---

### 14. 🏆 Torneo Knockout semanal

**Descripción:**
Los 64 mejores de Diamond+ entran a un bracket de eliminación directa (32→16→8→4→2→1, 2 combates por ronda). Cuota: 50 gemas. Campeón: item exclusivo + título + 1000 gemas. Finalistas: 500, semis: 250.

**Atractivo:**
Pico competitivo semanal. FOMO de "entrar al torneo". Bracket compartible.

**Complejidad:** Alta. Sistema de bracket, scheduling, UI de espectación, reparto de premios.

**Monetización:** Alta (cuota + apuestas opcionales).

**Impacto en retención:** ★★★★ — Pico competitivo semanal.

---

### 15. 🍳 Minijuego: Cocina / Menú del día

**Descripción:**
Minijuego de "cocina" (Overcooked simplificado): el pet pide ingredientes (3-4), el jugador tiene 60s para cocinar (clic en ingredientes en orden, evitar el "fire"). El plato da buffs de combate (ATK +10 por 1 día). Recetas nuevas por nivel. "Menú del día" (receta especial que cambia cada día).

**Atractivo:**
Varía el minijuego y da buffs de combate. El "menú del día" da un motivo para volver.

**Complejidad:** Media. Módulo `cooking` con recetas y buffs. Minijuego con timeline.

**Impacto en retención:** ★★★★ — Varía el gameplay, conecta comida→combate.

---

### 16. 🎯 Minijuego: Entrenamiento Elemental

**Descripción:**
Un "dungeon" de 5 pisos donde cada piso tiene un elemental enemigo. El jugador elige la habilidad correcta (fuego contra planta, etc.). Si acierta, sube un piso. Si falla, pierde un "heart". Al completar los 5 pisos, el pet recibe un buff (ATK/ESP +5% por 24h). Entrenar con el elemento correcto al rival siguiente da bonus extra.

**Atractivo:**
Conecta minijuegos con Arena (entrenar antes de pelear da ventaja). Usa el motor de combate existente.

**Complejidad:** Baja–Media. Extensión del módulo `minigames`. UI de dungeon con 5 pisos.

**Impacto en retención:** ★★★ — Conecta minijuegos con Arena.

---

### 17. 🧬 Genes y Temperamento (Rasgos Ocultos)

**Descripción:**
Cada pet tiene **3 genes ocultos** (15% probabilidad al eclosionar):
- *Veloz* (+10% VEL), *Férreo* (+10% DEF), *Sagaz* (crítico +3%), *Devorador* (+15% comida favorita), *Aurora* (shiny +1%), *Crono* (−10% enfriamiento).

**Temperamento** (valiente, tímido, arribista, curioso) afecta la IA de combate y el chat IA. Los genes se revelan con el tiempo o con un "análisis genético" (item de gemas).

**Atractivo:**
Profundidad de colección: "mi pet tiene Veloz + Férreo, es casi perfecto". Puente entre IA y combate.

**Complejidad:** Media–Alta. Modelo `genes` + `temperament`, integración con motor de combate y chat IA.

**Impacto en retención:** ★★★★ — Profundidad de colección + puente IA/combate.

---

### 18. 📖 Aventura Narrativa IA (diferenciador)

**Descripción:**
La IA del pet genera un **cuento/aventura diaria personalizada** de 3-5 escenas. El jugador toma decisiones (estilo "interactive fiction"). El resultado da XP, monedas, y la mascota lo **recuerda** (lo menciona en conversaciones futuras).

Cada jugador tiene su propia aventura según su mascota, elemento, bonding, e historial. La IA usa el contexto del pet para generar narrativas coherentes.

Mecánica: el LLM genera escena + 2-3 opciones. El jugador elige. Al final, el "resultado" se valida determinísticamente según stats. Las recompensas se aplican al inventario.

**Atractivo:**
La **funcionalidad IA más diferenciadora**: convierte el LLM en **generador de contenido diario fresco e infinito**. Crea una **razón narrativa** para abrir la app cada día y une las dos "almas" del juego: el tamagotchi y la IA.

**Complejidad:** Alta. Orquestación LLM, validación determinista, persistencia, control de calidad, coste por uso.

**Impacto en retención:** ★★★★★ — Contenido diario **infinito y personal**. Diferenciador competitivo.

**Monetización:** Gemas para "aventura premium" (más larga, reintentar decisiones). Justifica el modo suscripción IA.

---

## 💡 Mejoras técnicas

### 19. 🤖 Multi-Model AI Router con Fallback Cascading

**Descripción técnica:**
Un `AIModelRouter` que gestiona múltiples proveedores de LLM simultáneamente:
- **Abstracción de proveedor:** Interfaz `LlmProvider` con `streamCompletion()`, `toolCall()`, `embed()`. Adapters para OpenAI, Anthropic, Gemini, Ollama local, y BYOK.
- **Router con políticas:** Selecciona modelo según interacción (chat → barato; tool-use → potente; nombre → creativo).
- **Fallback cascading:** Si timeout/429/500, degrada al siguiente proveedor. SSE se re-conecta sin retry del cliente.
- **Token budget tracking:** Cada petición lleva `budget` (max tokens, max $).
- **Caching semántico:** Redis + embedding similarity para queries repetitivas (>0.92 similitud → cache hit).

**Valor:** Elimina vendor lock-in, reduce costos hasta 60%, mejora resiliencia.

**Complejidad:** Alta (4-5 semanas).

---

### 20. 🎙️ Voice AI: Conversación por Voz con el Pet

**Descripción técnica:**
Interacción por voz bidireccional:
- **STT:** Whisper API / whisper.cpp local (Tauri WASM) / `SpeechRecognizer` nativo (Android).
- **TTS:** Voz personalizada por especie. Cloud: ElevenLabs/OpenAI TTS. Local: piper-tts (Rust).
- **VAD:** WebRTC VAD / silero-vad para endpointing sin botón.
- **Barge-in:** Si el usuario habla, cortar TTS inmediatamente.
- **Prosodia emocional:** `happy` → pitch +15%, speed +10%; `sad` → pitch -10%, speed -15%.

**Valor:** Transforma la interacción de texto a "compañía real". Diferenciador enorme.

**Complejidad:** Alta (5-6 semanas). Pipeline de audio en 3 plataformas, latencia < 800ms.

---

### 21. 📡 Multi-Device Presence y Co-op Pet Care

**Descripción técnica:**
- **Presence layer:** Channel `presence:{userId}`. Heartbeat cada 30s. UI: "Tu pet está en: [Escritorio ✓, Android ✗]".
- **Co-op care:** Si un amigo autoriza, otro puede "visitar" y alimentarlo. El pet "recibe" la visita (+animación +sonido). El cuidador gana badge de "Visitante".
- **Shared status:** Estado sincronizado en todos los devices al instante.

**Valor:** Crea comunidad, retención social. "Visitar" el pet de un amigo es un micro-ritual social.

**Complejidad:** Alta. Extensión del gateway, modelos de autorización, UI de "visita".

---

### 22. 📱 Offline-First con CRDT Sync

**Descripción técnica:**
Sincronización local-first con CRDT:
- Acciones registradas localmente (SQLite/LevelDB), sincronizadas al reconectar.
- Conflict resolution: "last-write-wins" (stats), "merge" (inventario), "deterministic" (combate).
- Desktop: `tauri-plugin-sql`. Android: `Room` + sync adapter.
- Delta sync: solo se envían cambios, no estado completo.

**Valor:** La app funciona sin red. El pet "sigue viviendo" offline (deterioro local, sync al reconectar).

**Complejidad:** Alta. CRDT engine, local database, sync protocol.

---

### 23. ⚔️ Combat Spectator en Tiempo Real + Highlights

**Descripción técnica:**
- Modo "espectación" con delay de 10s (evita anticipación del defensor).
- Combates "emocionantes" (críticos, remontadas, >30 rondas) se guardan como "highlights" (replay 30s) en un feed semanal.
- UI: barras HP animadas, nombres, elementos, "comentarios" automáticos del LLM.

**Valor:** Engagement pasivo, contenido viral. "Mira el combate de la semana" es un ritual de 30s.

**Complejidad:** Media-Alta. Streamer de combates, sistema de highlights, UI de espectación.

---

### 24. 🔧 Modding API + Workshop de Pets

**Descripción técnica:**
- **Especies custom:** JSON + sprite SVG + skills + food favorite. Backend valida y publica.
- **Muebles de hábitat:** JSON + sprite + buff.
- **Minijuegos custom:** Plugin en sandbox (Web Worker / isolate).
- **Workshop in-app:** Publicar/bajar mods con rating, downloads, "featured".
- **Sandbox:** Los mods no tocan la DB directamente, solo vía API.

**Valor:** Ecosistema UGC infinito.

**Complejidad:** Alta. API de modding, sandbox, workshop UI, rating.

---

### 25. 📊 Public API + Webhooks para Terceros

**Descripción técnica:**
- **Endpoints públicos:** `GET /public/pets/:id` (opt-in), `GET /public/leaderboard`, `GET /public/events`.
- **Webhooks:** `pet.evolved`, `combat.finished`, `level.up`, `ai.reminder.created`, `season.ended`.
- **SDK:** `petai-sdk` (TypeScript) para bots, dashboards, notificaciones custom.

**Valor:** Ecosistema, "hype" developer.

**Complejidad:** Media. API key system, webhook system, documentación.

---

### 26. 🔐 Security: Zero-Trust + E2E Encryption

**Descripción técnica:**
- **Token rotación:** Access 15min, refresh 7d con rotation.
- **Encryption:** TLS 1.3 in transit, AES-256 at rest (API keys).
- **Device fingerprinting:** Anti-farming (detectar cuentas bot).
- **E2E encryption para chat IA:** Solo el cliente tiene la key, el backend solo enruta.
- **Rate limiting:** Por IP + device + user.

**Valor:** Confianza, cumplimiento (GDPR, CCPA). Esencial para producción real.

**Complejidad:** Alta. Refactoring del auth, E2E encryption, device fingerprinting.

---

### 27. 🍎 iOS Support + Cross-Platform Animation (Skia)

**Descripción técnica:**
- **App iOS:** SwiftUI + Liquid Glass. **Live Activity** en Dynamic Island. **WidgetKit** Home Screen.
- **Skia animation engine (Rust):** Motor unificado:
  - Tauri: `wgpu` surface.
  - Android: JNI → `SurfaceView`/`TextureView`.
  - iOS: Swift Package → `MTKView`.
- Recibe `AnimationSpec` JSON (frames, fps, easing, triggers).
- **Shared test suite:** 10 animations, pixel diff < 2% en las 3 plataformas.

**Valor:** iOS es el target principal de companion/pet apps. Live Activity en Dynamic Island es un diferenciador visual enorme.

**Complejidad:** Alta (6-8 semanas, paralelizables).

---

## 🎨 UX / Engagement

### 28. 🫂 "Welcome Back" — Re-engagement Cinemático

**Descripción:**
Al volver tras >24h, secuencia de re-engagement:

**Fase 1 — "What I missed":** El pet muestra un "diario visual" (3-5 viñetas: "Dormí 14 horas", "Me comí 3 galletas", "Gané 2 batallas solo").

**Fase 2 — "Forgiveness ritual":**
- <48h: Feliz, sin consecuencias.
- 48h-7d: "Ofendido". Debes tocar/petear 5 veces o decir "lo siento".
- 7-30d: "Triste". Secuencia de cuidados (alimentar + limpiar + jugar).
- >30d: "¡Te eché de menos!" + regalo sorpresa + recovery buff.

**Fase 3 — "Recovery buff":** 24h sin decay para "reacudirlo" sin presión.

**Impacto:** Muy alto — convierte la vuelta en un evento emocional, no un reset.

**Complejidad:** High. Tracking de ausencia, "diario", lógica de "forgiveness", secuencia cinemática.

---

### 29. 🐾 "Pet Buddies" — Interacción entre Pets

**Descripción:**
Con 2+ mascotas (o "buddy" de un amigo), pueden **interactuar**:
- Se persiguen por la pantalla (desktop) o en "jardín" (mobile).
- Duermen juntos (+5% recuperación de energía).
- Pelean juguetonamente (mini-riña 5s, +happiness a ambas).
- "Comen juntos" (+2% happiness extra).

Las interacciones dan XP de bonding a ambas.

**Impacto:** Muy alto — el pet tiene "vida social". Ver a dos pets interactuar es más "vivo".

**Complejidad:** High. Sistema de interacciones, animaciones de "encuentro", UI multi-pet.

---

### 30. 📅 "Rituals" — Hábitos y Rituales

**Descripción:**
El pet "aprende" los hábitos del jugador. Si se mantiene 7 días seguidos → "gift ritual" (monedas, XP, item raro). Romper (1 día) no castiga, pero el pet "se extraña".

**Ejemplos:**
- "Cocinar juntos a las 8 AM" 7 días → gift.
- "Pelear en Arena los viernes" 7 semanas → gift.
- "Leer un cuento IA a las 9 PM" 7 noches → gift.

**Impacto:** Muy alto — fomenta consistencia sin punitividad. El pet "espera" al jugador.

**Complejidad:** Medium. Tracking de hábitos, detección de patrones, rewards.

---

### 31. 🎭 "Mood Theater" — Micro-narrativas Diarias

**Descripción:**
El pet hace "actos" espontáneos según mood, bonding, y contexto:
- Baila si le cae una comida buena.
- "Canta" si está muy feliz.
- "Llora" si está triste.
- "Fuma" si pierde en Arena.
- "Brilla" si sube de nivel.

El jugador puede "grabar" (capturar) un momento y compartirlo como "sticker" en un feed social (opt-in).

**Impacto:** Alto — micro-momentos de deleite, contenido compartible.

**Complejidad:** Medium-High. Triggers de mood, animaciones de "actos", UI de captura/compartir.

---

### 32. ♿ Accessibility & Inclusion

**Descripción:**
- **Alto contraste** y **reducir movimiento** (vestibular).
- **Subtítulos** y transcripción en el chat IA.
- **Minijuegos alternativos** accesibles (sin reflejos/timing).
- **"Modo simple"** (UI simplificada) para niños 6-10.
- **VoiceOver/TalkBack** completo, Dynamic Type.
- **Color-blind friendly:** Patrones con textura, no solo color.

**Impacto:** Amplía TAM. Un pet accesible genera goodwill y viral por comunidades de accesibilidad.

**Complejidad:** Medium — design tokens de accesibilidad, variantes de minijuegos, settings panel.

---

### 33. 🎁 "Gifting & Care Packages" — Regalos entre Jugadores

**Descripción:**

**"Gifting":** Enviar un item de tu inventario al pet de un amigo (máx 3/día enviados, 5 recibidos). El pet "recibe" animación de sobre y dice "¡Me llegó un regalo!". El item se aplica al pet receptor. "Thank you note" (1 línea).

**"Care Packages":** Si un amigo tiene su pet enfermo (status público opt-in), otros envían un bundle [comida + medicina + toy + 50 coins] con nota. Al volver, el amigo ve: "Mientras no estabas, [X] te envió un Care Package."

**"Group Feeding":** 3-5 jugadores cocinan juntos un item raro (3 minijuegos por jugadores distintos). Se reparte proporcionalmente en una "cocina virtual" (room 10 min).

**Impacto:** Muy alto — economía social colaborativa. "Care Package" es un magneto de retorno. "Group Feeding" crea sessions sociales.

**Complejidad:** High — sistema de gifts, status público, room multi-user, tracking de care packages.

---

## Priorización

### Oleada 1 — "Hábito + Infra" (inmediato, bajo riesgo)

| # | Feature | Impacto |
|---|---------|---------|
| 1 | Misiones diarias/semanales | Ancla el login diario |
| 2 | Cofres y drops aleatorios | Micro-recompensa + FOMO |
| 5 | Environmental Awareness | "El pet vive en mi mundo" |
| 6 | Bonding Meter | Objetivo a largo plazo |
| 7 | Pet Notifications con Personalidad | Notificaciones que no son spam |
| 3 | Observability (OpenTelemetry) | Ops, debugging |
| 4 | DevKit + Hot Reload | Velocidad de dev |
| 30 | Rituals (Hábitos) | Consistencia sin punitividad |
| 32 | Accessibility | Amplía TAM |

### Oleada 2 — "Meta + IA" (estructura de largo plazo)

| # | Feature | Impacto |
|---|---------|---------|
| 18 | Aventura Narrativa IA | Diferenciador #1, retención diaria |
| 19 | Multi-Model AI Router | Costo + resiliencia |
| 20 | Voice AI | Diferenciador #2, "compañía real" |
| 10 | Hábitat / Base | Bucle emocional central |
| 11 | Temporadas + Pase | Columna vertebral de ingresos |
| 22 | Offline-First | UX core |
| 28 | Welcome Back | Re-engagement cinemático |
| 25 | Public API + Webhooks | Ecosistema |

### Oleada 3 — "Comunidad + Ecosistema" (flagship)

| # | Feature | Impacto |
|---|---------|---------|
| 29 | Pet Buddies | "Vida social" del pet |
| 33 | Gifting & Care Packages | Comunidad, retención social |
| 13 | Raid Boss | Bucle colectivo |
| 12 | Breeding | Meta a muy largo plazo |
| 24 | Modding API | Ecosistema UGC |
| 27 | iOS + Skia | Market iOS + consistencia visual |
| 21 | Multi-Device Co-op | Comunidad, presencia |
| 26 | Security E2E | Confianza, cumplimiento |

---

## Notas de balance y dependencias

- **Balance crítico:** Cofres (#2), Breeding (#12) y Raid (#13) tocan la **economía** (monedas/gemas) y el **pool de rarezas/pity** de `balance.json`; simular antes de lanzar.
- **Determinación del combate:** Raid (#13), Torneo (#14) y Genes (#17) deben mantener la **reproducibilidad por semilla** del motor de combate.
- **Coste IA:** Aventura Narrativa (#18) y Voice AI (#20) aumentan el consumo de tokens; el modo suscripción debe ir de la mano.
- **Orden recomendado:** Oleada 1 → 2 → 3. Las oleadas 2 y 3 dependen de la estructura de temporadas.
- **Balance del juego:** Antes de implementar #2, #12 y #13, usar `petai-devkit simulate` (#4) para verificar que el balance no se rompe.
- **iOS (pendiente):** Las funcionalidades multiplataforma (#10, #15, #18) exigen más trabajo en los clientes que en el backend, lo cual prepara el terreno para iOS (#27).

---

## Resumen ejecutivo final

Las **33 propuestas** cubren:

| Categoría | # Features | Ejemplos |
|---|---|---|
| **Bucles nuevos** | 7 | Hábitat, Breeding, Raid, Torneo, Cocina, Aventura IA, Modding |
| **Retención diaria** | 8 | Misiones, Cofres, Environmental Awareness, Rituals, Welcome Back, Mood Theater, Notificaciones, Bonding |
| **Profundidad** | 4 | Genes, Entrenamiento Elemental, Logros/Constelación, Co-op Care |
| **Monetización** | 6 | Pase de Temporada, Cuota de Torneo, Cofres premium, Aventura premium, IAP gemas, Modding |
| **IA diferenciadora** | 4 | Aventura Narrativa, Voice AI, Multi-Model Router, Pet Notifications IA |
| **Comunidad/Social** | 5 | Pet Buddies, Gifting, Group Feeding, Combat Spectator, Public API |
| **Infraestructura** | 6 | Observability, DevKit, Edge/CDN, Offline-First, Security, iOS+Skia |

**El de mayor retorno inmediato es el par Misiones + Cofres** (oleada 1), y **el de mayor techo a largo plazo es el Pase de Temporada** con su contenido (eventos, raid, breeding, aventura IA).

---

*Documento generado por un equipo de análisis (diseño de juego, arquitectura técnica y UX/engagement) sobre el estado del proyecto PetAI en noviembre de 2026.*