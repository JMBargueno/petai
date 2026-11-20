# Spec 42 — Reproductor MP3 y música ambiente

## 1. Qué se pide
Un mueble que va en **cualquier sala** y que **desbloquea una función de la app**: un reproductor con temas lofi en bucle y sonidos de ambiente (lluvia, trueno, viento, grillos y pájaros) que se mezclan por capas. El Pockai lo usa dentro del hábitat y, como el reloj del pomodoro, lo lleva fuera, en el escritorio.

## 2. El mueble
- `habitats.json` → `mp3` («Reproductor MP3»): `room: "*"`, `unique: true`, 300 monedas, 1×1, de suelo, sin buffs e `interaction: "listen"`.
- `room: "*"` significa **cualquier sala**:
  - `POST /habitat/furniture/:id/place` acepta `roomId`. Sin él (clientes antiguos) va a la primera sala del catálogo.
  - Se comprueba el `unlockStage` de la sala elegida.
- `unique: true`:
  - Solo se compra una vez. La segunda compra da 400 y no cobra.
  - Para cambiarlo de sala: `PATCH /habitat/items/:id { roomId }` (sin cobro), solo para muebles `*`. Sin `x`/`y` va al primer hueco.
- Tienda:
  - Escritorio: sale en todas las salas. Muestra «Aquí» en la sala donde está y «Traer aquí» en las demás.
  - Android: solo cambia el filtro, para que salga en todas las salas.
- Validación (`game-data.schemas.ts`, `validate-game-data.js`, `check_habitats.mjs`): la huella de un mueble `*` tiene que caber en todas las salas.

## 3. Interacción `listen`
Es una interacción nueva y está dada de alta en todas las listas: zod, `protocol.ts`, `USE_CLIP` (clip `happy`) y `habitat.service`. También en los dos validadores y en `balance.json`:
- `habitat.use.effects.listen` = +2 de felicidad;
- `personality.room.actions.listen`;
- el evento `furniture_listen`.

El texto de memoria es `FURNITURE_LISTEN`.

## 4. Habilidad que desbloquea
- `ambient_mixer` («Música ambiente»), en `desktop-skills.ts` y en su espejo del escritorio. Lleva `requiredFurniture: { id: 'mp3' }`.
- Lo decide el servidor. `getPets` y `getPetById` devuelven `ownedFurniture`, que son los muebles colocados. `skillStateOf` bloquea la habilidad si falta el mueble. Si no llega la lista, cuenta como que no lo tiene (falla cerrado). `updateDesktopSkills` también lo rechaza.
- En el escritorio, `ownedFurniture` (store) se rellena desde la mascota y desde el hábitat. La tarjeta de la habilidad pide «Compra el Reproductor MP3 en el hábitat».

## 5. Audio
- Generado con ElevenLabs (`pnpm sfx:generate --only music.lofi,amb.mixer`):
  - Música: `music.lofi.{night,tea,bits}`. Usa la API de música (`music.compose`, instrumental, 90 s) y necesita plan de pago.
  - Capas: `amb.mixer.{rain,thunder,wind,crickets,birds}`. Efectos en bucle de 20–28 s.
- El bus `music` admite hasta 180 s. Al importar, la música lleva un fundido corto en cada extremo para que el empalme del bucle no dé un golpe.
- Tomas: de momento se usa la 1 de cada sonido. Para cambiarla: `pnpm sfx:review` y después `pnpm sfx:import --only music.lofi,amb.mixer`.

## 6. Mezclador (`@pockai/audio` → `mixer.ts`)
- Estado puro y serializable: `{ playing, track, trackVolume, layers }`. Solo suena un tema a la vez; las capas se suman, cada una con su volumen.
- `syncMixer` lleva el estado al motor con el mínimo de cambios.
- Motor:
  - `loop(id, { volume, player: true })` y `setLoopVolume`.
  - Los loops del reproductor salen por una rama `player` de su bus (`playerBusGain`). Respetan el interruptor general, el del bus y su volumen, pero **no se callan en el escritorio ni sin foco**, porque es música que el usuario ha puesto a propósito.
- Escritorio:
  - `lib/mixer.ts` guarda la mezcla en local. Al abrir la app no arranca solo.
  - Solo suena con la habilidad activa (`setMixerEnabled`, desde `App.svelte`).
  - Panel: `MixerWidget` dentro de la tarjeta de la habilidad.

## 7. Fuera del hábitat: objeto del Éter
- `mp3-player` en `ETHER_KINDS`, con `skill: 'ambient_mixer'`.
- `mp3PlayerWant` lo saca del Éter mientras suena y lo guarda al pausar. Al cambiar de tema el Pockai lo toca con la hebra. Sin Pockai, el objeto lo hace solo.
- Arte: `mp3Art.ts`, pixel art de 36×50 a ×2, teñido con el Flujo, con un ecualizador que baila mientras suena.
- Controles al pasar el ratón: pausar y siguiente tema.
- `PetView` se alegra al poner música.

## 8. Chat
`play_ambient { track?: night|tea|bits|none, layers?: [...] }` y `stop_ambient`. Las dos piden confirmación y las ejecuta el escritorio. El servidor comprueba que la habilidad está activa.

## 9. Arte
- Conceptos con Nano Banana (`scripts/sprites/concept/generate.mjs`):
  - el isométrico, usando la hoja de muebles como referencia de estilo;
  - uno frontal en pixel art, en tres Flujos.
- Los dos se pasaron a mano:
  - el mueble a `scripts/sprites/furniture.ts`: base-altavoz de madera con dos conos, reproductor de pie con pantalla y rueda, y auriculares;
  - el objeto del Éter a `mp3Art.ts`.
