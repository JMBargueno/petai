# PetAI — Pantallas y opciones por aplicación

Este documento describe qué pantallas y opciones debe tener cada cliente de PetAI: la **app de móvil** (Android e iOS) y la **app de ordenador** (Tauri, Windows y macOS). Sirve de guía para construir la interfaz de las features que el backend ya ofrece y aún no tienen pantalla.

- Las rutas citadas son las del backend en `main` (prefijo `/v1`), comprobadas contra los controladores.
- El estado «Existe» se ha comprobado contra el código de `desktop/src` y `mobile/android`, no contra documentación anterior.
- Fecha: 14 de noviembre de 2026.

## 1. Cómo leer este documento

**Estado de cada pantalla**

| Estado | Significado |
|---|---|
| ✅ Existe | Hay pantalla en ese cliente y cubre lo descrito. |
| 🟡 Incompleta | Hay pantalla, pero le faltan opciones de las descritas. |
| ⬜ Falta | No hay pantalla; el backend está listo para usarse. |
| ⛔ Bloqueada | No hay pantalla y el backend es un prototipo o tiene un fallo conocido. No construir la interfaz hasta resolverlo (ver [informes](informes/)). |

**Prioridad**

| Prioridad | Criterio |
|---|---|
| P1 | Ciclo básico de juego y hábito diario. Sin esto la app queda coja. |
| P2 | Retención y progresión a medio plazo. |
| P3 | Comunidad, ecosistema y extras. |

## 2. Reparto de papeles

Las dos apps muestran la misma cuenta y la misma mascota, sincronizadas por WebSocket, pero no son la misma app en dos tamaños.

- **Móvil: el juego completo.** Es donde se cuida, se juega y se progresa. Sesiones cortas y frecuentes, una mano, notificaciones y widget. Todas las features de juego deben estar aquí.
- **Ordenador: el compañero permanente.** La mascota vive sobre el escritorio mientras se trabaja. Lo principal es la ventana de la mascota, las interacciones rápidas y el chat. El panel de control cubre el juego, pero se priorizan las acciones de un clic y las herramientas que solo tienen sentido en un ordenador (Hermes local, abrir enlaces, portapapeles, API keys y webhooks).

### Tabla resumen

Cada celda indica el estado actual en ese cliente. «—» significa que esa feature no debe tener pantalla en ese cliente.

| Área | Feature | Móvil | Ordenador | Prioridad |
|---|---|---|---|---|
| Núcleo | Registro e inicio de sesión | ✅ | ✅ | P1 |
| Núcleo | Recuperar contraseña | ⛔ sin backend | ⛔ sin backend | P1 |
| Núcleo | Mascota: vitales y cuidados | ✅ | ✅ | P1 |
| Núcleo | Eclosión de huevos | ✅ | ✅ | P1 |
| Núcleo | Colección de mascotas | 🟡 | 🟡 | P1 |
| Núcleo | Tienda e inventario | ✅ | ✅ | P1 |
| Núcleo | Minijuegos (3) | ✅ | ✅ | P1 |
| Núcleo | Arena: combate, repetición, clasificación | ✅ | ✅ | P1 |
| Núcleo | Chat IA y ajustes BYOK | ✅ | ✅ | P1 |
| Núcleo | Recuerdos, acciones y recordatorios | ⬜ | ✅ | P1 |
| Núcleo | Vincular escritorio por código | ✅ | ✅ | P1 |
| 001 | Misiones diarias y semanales | ⬜ | ⬜ | P1 |
| 002 | Cofres | ⬜ | ⬜ | P1 |
| 005 | Ambiente: clima, hora, festividades | ⬜ | ✅ | P2 |
| 006 | Vínculo (bonding) | ⬜ | ⬜ | P1 |
| 007 | Notificaciones de la mascota | 🟡 locales | ✅ | P1 |
| 008 | Logros y constelación | ⬜ | ✅ | P1 |
| 010 | Hábitat | ⬜ | ⬜ | P2 |
| 011 | Temporadas y pase | ⬜ | ⬜ | P2 |
| 012 | Breeding | ⬜ | ⬜ | P2 |
| 013 | Raid Boss | ⛔ | ⛔ | P2 |
| 014 | Torneo | ⛔ | ⛔ | P2 |
| 015 | Cocina | ⬜ | ⬜ | P2 |
| 016 | Entrenamiento elemental | ⬜ | ⬜ | P2 |
| 017 | Genes y temperamento | ⬜ | ⬜ | P2 |
| 018 | Aventura narrativa | ⬜ | ⬜ | P2 |
| 019 | Router de modelos de IA | — | ⛔ | P3 |
| 020 | Voz (STT/TTS) | ⛔ | ⛔ | P3 |
| 021 | Presencia y cuidado cooperativo | ⛔ | ⛔ | P3 |
| 022 | Modo sin conexión | ⛔ | — | P3 |
| 023 | Espectador de combates | ⛔ | ⛔ | P3 |
| 024 | Mods y Workshop | ⛔ | ⛔ | P3 |
| 025 | API keys y webhooks | — | ⬜ | P3 |
| 026 | Seguridad: sesiones y auditoría | ⬜ | ⬜ | P2 |
| 028 | Bienvenida tras ausencia | ⬜ | ⬜ | P2 |
| 029 | Pet Buddies | ⬜ | ⬜ | P3 |
| 030 | Rituales | ⬜ | ⬜ | P2 |
| 031 | Mood Theater | ⬜ | ⬜ | P3 |
| 032 | Accesibilidad | ⬜ | ⬜ | P2 |
| 033 | Regalos y care packages | ⬜ | ⬜ | P3 |

Las features 003 (observabilidad), 004 (DevKit), 009 (CDN) y 027 (motor de animación) son de infraestructura y no tienen pantalla de usuario. El DevKit tiene una sección propia en el ordenador, solo en compilaciones de desarrollo (§4.5).

---

## 3. App de móvil

### 3.1 Navegación

Barra inferior con cinco destinos. Hoy Android tiene Mascota, Chat, Jugar, Tienda y Cuenta; la propuesta reorganiza para dar sitio a la progresión:

| Pestaña | Contenido | Cambio respecto a hoy |
|---|---|---|
| **Mascota** | Inicio, cuidados, colección, eclosión, hábitat | Absorbe la eclosión y añade hábitat |
| **Jugar** | Minijuegos, cocina, entrenamiento, arena, raid, torneo | Añade cocina, entrenamiento, raid y torneo |
| **Chat** | Chat IA, voz, aventura, recuerdos, recordatorios | Añade aventura y recordatorios |
| **Progreso** | Misiones, logros, temporada, rituales | **Nueva** |
| **Más** | Tienda, cofres, inventario, social, cuenta y ajustes | Sustituye a Tienda y Cuenta |

La tienda deja de ser pestaña propia: se abre desde un acceso con el saldo (monedas y gemas) visible en la cabecera de todas las pestañas.

Indicadores en la barra: punto en **Progreso** cuando hay recompensas por reclamar, y en **Más** cuando hay regalos pendientes.

### 3.2 Acceso

**Bienvenida, registro e inicio de sesión** · ✅ · P1

- Muestra: campos de correo, contraseña y nombre opcional; alternar entre registro y login.
- Opciones: mostrar contraseña, enlace «He olvidado mi contraseña».
- Estados: error de validación por campo, cuenta bloqueada temporalmente con cuenta atrás (`retryAfterSeconds` del 429), sin conexión.
- Rutas: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`.

**Recuperar contraseña** · ⛔ · P1

- No existe en el backend. Hoy una contraseña olvidada supone perder la cuenta. Requiere verificación de correo y un flujo de restablecimiento antes de diseñar la pantalla.

**Primera vez** · ⬜ · P1

- Tras registrarse: elegir zona horaria (detectada, editable), aceptar o no la ubicación para el clima, y eclosionar el primer huevo guiado.
- Rutas: `PATCH /me`, `GET /eggs`, `POST /eggs/:id/hatch`.

### 3.3 Pestaña Mascota

**Inicio** · ✅ (ampliar) · P1

- Muestra: sprite animado de la mascota activa, nombre, nivel y barra de experiencia, las cinco estadísticas vitales, estado (dormida, enferma, triste) y etapa de vida.
- Acciones: alimentar (abre selector de comida del inventario), bañar, dormir o despertar, curar, evolucionar cuando cumple requisitos, renombrar.
- Añadir sobre lo actual:
  - **Vínculo**: medidor 0-100 con nivel de amistad y siguiente recompensa (`GET /pets/:id/bonding`).
  - **Ambiente**: icono de clima y hora del día, accesorio de festividad, aviso de modo «solo» por inactividad (`GET /environmental/status`).
  - **Resumen del día**: misiones pendientes, cofres listos y ritual activo, cada uno como acceso directo.
  - **Selector de mascota** en la cabecera para cambiar entre las de la cuenta.
- Estados: sin mascota (invita a eclosionar), acción no disponible con motivo (por ejemplo «no necesita baño»).
- Rutas: `GET /pets`, `GET /pets/:id`, `POST /pets/:id/feed|clean|sleep|wake|heal|evolve`, `PATCH /pets/:id`.
- Tiempo real: `pet:update`, `pet:level_up`, `pet:evolved`, `pet:vitals-critical`, `bonding:tier_up`, `bonding:tier_down`, `environmental:changed`.

**Bienvenida tras ausencia** · ⬜ · P2

- Se muestra al abrir la app después de varios días sin entrar, antes del Inicio.
- Muestra: diario visual de lo ocurrido en la ausencia y el estado de ánimo resultante (contenta, ofendida, triste, emocionada).
- Acciones: ritual de reconciliación según el estado (toques sobre la mascota, mensaje, o completar cuidados) y recogida del regalo.
- Rutas: `GET /reengagement/status`, `GET /reengagement/diary`, `POST /reengagement/forgive`.

**Colección** · 🟡 · P1

- Muestra: cuadrícula con todas las mascotas (sprite, rareza, nivel, shiny), huecos libres y bloqueados por nivel de cuenta.
- Acciones: elegir mascota activa, abrir ficha.
- **Ficha de mascota**: estadísticas vitales y de combate, elemento, patrón y paleta, etapa, ELO, y pestaña de **Genes** (genes revelados, temperamento, botón «Analizar» con coste en gemas).
- Rutas: `GET /pets`, `GET /pets/:id`, `GET /pets/:id/genes`, `POST /pets/:id/analyze`.

**Eclosión** · ✅ · P1

- Muestra: huevos en incubación con cuenta atrás, huevos listos, contador de pity.
- Acciones: comprar huevo (tipo y moneda), acelerar con gemas, eclosionar con animación según rareza.
- Debe incluir un acceso a las **probabilidades publicadas** por rareza (requisito de las tiendas de apps).
- Rutas: `GET /eggs`, `POST /eggs/buy`, `POST /eggs/:id/hatch`, `GET /catalog`.

**Breeding** · ⬜ · P2

- Muestra: selección de dos mascotas compatibles, vista previa de rasgos heredables, coste (ticket) y tiempo de incubación; historial de cruces.
- Rutas: `POST /breeding/start`, `GET /breeding/:id`, `GET /breeding/history`.

**Hábitat** · ⬜ · P2

- Muestra: habitaciones de la mascota en cuadrícula, muebles colocados y bonificaciones pasivas activas; habitaciones bloqueadas con la etapa que las desbloquea.
- Acciones: comprar y colocar mueble arrastrando a una casilla, retirar mueble, cambiar de habitación.
- Estados: casilla ocupada, saldo insuficiente, habitación bloqueada.
- Rutas: `GET /habitat`, `POST /habitat/furniture/:id/place`, `DELETE /habitat/furniture/:id`, `GET /habitat/buffs`.
- Antes de construirla: el cobro debe ser atómico (hallazgo S-05 del informe de seguridad).

### 3.4 Pestaña Jugar

Pantalla de entrada con dos bloques: **Actividades** (minijuegos, cocina, entrenamiento) y **Competición** (arena, raid, torneo). Muestra arriba la energía de la mascota activa y los límites diarios restantes.

**Minijuegos** · ✅ · P1

- Tres juegos: Atrapa la comida, Parejas de memoria, Reflejos.
- Muestra por juego: duración, recompensa máxima, partidas con recompensa restantes hoy, tiempo de espera.
- Al terminar: puntuación, monedas, experiencia, felicidad y energía gastada.
- Opciones de accesibilidad: versiones accesibles de los juegos (`GET /accessibility/minigames/accessible`).
- Rutas: `GET /minigames`, `POST /minigames/:gameId/start`, `POST /minigames/sessions/:id/finish`.

**Cocina** · ⬜ · P2

- Muestra: menú del día, receta con ingredientes y dificultad, buff que otorga.
- Juego: ordenar ingredientes contra reloj; resultado con buff de combate de 24 h y monedas.
- Rutas: `GET /cooking/daily-menu`, `POST /cooking/start`, `POST /cooking/submit`.
- Antes de construirla: el servidor debe validar el resultado (hallazgo S-12).

**Entrenamiento elemental** · ⬜ · P2

- Muestra: mazmorra por pisos, elemento del enemigo de cada piso, corazones restantes, predicción opcional, buff activo y su caducidad.
- Rutas: `POST /training/start`, `POST /training/submit`, `GET /training/active-buff`.

**Arena** · ✅ · P1

- **Perfil de combate**: estadísticas efectivas, puntos por repartir, ánimo, ELO, liga y puntos hasta la siguiente, peleas restantes hoy.
- **Preparación**: estrategia (agresiva, defensiva, equilibrada), equipar hasta cuatro habilidades, buffs activos de cocina y entrenamiento.
- **Buscar rival**: botón principal, deshabilitado con motivo cuando no se puede pelear.
- **Repetición**: reproductor con barras de vida, golpes, críticos y estados; pausa, velocidad ×1/×2/×4 y saltar al final.
- **Historial**: peleas como atacante y como defensor, con acceso a la repetición.
- **Clasificación**: global y semanal, con la posición propia; lista de ligas y recompensas.
- Rutas: `GET /pets/:id/combat`, `POST /pets/:id/combat/stats`, `PUT /pets/:id/combat/skills`, `POST /battles/matchmake`, `GET /battles`, `GET /battles/:id`, `GET /leaderboard`, `GET /arena/leagues`.
- Tiempo real: `battle:defended`.

**Raid Boss** · ⛔ · P2

- Muestra: jefe de la semana (elemento, nivel), barra de vida global, tiempo restante, contribución propia y clasificación de daño.
- Acciones: atacar con la mascota activa, ver repetición del ataque, ver historial de raids.
- Rutas: `GET /raid/current`, `POST /raid/attack`, `GET /raid/leaderboard`, `GET /raid/history`.
- Bloqueada por F-06 (el jefe puede quedar imposible de rematar) y S-04.

**Torneo** · ⛔ · P2

- Muestra: torneo actual (inscripción abierta o cuadro en juego), cuota, requisitos, cuadro eliminatorio y clasificación.
- Acciones: inscribir una mascota, seguir el propio camino en el cuadro.
- Rutas: `GET /tournament/current`, `POST /tournament/enter`, `GET /tournament/bracket`, `GET /tournament/standings`.
- Bloqueada por F-05 (no usa las estadísticas reales de las mascotas).

**Espectador** · ⛔ · P3

- Feed de momentos destacados y combates en directo. Rutas: `GET /spectator/highlights`, `GET /spectator/live`, `POST /spectator/subscribe`.
- Bloqueada: nada alimenta estos datos desde el motor de combate.

### 3.5 Pestaña Chat

**Chat con la mascota** · ✅ · P1

- Muestra: conversación con respuesta en streaming, nivel de inteligencia y tramo (Charla, Memoria, Agente), aviso cuando un mensaje se modera.
- Acciones: enviar mensaje, ver historial.
- Estados: sin proveedor configurado (lleva a ajustes de IA), cuota agotada, respuesta en curso, error del proveedor.
- Rutas: `POST /pets/:id/chat` (SSE), `GET /pets/:id/chat/history`, `GET /ai/usage`.

**Acciones pendientes** · ⬜ en móvil · P1

- Tarjetas de confirmación cuando la mascota propone una acción con efectos (por ejemplo, crear un recordatorio). Confirmar o rechazar; caducan a los 10 minutos.
- Rutas: `GET /pets/:id/actions`, `POST /pets/:id/actions/:actionId/confirm|reject`.

**Recuerdos** · ⬜ en móvil · P1

- Lista de hechos y resúmenes que la mascota recuerda. Olvidar uno o todos. Mensaje explicativo si la memoria aún no está desbloqueada.
- Rutas: `GET /pets/:id/memories`, `DELETE /pets/:id/memories/:memoryId`, `DELETE /pets/:id/memories`.

**Recordatorios** · ⬜ · P1

- Lista de recordatorios pendientes y vencidos; marcar como entregado, borrar. En móvil se entregan como notificación.
- Rutas: `GET /reminders`, `GET /reminders/due`, `POST /reminders/:id/delivered`, `DELETE /reminders/:id`.

**Aventura narrativa** · ⬜ · P2

- Muestra: aventura del día por escenas, con decisiones a elegir y recompensa final; historial de aventuras.
- Opciones: aventura gratuita diaria o premium con gemas.
- Rutas: `POST /adventure/start`, `POST /adventure/choose`, `GET /adventure/current`, `GET /adventure/history`.

**Voz** · ⛔ · P3

- Botón de micrófono para dictar y opción de escuchar las respuestas con la voz de la especie.
- Rutas: `POST /voice/transcribe`, `POST /voice/speak`, `GET /voice/config/:speciesId`.
- Bloqueada por F-08 (el audio no cabe en el límite de la petición) y S-06 (sin cuota).

**Mood Theater** · ⬜ · P3

- Micro-escenas espontáneas de la mascota, con opción de capturar el momento como sticker y un feed de momentos guardados.
- Rutas: `GET /mood-theater/current`, `POST /mood-theater/capture`, `GET /mood-theater/feed`. Evento: `pet:moment`.

### 3.6 Pestaña Progreso (nueva)

**Misiones** · ⬜ · P1

- Muestra: misiones diarias y semanales con progreso, recompensa y tiempo hasta el reinicio; resumen con el bonus por completar todas.
- Acciones: reclamar recompensa.
- Rutas: `GET /missions`, `GET /missions/summary`, `GET /missions/:id`, `POST /missions/:id/claim`.
- Tiempo real: `mission:progress`, `mission:completed`, `mission:daily_complete`.

**Logros y constelación** · ⬜ en móvil · P1

- Muestra: logros por categoría con progreso, puntos de logro y vista de constelación por categoría.
- Acciones: reclamar recompensa, exportar la constelación como imagen, hacer público el perfil de logros.
- Rutas: `GET /achievements`, `GET /achievements/constellation/:cat`, `POST /achievements/:id/claim`, `GET /users/:id/achievements`.
- Tiempo real: `achievement:unlocked` (muestra un aviso emergente en cualquier pantalla).

**Temporada y pase** · ⬜ · P2

- Muestra: temporada actual con tiempo restante, nivel y experiencia de temporada, pista de recompensas gratuita y premium, próxima temporada.
- Acciones: comprar el pase con gemas.
- Rutas: `GET /seasons/current`, `GET /seasons/progress`, `POST /seasons/pass/purchase`, `GET /seasons/:id`.
- Antes de construirla: resolver F-11 y S-05 (la compra puede cobrar sin entregar).

**Rituales** · ⬜ · P2

- Muestra: hábitos activos con su racha, ritual sugerido por la mascota y calendario de cumplimiento.
- Acciones: crear ritual, marcar como hecho.
- Rutas: `GET /rituals`, `GET /rituals/active`, `POST /rituals/create`, `POST /rituals/:id/check`.
- Tiempo real: `ritual:created`, `ritual:progress`, `ritual:completed`, `ritual:missed`.

**Eventos** · ⬜ · P2

- Calendario de festividades y eventos próximos. Rutas: `GET /events/upcoming`, `GET /environmental/festivals/upcoming`.

### 3.7 Pestaña Más

**Tienda** · ✅ · P1

- Muestra: catálogo filtrable por tipo (comida, medicina, juguetes, huevos, evolución, cosméticos, muebles), precio y moneda, saldo.
- Acciones: comprar con selector de cantidad (1 a 99) y confirmación para compras con gemas.
- Rutas: `GET /shop`, `POST /shop/buy`.

**Cofres** · ⬜ · P1

- Muestra: cofres en posesión por tipo, cofres comprables, límite diario de compras, contador de pity por tipo e historial de aperturas.
- Acciones: comprar, abrir con animación y resumen del botín.
- Debe mostrar las probabilidades de cada tipo de cofre.
- Rutas: `GET /chests`, `POST /chests/purchase`, `POST /chests/open`, `GET /chests/history`.
- Tiempo real: `chest:opened`, `chest:unlocked`.

**Inventario** · 🟡 · P1

- Muestra: objetos por tipo con cantidad. Acciones: usar sobre la mascota activa, regalar.
- Rutas: `GET /inventory`.

**Social** · ⬜ · P3

- **Regalos**: bandeja de recibidos (aceptar o rechazar, con nota de agradecimiento) y enviados con su estado. Enviar un objeto del inventario a la mascota de otro jugador.
  - Rutas: `POST /gifting/send`, `GET /gifting/history`, `POST /gifting/:id/accept|reject`.
- **Care package**: enviar un lote de comida, medicina y juguete a una mascota enferma. Ruta: `POST /care-packages/send`.
- **Comida en grupo**: crear o unirse a una sala con código. Rutas: `POST /group-feeding/join`, `POST /group-feeding/:id/complete`.
- **Pet Buddies**: emparejar dos mascotas, ver sus interacciones y el bonus de vínculo. Rutas: `POST /buddies/pair`, `POST /buddies/trigger`, `GET /buddies/interactions`, `GET /buddies/:petId`.
- Tiempo real: `gift:received`, `gift:accepted`, `gift:rejected`, `care:package-received`, `group:feeding-join`, `buddy:interaction`.
- Falta en el backend: lista de amigos y búsqueda de jugadores. Hoy todo exige conocer el identificador del otro usuario, lo que no es viable en una interfaz. Bloquea esta sección junto con S-03.

**Workshop de mods** · ⛔ · P3

- Explorar, valorar, reportar y descargar mods. Rutas: `GET /modding/workshop`, `GET /modding/:id`, `POST /modding/:id/rate|report|download`.
- Bloqueada: el backend no guarda los recursos del mod (F-04) y el saneado no es seguro (S-11).

**Cuenta y ajustes** · 🟡 · P1

| Sección | Opciones | Rutas | Estado |
|---|---|---|---|
| Perfil | Nombre visible, correo (solo lectura), nivel de cuenta, monedas y gemas | `GET /me`, `PATCH /me` | 🟡 |
| Región | Zona horaria; ubicación para el clima (activar, desactivar y borrar); cumpleaños | `PATCH /me` | ⬜ |
| IA | Proveedor (OpenAI, Hermes, personalizado), URL base, modelo, clave API (solo se muestra la máscara), probar conexión, borrar configuración, consumo del mes | `GET/PUT/DELETE /ai/config`, `POST /ai/config/test`, `GET /ai/usage` | ✅ |
| Notificaciones | Activar por tipo (hambre, salud, combates, misiones, regalos, recordatorios), máximo diario, horas de silencio | `PATCH /me` | ⬜ |
| Accesibilidad | Alto contraste, tamaño de texto, reducir animaciones, modo simple, minijuegos accesibles | `GET/PUT /accessibility/prefs`, `GET /accessibility/config` | ⬜ |
| Privacidad | Perfil de logros público, mascotas visibles en la API pública | `PATCH /me` | ⬜ |
| Seguridad | Cambiar contraseña, cerrar todas las sesiones, actividad reciente de la cuenta | `POST /auth/password`, `POST /auth/logout-all`, `GET /security/audit` | ⬜ |
| Dispositivos | Vincular el escritorio introduciendo su código de 6 dígitos | `POST /auth/device/confirm` | ✅ |
| Sesión | Cerrar sesión | `POST /auth/logout` | ✅ |
| Legal | Probabilidades de huevos y cofres, términos, privacidad, versión de la app | — | ⬜ |
| Borrar cuenta | Eliminar la cuenta y sus datos | sin backend | ⛔ |

El borrado de cuenta es requisito de las tiendas de apps y del RGPD, y no existe en el backend.

### 3.8 Fuera de la app

| Elemento | Qué hace | Estado |
|---|---|---|
| Widget de pantalla de inicio | Sprite, nombre y vitales de la mascota activa; toque para abrir | ✅ Android (Glance 4×2) |
| Notificaciones locales | Avisos de cuidados calculados en el dispositivo | ✅ Android (cada ~30 min) |
| Notificaciones push | Combate recibido, regalo, recordatorio, misión completada, mensaje de la mascota | ⬜ (falta FCM y APNs) |
| Live Activity (iOS) | Cuenta atrás de eclosión en la isla dinámica | ⬜ |
| Modo sin conexión | Ver el último estado y encolar cuidados para enviarlos al reconectar | ⛔ (F-04) |

### 3.9 Diferencias entre Android e iOS

La especificación es la misma. Solo cambia lo que depende de la plataforma:

| Aspecto | Android | iOS |
|---|---|---|
| Estilo | Material 3 Expressive, color dinámico | Liquid Glass |
| Inicio de sesión social | Google (Credential Manager) | Sign in with Apple |
| Compras | Play Billing | StoreKit 2 |
| Push | FCM | APNs |
| Widget | Glance | WidgetKit y Live Activity |
| Estado | Funcional | Sin código |

El inicio de sesión social y las compras no tienen backend todavía.

---

## 4. App de ordenador

Tiene tres superficies: la **ventana de la mascota**, la **bandeja del sistema** y el **panel de control**.

### 4.1 Ventana de la mascota

Ventana transparente, sin bordes y siempre visible, que ocupa la parte inferior de la pantalla. Los clics la atraviesan salvo sobre la mascota. · ✅ (ampliar) · P1

**Lo que hace hoy**: la mascota camina, se sienta, duerme y come según su estado; muestra accesorios según clima y festividad; burbuja de chat flotante; avisos de combate recibido.

**Interacciones que debe tener**

| Gesto | Acción | Estado |
|---|---|---|
| Clic | Reacción (animación elástica) | ✅ |
| Doble clic | Abre la burbuja de chat | ⬜ |
| Arrastrar | Mueve la mascota de sitio | ✅ |
| Clic derecho | Menú rápido: Alimentar, Bañar, Dormir o Despertar, Jugar, Chat, Abrir panel, Pausar | ⬜ |
| Soltar un archivo o texto encima | Lo envía al chat como mensaje (con confirmación) | ⬜ |

**Burbujas y avisos sobre la mascota**

- Burbuja de chat con respuesta en streaming y campo de texto. ✅
- Tarjetas de confirmación de acciones del agente, incluidas las propias del ordenador (abrir enlace, leer portapapeles). ✅
- Mensajes espontáneos: hambre, saludo diario, misión completada, logro desbloqueado, regalo recibido, resultado de combate. 🟡
- Indicador discreto de estado crítico (hambre o salud bajas) sobre la cabeza. ⬜

**Reglas de comportamiento**

- No interrumpir en pantalla completa ni cuando el modo «No molestar» esté activo.
- La mascota pasa a modo «solo» tras dos horas sin actividad del usuario y vuelve al detectar actividad (ya lo calcula el backend con el heartbeat).

### 4.2 Bandeja del sistema

Hoy solo tiene «Mostrar/Ocultar Mascota» y «Salir». Debe ofrecer las acciones de un clic que justifican tener la mascota en el ordenador: · 🟡 · P1

| Opción | Acción |
|---|---|
| Estado de la mascota | Línea informativa: nombre, nivel y la estadística más baja |
| Alimentar | Da la comida favorita disponible, o abre el selector |
| Bañar · Dormir/Despertar | Acción directa |
| Abrir chat | Muestra la burbuja de chat |
| Abrir panel | Abre el panel de control |
| Mostrar/Ocultar mascota | Ya existe |
| Pausar / No molestar | Oculta avisos y burbujas durante 1 h, hasta mañana o hasta reactivarlo |
| Iniciar con el sistema | Casilla |
| Salir | Ya existe |

El icono de la bandeja debe cambiar cuando la mascota necesita atención.

### 4.3 Panel de control

Ventana normal con pestañas. Hoy tiene siete: Mascota, Eclosionar, Juegos, Arena, IA, Tienda y Cuenta. Propuesta, con los mismos nombres que el móvil:

| Pestaña | Contenido | Respecto al móvil |
|---|---|---|
| **Mascota** | Inicio, colección, eclosión, hábitat, breeding | Igual. La eclosión pasa a ser una sección de esta pestaña |
| **Jugar** | Minijuegos, cocina, entrenamiento, arena, raid, torneo | Igual. Une las pestañas actuales Juegos y Arena |
| **Chat** | Chat, recuerdos, recordatorios, aventura | Igual, más las herramientas del ordenador (§4.4). Sustituye a IA |
| **Progreso** | Misiones, logros, temporada, rituales | Igual. Los logros y la constelación ya existen aquí |
| **Tienda** | Tienda, cofres, inventario | Igual |
| **Social** | Regalos, buddies | Igual |
| **Ajustes** | Cuenta, IA, notificaciones, accesibilidad, escritorio, desarrolladores | Añade las secciones Escritorio y Desarrolladores |

Las pantallas de cada pestaña siguen la descripción del móvil (§3.3 a §3.7) con las mismas rutas. Diferencias de diseño:

- **Más densidad**: en Mascota, las estadísticas, el vínculo y el resumen del día caben en una sola vista sin desplazamiento.
- **Arena**: repetición y registro del combate lado a lado.
- **Hábitat**: colocar muebles arrastrando con el ratón.
- **Minijuegos**: controles de teclado y ratón.

Estado actual de lo ya construido en el panel:

| Pantalla | Estado |
|---|---|
| Mascota (vitales y cuidados), Eclosionar, Juegos, Arena con repeticiones, Tienda | ✅ |
| IA: ajustes BYOK, chat, recuerdos, tarjetas de confirmación, recordatorios | ✅ |
| Logros y constelación (con exportación a imagen) | ✅ |
| Ajustes de notificaciones | ✅ |
| Cuenta con código de vinculación | ✅ |
| Misiones, cofres, vínculo, temporada, rituales, hábitat y el resto de la Fase 7 | ⬜ |

### 4.4 Opciones exclusivas del ordenador

**Vincular con el móvil** · ✅ · P1

- El ordenador muestra un código de 6 dígitos con cuenta atrás de 5 minutos; se confirma desde el móvil.
- Rutas: `POST /auth/device/start`, `POST /auth/device/poll`.

**Hermes local** · ✅ · P2

- En Ajustes › IA: usar un agente Hermes que corre en el propio equipo. Campos: URL (por defecto `127.0.0.1:8642`), modelo y clave, guardados solo en el equipo.
- Avisar de sus límites: sin herramientas de agente ni memoria nueva.
- Rutas: `POST /pets/:id/chat/local/context`, `POST /pets/:id/chat/local/sync`.

**Herramientas del agente en el equipo** · ✅ · P2

- Permitir a la mascota proponer **abrir un enlace** y **leer el portapapeles**. Cada uso muestra una tarjeta de confirmación con el destino exacto.
- En Ajustes: interruptor independiente para cada herramienta, desactivadas por defecto.

**Ajustes › Escritorio** · ⬜ · P1

| Opción | Descripción |
|---|---|
| Iniciar con el sistema | Arranque automático |
| Monitor | En cuál vive la mascota cuando hay varios |
| Tamaño de la mascota | Pequeño, mediano, grande |
| Siempre visible | Mantener por encima de las demás ventanas |
| Movimiento | Caminar libremente o quedarse quieta |
| Atajo global | Combinación para abrir el chat |
| No molestar | Horario, y pausa automática en pantalla completa |
| Compartir actividad | Enviar el heartbeat de actividad (`POST /environmental/activity`); se puede desactivar |
| Sonido | Volumen de efectos y de la voz |

**Ajustes › Desarrolladores** · ⬜ · P3

- **API keys**: crear con nombre y permisos, ver la clave una sola vez al crearla, listar y revocar. Rutas: `POST /apikeys`, `GET /apikeys`, `DELETE /apikeys/:id`.
- **Webhooks**: registrar URL y eventos, ver el secreto de firma, probar, ver estado de entregas y borrar. Rutas: `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id`, `POST /webhooks/:id/test`.
- **Publicar mods** · ⛔: subir especie, mueble o minijuego. Ruta: `POST /modding/publish`.
- **Modelos de IA** · ⛔: elegir proveedor por tipo de tarea y ver presupuesto. Rutas: `GET /ai/models`, `POST /ai/models/config`, `GET /ai/models/budget`. Bloqueada: el router no está conectado al chat real.

Esta sección va solo en el ordenador: son tareas de configuración que no encajan en una pantalla de móvil. Antes de exponer los webhooks hay que cerrar el hallazgo S-02.

**Actualizaciones** · ⬜ · P2

- Aviso de versión nueva e instalación desde la app. No está configurado el actualizador.

### 4.5 Solo en compilaciones de desarrollo

**DevKit** · ⬜ · no se distribuye

- Panel oculto para recargar datos de juego, sembrar usuarios y lanzar acciones de prueba. Rutas: `/dev/*`.
- No debe existir en el instalador público. El backend no registra estas rutas en producción.

### 4.6 Lo que no va en el ordenador

- Widget, Live Activity y notificaciones push: se sustituyen por la propia mascota y las notificaciones nativas del sistema.
- Modo sin conexión: el ordenador se usa conectado; basta con mostrar «sin conexión» y reintentar.
- Compras con dinero real: se hacen en el móvil por las tiendas de apps. En el ordenador las gemas se muestran y se gastan, pero no se compran.

---

## 5. Coherencia entre apps

**Mismos nombres.** Hoy difieren: «Juegos» y «Arena» en el ordenador frente a «Jugar» en móvil; «IA» frente a «Chat». Unificar en: Mascota, Jugar, Chat, Progreso, Tienda, Social, Ajustes.

**Mismo estado en tiempo real.** Cada pantalla se suscribe a los eventos que la afectan, de modo que una acción en un dispositivo se refleja en el otro sin recargar:

| Evento | Pantallas que deben refrescarse |
|---|---|
| `pet:update`, `pet:fed`, `pet:cleaned`, `pet:slept`, `pet:level_up`, `pet:evolved` | Inicio, ficha de mascota, ventana de la mascota, widget |
| `pet:vitals-critical`, `pet:notification` | Aviso en la app y notificación del sistema |
| `battle:defended`, `pet:battle-won`, `pet:battle-lost` | Arena (historial, ELO), aviso |
| `mission:progress`, `mission:completed`, `mission:daily_complete` | Misiones, resumen del día |
| `achievement:unlocked` | Aviso emergente, logros |
| `chest:opened`, `chest:unlocked` | Cofres, inventario |
| `bonding:tier_up`, `bonding:tier_down`, `bonding:decay` | Medidor de vínculo |
| `gift:received`, `gift:accepted`, `gift:rejected`, `care:package-received` | Social, inventario |
| `ritual:*` | Rituales |
| `environmental:changed` | Inicio, ventana de la mascota |
| `auth:expired` | Renovar la sesión y reconectar |

**Mismos estados en todas las pantallas.** Cargando, vacío con una acción sugerida, error con reintento y sin conexión. Los límites del servidor (429) se muestran con el tiempo de espera, no como error genérico.

**Saldo siempre visible.** Monedas y gemas en la cabecera, con acceso a la tienda.

## 6. Orden de construcción recomendado

1. **P1 en móvil y ordenador**: Misiones, Cofres, Vínculo, Recordatorios y ampliación de la bandeja y del menú contextual de la mascota. En móvil, además, Logros (ya existe en el ordenador).
2. **Cuenta completa**: región y ubicación, notificaciones, cambio de contraseña y cierre de sesiones. En el backend: recuperación de contraseña y borrado de cuenta.
3. **P2 con backend listo**: Bienvenida tras ausencia, Rituales, Accesibilidad, Aventura, Genes, Entrenamiento, Breeding.
4. **P2 que requiere arreglos previos**: Temporada y pase, Hábitat, Cocina, Raid, Torneo.
5. **P3**: Social (necesita lista de amigos en el backend), Desarrolladores en el ordenador, Mood Theater, y las features bloqueadas una vez rediseñadas.
