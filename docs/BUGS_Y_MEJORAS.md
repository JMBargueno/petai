# Bugs y mejoras descubiertos — tracker

> Creado: 17/11/2026 · Origen: nota de Obsidian *BUGS Y MEJORAS DESCUBIERTOS* · Base: `main` @ `dcd8028` (v0.23.0)
>
> **Estado:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho · ❓ necesita decisión
> **Prioridad:** **P0** seguridad / bug crítico · **P1** bug · **P2** mejora · **P3** diseño / por definir
>
> Cómo usarlo: coger una tanda, abrir un PR por tanda (o por ítem si es grande), marcar el checkbox y rellenar la columna PR de la tabla resumen.

---

## Resumen

| ID | Título | Área | Prio | Estado | PR |
|---|---|---|---|---|---|
| B1 | Email de otros usuarios expuesto en amigos | Backend | P0 | [x] | lote 1 (sin PR) |
| B2 | Historial de visitas no funciona | Backend | P1 | [x] | lote 1 (sin PR) |
| B3 | Error "Sin origen encontrado" | Backend | P1 | ❓ | falta saber dónde aparece |
| D1 | Contador de eclosión del huevo | Desktop | P1 | [~] | lote 1 · pendiente de confirmar |
| D2 | "Habilidades" recortada en submenú Mascota | Desktop | P1 | [x] | lote 1 (sin PR) |
| W3 | Recuadro negro en preview de correo (admin) | Web | P1 | [x] | lote 1 (sin PR) |
| W4 | Campos en rojo al enviar correo + modal resultado | Web | P1 | [x] | lote 1 (sin PR) |
| A1 | "PetAI" → "Pockai" en prompts | IA | P1 | [x] | lote 1 (sin PR) |
| A2 | Rasgos de personalidad semánticos en prompt | IA | P2 | [ ] | |
| A3 | Bocadillos: máx. 3 × 140 chars + negritas | IA / Desktop | P2 | [ ] | |
| A4 | Skill/tool de lore de Pockai | IA | P2 | [ ] | |
| A6 | Igualar turnos por CLI con los nativos | IA / Desktop | P2 | [ ] | |
| B4 | Clanes: 1 clan, invitaciones y solicitudes | Backend | P2 | [ ] | |
| B5 | Visitas: ajustes, aforo, expulsar, offline, render | Backend / Desktop | P2 | [ ] | |
| B6 | Presencia online en lista de amigos | Backend / Desktop | P2 | [ ] | |
| D3 | Tooltip propio + aura en hover | Desktop | P2 | [ ] | |
| D4 | Asistente de conexión CLI (Claude / Antigravity) | Desktop | P2 | [ ] | |
| D5 | Aviso Win32 en "Posarse en ventanas" | Desktop | P2 | [ ] | |
| W1 | Email de verificación: código + enlace | Web / Backend | P2 | [ ] | |
| W2 | Enlace directo en invitaciones de admin | Web | P2 | [ ] | |
| G1 | Divisas: Monedas y Gemas | Diseño | P3 | ❓ | |
| G2 | Capacidad de Pockais por cuenta / suscripción | Diseño | P3 | ❓ | |
| G3 | Tarjetas compartibles (usuario / Pockai) | Diseño | P3 | ❓ | |
| G4 | Intercambio de Pockais (nombre de lore) | Diseño | P3 | ❓ | |
| M1 | Tareas Android | Mobile | — | ❓ | |
| D6 | Eliminar a un amigo y cancelar una petición enviada (falta endpoint) | Desktop / Backend | P2 | [ ] | |
| D7 | Borrar la cuenta desde Ajustes › Cuenta (falta endpoint) | Desktop / Backend | P2 | [ ] | |
| D8 | Torneo: mostrar quién ganó cada enfrentamiento (el cuadro no identifica a los participantes) | Desktop / Backend | P2 | [ ] | |
| D9 | Entrenamiento: recuperar corazones y piso al retomar una sesión (falta endpoint de estado) | Desktop / Backend | P2 | [ ] | |
| D10 | Minijuegos: el listado no informa del coste de energía | Desktop / Backend | P3 | [ ] | |
| D11 | Convertir a `<Button>` los botones que aún llevan estilos locales (21) | Desktop | P3 | [ ] | |

## Orden de ataque sugerido

1. **Tanda 1 — bugs rápidos y seguridad:** B1, B2, B3, D1, D2, W3, W4, A1
2. **Tanda 2 — IA:** A2, A3, A4, A6
3. **Tanda 3 — clanes:** B4
4. **Tanda 4 — visitas y social:** B5, B6
5. **Tanda 5 — UX escritorio:** D3, D4, D5
6. **Tanda 6 — onboarding web:** W1, W2
7. **Por definir (decisiones de diseño):** G1–G4, M1

---

## 💻 Desktop (Tauri)

- [~] **D1 — Contador del huevo** · P1
  - 🔧 **Fix aplicado · pendiente de confirmar (lote 1):** no se reprodujo el fallo. El reloj del panel sí avanza cada segundo; la causa más probable es comparar `hatchesAt` con el reloj del PC (si va desfasado, la cuenta miente y "Eclosionar" falla). `GET /v1/eggs` devuelve ahora `remainingMs` (reloj del servidor) y el escritorio recalcula el plazo en local. Con más de 1 h también se muestran los segundos. Si sigue fallando, anotar qué se ve exactamente.
  - El temporizador de eclosión no funciona correctamente.
  - **Dónde:** `desktop/src/components/views/HatchView.svelte` (`eggReady`, `eggCountdown`, badge "Incubando · faltan …" ~l.84).
  - **Estado actual:** la cuenta atrás se calcula con `egg.hatchesAt` frente a un tick `now`. Revisar si `now` se actualiza, la zona horaria / formato de `hatchesAt` y qué pasa al llegar a 0.
  - **Hecho cuando:** el contador baja cada segundo, coincide con el servidor y al llegar a 0 pasa a "listo para eclosionar" sin recargar.

- [x] **D2 — "Habilidades" recortada en el submenú Mascota** · P1
  - ✅ **Resuelto (lote 1):** las pastillas eran desplazables con la barra oculta, así que la última quedaba cortada sin pista. En el panel ahora se reparten en varias filas (`flex-wrap`); también arregla "Jugar" (7 pestañas).
  - Valorar rediseño o ajuste de layout.
  - **Dónde:** `desktop/src/components/ControlPanel.svelte` (definición de submenús ~l.117, sub-tabs ~l.740, `.panel-card` con `max-height: 90vh; overflow: hidden` ~l.882, `:global(.sub-tabs)` ~l.1042). Panel: `desktop/src/components/DesktopSkillsPanel.svelte`.
  - **Estado actual:** "Habilidades" es la 6.ª de 6 pestañas del submenú `pet`; no cabe en el ancho.
  - **Hecho cuando:** las 6 pestañas se ven completas (wrap, scroll horizontal o iconos + texto corto) al tamaño mínimo de la ventana.

- [ ] **D3 — Tooltips propios + aura en hover** · P2
  - Sustituir el atributo `title` nativo por un componente de tooltip propio y añadir un efecto (aura / brillo) en *hover* sobre la zona interactiva.
  - **Dónde:** ~142 `title=` en 36 `.svelte` bajo `desktop/src` (incluye props tipo `SectionHeader title=…`, así que los nativos son menos).
  - **Hecho cuando:** existe `Tooltip` (acción o componente Svelte) con estilo del juego; no quedan `title=` nativos en elementos interactivos; el hover muestra aura consistente; accesible por teclado (`focus-visible`) y con `aria-describedby`.

- [ ] **D4 — Asistente de conexión CLI** · P2
  - Flujo para conectar las CLIs de Antigravity y Claude: buscar primero en rutas por defecto y, si no, pedir la ruta manualmente.
  - **Dónde:** `desktop/src-tauri/src/ai_cli.rs` (`exe_names`, `extra_dirs`, `resolve_bin`, `detect_ai_cli`), `desktop/src/lib/aiCli.ts` (config en localStorage `petai_ai_cli`).
  - **Estado actual:** la autodetección ya existe; falta el paso guiado y la ruta manual.
  - **Hecho cuando:** asistente paso a paso → detecta → si falla, selector de archivo / campo de ruta → validación (`--version`) → guarda la ruta y la usa `resolve_bin`.

- [ ] **D5 — Aviso Win32 en "Posarse en ventanas activas"** · P2
  - Al activarla pide "requisitos" relacionados con la API de Win32.
  - **Dónde:** `desktop/src/lib/types/desktopSkills.ts` (skill `window_perching`), `desktop/src/lib/windowPerching.ts`, `desktop/src-tauri/src/main.rs` (`get_active_window_info`, `GetForegroundWindow`).
  - **Respuesta a la duda:** no hace falta nada por parte del usuario. Win32 viene con Windows y el binario ya la llama. Lo que se muestra es solo un texto descriptivo ("Requiere acceso a las coordenadas de la ventana activa mediante Win32 API") más los requisitos de juego (`requiredBonding: 15`, `requiredIntelligence: 2`).
  - **Hecho cuando:** el texto técnico se sustituye por uno para el jugador ("Tu Pockai podrá posarse sobre la ventana que estés usando"); en macOS/Linux la skill se oculta o se marca como no disponible.

---

## ⚙️ Backend y arquitectura

- [x] **B1 — Email de otros usuarios expuesto en la lista de amigos** · **P0**
  - ✅ **Resuelto (lote 1):** no se enviaba el campo `email`; la fuga era el **nombre visible por defecto**, que el registro creaba con la parte local del correo (p. ej. `ana.garcia` + `@nickname`). Ahora el nombre por defecto es el nickname (o "Entrenador"); al elegir nickname se sustituye un nombre heredado del correo; y la migración `20261119100000_display_name_without_email` limpia las cuentas existentes.
  - Se ve `correo @ id nombre`. El email es privado y nunca debe enviarse al cliente para otros usuarios.
  - **Dónde:** `backend/src/modules/presence/coop-care.service.ts` (`listFriendships` ~l.164-203), `coop-friends.controller.ts`; sospechosos: `backend/src/profile/profile.service.ts`, `backend/src/modules/buddies/buddies.service.ts`, `desktop/src/components/FriendsTab.svelte`.
  - **Estado actual:** `listFriendships` solo selecciona `id, displayName, handle`, así que la fuga viene de otro endpoint o de cómo pinta la UI (¿`handle` = email?).
  - **Hecho cuando:** ninguna respuesta con datos de *otro* usuario incluye `email`; test e2e que lo verifica en amigos, solicitudes, buddies, clanes y perfil público.

- [x] **B2 — Historial de visitas no funciona** · P1
  - ✅ **Resuelto (lote 1):** solo devolvía las visitas de cuidado *recibidas*, así que quien visitaba o usaba el hábitat lo veía vacío. Ahora incluye ambos sentidos y las visitas de hábitat, con el nombre del otro jugador; el escritorio muestra "Visitaste a…" / "Visita al hábitat". Va detrás de `?scope=all` (lo pide el escritorio nuevo); sin él la respuesta es la de siempre, así Android y escritorios ya publicados no cambian.
  - **Dónde:** `GET /v1/coop/history` (`backend/src/modules/presence/presence.controller.ts:87`) → `coop-care.service.ts:296 getVisitHistory`; cliente `desktop/src/lib/api.ts:945` (`getCoopHistory`) → `desktop/src/components/VisitTab.svelte`.
  - **Estado actual:** el historial solo cubre visitas de cuidado co-op; las visitas de hábitat (`habitat-visit.service.ts`) seguramente no se registran ahí.
  - **Hecho cuando:** cualquier visita (co-op y hábitat) aparece en el historial de ambos usuarios con fecha y duración.

- [ ] **B3 — Error "Sin origen encontrado"** · P1 ❓
  - ⏸ **Bloqueado:** el texto no existe en backend, escritorio, web, Android, `edge/` ni `infra/`. Hace falta saber dónde aparece (pantalla, cliente y acción) o una captura.
  - Posible CORS o validación de cabeceras.
  - **Dónde:** `backend/src/common/cors.ts` (`isOriginAllowed`, `socketCorsOrigin`), `backend/src/main.ts:81`.
  - **Estado actual:** sin `Origin` se permite; con `Origin` fuera de `CORS_ORIGINS` se rechaza. El texto "Sin origen" no aparece en el código (.ts/.svelte/.rs) → buscar en `edge/`, `infra/` (proxy) o en el cliente Tauri (origen `tauri://localhost` / `http://tauri.localhost`).
  - **Hecho cuando:** reproducido, origen del mensaje identificado y corregido; `CORS_ORIGINS` documentado con los orígenes de Tauri y web.

- [ ] **B4 — Sistema de clanes** · P2
  - **Dónde:** `backend/src/modules/clans/clan-roles.ts`, `clans.service.ts`, `clans.controller.ts`; Prisma `Clan` / `ClanMembership` (`backend/prisma/schema.prisma` ~l.1042).
  - **Estado actual:** los rangos ya existen (Forjador del Nexo > Guardián > **Vigía** > Hermano). `inviteMember` exige Vigía+ pero mete al usuario directamente; `joinClan` entra directo por tag; no hay solicitudes.
  - [ ] Límite: un usuario solo puede estar en **un clan** a la vez (constraint único en `ClanMembership.userId` + validación).
  - [ ] Invitaciones: solo **Vigía o superior** invita; el invitado debe **aceptar** (modelo `ClanInvite` con estado pendiente/aceptada/rechazada/expirada).
  - [ ] Solicitudes: el usuario solicita unirse y un **Vigía o superior** aprueba o rechaza (modelo `ClanJoinRequest`).
  - [ ] UI en desktop para invitaciones recibidas y solicitudes pendientes.
  - **Hecho cuando:** flujos cubiertos por e2e; `joinClan` directo eliminado o restringido a clanes "abiertos" si se decide mantenerlo.

- [ ] **B5 — Visitas y hábitat** · P2
  - **Dónde:** `backend/src/modules/presence/habitat-visit.service.ts`, `habitat-visit.controller.ts` (`POST habitat/visit`, `visit/end`, `GET visitors`); `desktop/src/lib/visitors.ts`, `desktop/src/components/VisitorPet.svelte`.
  - **Estado actual:** 10 visitas/día, cooldown, coste de energía, 15 min máx., mensaje 140 chars. No se puede expulsar, no hay aforo ni lógica para dueños offline.
  - [ ] Ajuste en el perfil para **activar/desactivar** recibir visitas.
  - [ ] **Expulsar** visitantes (endpoint del dueño + evento WS).
  - [ ] Aforo máximo de **5 visitas simultáneas** por hábitat.
  - [ ] **Visitas offline:** si el dueño del Pockai visitante está desconectado, la visita autónoma dura como máximo **2 minutos** (usar `presence.service.ts`).
  - [ ] **Render** de los Pockais visitantes dentro del hábitat e **interacciones** con el Pockai local.

- [ ] **B6 — Presencia online en amigos** · P2
  - **Dónde:** `backend/src/modules/presence/presence.service.ts` (heartbeat Redis, online/offline por usuario y dispositivo), `coop-care.service.ts` (`listFriendships`), `desktop/src/components/FriendsTab.svelte`.
  - **Hecho cuando:** la lista de amigos devuelve `online: boolean` (y `lastSeenAt`) y la UI muestra el indicador, con actualización en tiempo real por WS.

---

## 🧠 IA, prompts y lore

- [x] **A1 — "PetAI" → "Pockai" en prompts** · P1
  - ✅ **Resuelto (lote 1):** prompt de la mascota (`ai/personality.ts`), narrador de aventuras (`adventure-orchestrator.service.ts`) y sugerencia del analizador de archivos del escritorio. Pendiente aparte: título de la API en Swagger/OpenAPI (regenera `shared/openapi/openapi.json`) y logs.
  - **Dónde:** `backend/src/modules/ai/personality.ts:180` ("…en el juego PetAI"); revisar el resto de prompts en `backend/src/modules/ai` y `mind`.
  - **Fuera de alcance:** claves internas (`petai_ai_cli`, `petai:…:presence`, etc.), que requieren migración aparte.
  - **Hecho cuando:** `grep -ri petai` sobre textos de prompt devuelve 0.

- [ ] **A2 — Rasgos de personalidad semánticos** · P2
  - Pasar contexto tipo *"Sociabilidad 52 % — soy amistoso"* en vez de datos crudos.
  - **Dónde:** `backend/src/modules/mind/personality.engine.ts:118` (`buildPersonalityBlock`, hoy "Curiosidad 73/100 (banda): …"); fallback `backend/src/modules/ai/personality.ts` (`TRAITS`).
  - **Hecho cuando:** cada rasgo se traduce a una frase en primera persona por banda (bajo / medio / alto); tests unit del bloque generado.

- [ ] **A3 — Formato de respuesta en bocadillos** · P2
  - [ ] Máximo **3 bocadillos** por interacción.
  - [ ] Máximo **140 caracteres** por bocadillo (ajustar al tamaño real del bocadillo).
  - [ ] **Markdown básico** (negritas) renderizado en el bocadillo.
  - **Dónde:** prompt `backend/src/modules/ai/personality.ts:193` ("Sé breve: 1 a 3 frases"); límites `backend/src/modules/ai/chat.service.ts` (`MAX_MESSAGE_CHARS`, `LOCAL_MAX_REPLY_CHARS`); render `desktop/src/lib/speech-queue.ts`, `desktop/src/components/PetView.svelte`, `desktop/src/lib/thinkTags.ts`.
  - **Hecho cuando:** el prompt pide el formato y el cliente lo **garantiza** (troceo + recorte en `speech-queue.ts`, también para respuestas de CLI); `**negrita**` se renderiza de forma segura (sin HTML arbitrario).

- [ ] **A4 — Skill de lore** · P2
  - Documento estructurado con el lore de Pockai que la IA consulte dinámicamente.
  - **Dónde:** `docs/LORE.md` (existe, sin uso por la IA); tools en `backend/src/modules/ai/agent-tools.ts` (`get_my_status`, `search_memory`, …).
  - **Hecho cuando:** lore troceado por secciones (servido desde backend) + tool `get_lore(topic)` que la IA invoca cuando se pregunta por el universo; probado con 3-4 preguntas de lore.

- [ ] **A6 — Igualar los turnos por CLI con los nativos** · P2 *(nace de la duda A5)*
  - **Dónde:** `backend/src/modules/ai/chat.service.ts` (`syncLocal` frente a `run`), `desktop/src/lib/aiCli.ts`, `desktop/src-tauri/src/ai_cli.rs`, `backend/src/modules/ai/agent-tools.ts`.
  - **Estado actual:** la memoria es común (ver A5), con dos diferencias:
    - [ ] `syncLocal` no llama a `memory.maybeSummarize`, así que las conversaciones por CLI (y Hermes local) no generan recuerdos resumidos en `PetMemory`.
    - [ ] El CLI se lanza con `--strict-mcp-config` y sin tools: no puede usar `search_memory`, recordatorios, etc.
  - **Hecho cuando:** los turnos por CLI también alimentan los recuerdos resumidos (p. ej. resumen con el modelo gestionado o en el siguiente turno nativo), y el CLI dispone de las tools o se documenta que no las tendrá.

---

## 🌐 Web, registro y panel admin

- [ ] **W1 — Email de verificación con código + enlace** · P2
  - **Dónde:** `backend/src/modules/auth/email-verification.service.ts`, `backend/src/modules/mail/templates/transactional.ts` (`verificationEmail`), `web/src/app/verify-email`.
  - **Estado actual:** la plantilla **ya incluye** código de 6 dígitos (5 intentos) y enlace `/es/verify-email?token=…`. Revisar si el correo recibido en producción es otro (plantilla antigua / despliegue), si el enlace autoconfirma y si la app de escritorio tiene campo para el código.
  - **Hecho cuando:** correo real recibido con ambos; el enlace confirma con un clic; el código funciona desde la app.

- [ ] **W2 — Enlace directo en invitaciones de admin** · P2
  - Al generar un código, generar también una URL con el código prerrellenado:
  - [ ] Web abierta → formulario normal de registro (la ruta actual es `register`; no existe `/signup`: decidir alias).
  - [ ] Modo *Coming Soon* → abre directamente el modal de registro prerrellenado.
  - **Dónde:** `backend/src/modules/invites/admin-invites.controller.ts`, `invites.service.ts`; `web/src/app/admin/features/invites.ts`, `web/src/app/admin/data/invites-http.ts`; `web/src/app/coming-soon/coming-soon.ts` (campo `inviteCode`), `gate.ts`; `web/src/app/app.routes.ts`.
  - **Hecho cuando:** botón "Copiar enlace" en admin; `?invite=CODE` rellena el campo en ambos modos.

- [x] **W3 — Recuadro negro en preview de correo** · P1
  - ✅ **Resuelto (lote 1, comprobado renderizando la plantilla antes y después):** la plantilla pone `border-collapse:collapse` en todas las tablas y con eso los navegadores ignoran `border-radius` en celdas: la tarjeta (borde y sombra carbón) salía como un recuadro negro cuadrado. Las tablas de la tarjeta, el botón y el bloque de código usan ahora `border-collapse:separate`.
  - **Dónde:** `web/src/app/admin/features/emails.ts` (iframe/contenedor de preview), `POST preview` en `backend/src/modules/admin-email/admin-email.controller.ts`.
  - **Hecho cuando:** la preview se ve sin borde negro en `/en/admin/correos`.

- [x] **W4 — Feedback al enviar correo** · P1
  - ✅ **Resuelto (lote 1):** al vaciar los campos tras enviar, quedaban en `:user-invalid` (ya tocados) y se pintaban en rojo. Ahora se ocultan hasta volver a escribir (no se usa `form.reset()`, que pondría a null la audiencia), y un diálogo muestra el resultado del envío (éxito con nº de destinatarios, o el error).
  - Al enviar, *Asunto* y *Cuerpo HTML* se marcan en rojo por error (probablemente validación tras resetear el formulario).
  - **Dónde:** `web/src/app/admin/features/emails.ts`.
  - **Hecho cuando:** no aparecen errores falsos tras enviar; modal de confirmación con éxito o error (y nº de destinatarios).

---

## 🎮 Diseño de juego, economía y marketing (por definir)

- ❓ **G1 — Divisas** · P3
  - **Monedas** (gratis, jugando) y **Gemas** (premium, dinero real).
  - **Estado actual:** ya existen `User.coins` (100 por defecto) y `User.gems` (5) en `backend/prisma/schema.prisma:31-32`, gestionadas en `backend/src/modules/wallet/wallet.service.ts`. Revisar que el resto de sistemas use estas dos y no otras.

- ❓ **G2 — Capacidad de Pockais por cuenta** · P3
  - **Estado actual:** no hay límite por suscripción (solo `SYNC_MAX_PETS = 100` técnico en `backend/src/modules/sync/delta-sync.service.ts:129`). Existe modelo `Subscription` y `backend/src/modules/billing/`.
  - Preguntas a decidir:
    - ¿Cómo se gestiona hoy tener varios Pockais?
    - ¿Límite base por cuenta y escalado por nivel de suscripción?
    - ¿Qué pasa con los Pockais extra si se cancela o pierde la suscripción?
    - ¿Huecos permanentes desbloqueables con Gemas?

- ❓ **G3 — Tarjetas compartibles** · P3
  - Imágenes tipo *trading card* para redes sociales:
    - Perfil de usuario: nombre, insignias y estadísticas destacadas.
    - Perfil de Pockai: apariencia, estadísticas clave y rasgos de su mente.

- ❓ **G4 — Intercambio de Pockais** · P3
  - Mecánica de intercambio entre usuarios con un **término propio del lore** (no "intercambio" ni "trade").

---

## 📱 Android

- ❓ **M1 —** pendiente de añadir tareas específicas.

---

## Dudas técnicas — respuestas

| Duda | Respuesta | Acción |
|---|---|---|
| **D5 · Win32 en "Posarse en ventanas"** | No requiere nada al usuario ni configuración extra: la API Win32 viene con Windows y la app ya llama a `GetForegroundWindow`. El "requisito" es un texto descriptivo de la skill. | Reescribir el texto (D5). |
| **A5 · ¿La mente vive 100 % en el servidor?** | **Sí, con un matiz.** Todo vive en BD (`ChatMessage`, `PetMemory`, `petContextProfile`) y el escritorio no guarda nada propio. Los modos Claude CLI y Antigravity CLI usan el flujo de Hermes local: el backend monta el prompt con mente y memoria (`POST /pets/:id/chat/local/context`), el CLI solo genera el texto, y el backend lo modera y lo guarda (`/chat/local/sync`). Al guardarlo aplica lo mismo que un turno nativo: historial, inteligencia, vínculo, misiones y recuerdos/sentimientos de la mente (`afterTurn`). **Matiz:** no ejecuta el resumen periódico de recuerdos (`memory.maybeSummarize`) y el CLI no tiene tools. *(Corregido: una primera revisión dijo que los CLI no usaban la memoria del servidor.)* | Tarea A6. |
