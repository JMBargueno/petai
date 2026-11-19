# Plan de efectos de sonido para PetAI / Pockai

## Contexto
Hoy no hay audio en ningún cliente: no hay `Audio`, WebAudio, SoundPool ni ficheros de sonido, y tampoco ajustes de volumen. El único audio del repo es el TTS del backend (`backend/src/modules/voice/`). La idea es meter una API key de ElevenLabs para generar los efectos. Este plan cubre tres cosas:
- **Dónde** suena cada cosa: un catálogo con IDs y el punto del código donde se engancha.
- **Cómo** se generan los sonidos y se reproducen igual en desktop, Android y el futuro iOS.
- **Cómo** se varían por programa los sonidos genéricos del Pockai según especie, etapa y elemento.

Hay algo a favor: gran parte de la experiencia ya pasa por código compartido. Son `@pockai/scene` (pixi, en desktop y en el WebView de Android), `@pockai/minigames` (también WebView) y una tabla única de eventos del Pockai (`shared/scene/src/effects/clips.ts` y `reactions.ts`). Un motor de audio web compartido cubre así el 90 % de los casos en todas las plataformas.

---

## 1. Decisiones de arquitectura

### 1.1 ElevenLabs solo en tiempo de desarrollo (recomendado)
- La API key **no va en clientes ni en el backend en producción**. Vive en `.env` local o en un secreto de CI como `ELEVENLABS_API_KEY`.
- Un script genera los sonidos una vez y los guarda en el repo como assets: `shared/assets/audio/`.
- Ventajas: coste fijo, cero latencia, funciona offline, sin riesgo de que se filtre la key y con control de calidad (eliges entre varias tomas).
- Endpoint: `POST https://api.elevenlabs.io/v1/sound-generation` con la cabecera `xi-api-key`.
  - Body: `{ text, duration_seconds (0.5–30), prompt_influence (0–1), loop, model_id }`.
  - Se usa `loop: true` en los ambientes.
  - Antes de implementar hay que comprobar en la documentación actual el modelo vigente y los créditos por segundo.

### 1.2 Manifiesto único `shared/game-data/sounds.json`
Cada entrada lleva estos campos:
```json
{
  "id": "pet.eat.crunch",
  "bus": "pet",
  "prompt": "small cute creature crunching a crispy snack, close mic, dry, no music",
  "duration": 0.8,
  "loop": false,
  "variants": 3,
  "candidates": 4,
  "gainDb": -6,
  "cooldownMs": 120,
  "pitchProfile": "creature",
  "platforms": ["scene", "android-native"]
}
```
- `variants` son las tomas que se quedan en el juego. Se rotan para que no suene repetitivo.
- `candidates` son las tomas que se generan para elegir entre ellas.
- Ese mismo fichero alimenta el script de generación, el motor web y el `UiSounds.kt` de Android.

### 1.3 Pipeline de generación: `scripts/sfx/`
1. `generate.ts` lee el manifiesto y llama a ElevenLabs solo para los IDs nuevos o con el prompt cambiado. Lo sabe por `sounds.lock.json`, que guarda el hash del prompt.
2. Guarda los candidatos en `scripts/sfx/.candidates/<id>/` (en git-ignore).
3. `review.html` es una página local de escucha, equivalente a la hoja de contactos que se usa con el arte. Para cada ID reproduce los candidatos, con y sin la variación por especie, y permite marcar cuáles se quedan.
4. `postprocess.ts` usa ffmpeg para:
   - recortar silencios;
   - normalizar el volumen (UI a −20 LUFS, Pockai y efectos a −16, ambiente a −24);
   - hacer crossfade en los loops;
   - exportar a **.m4a (AAC)**, que funciona en WebView2, en Android y en WKWebView de iOS, más un `.ogg` de respaldo.
5. Resultado: `shared/assets/audio/<bus>/<id>_<n>.m4a`. Presupuesto orientativo de menos de 6 MB en total.

### 1.4 Motor compartido: nuevo paquete `shared/audio` (`@pockai/audio`)
Funciona con WebAudio y se usa en desktop (Tauri), en el WebView de escena de Android, en el WebView de minijuegos y en el futuro iOS.
- **Buses** con volumen propio: `master`, `ui`, `sfx`, `pet`, `ambient` (y `music`, reservado).
- **API:**
  - `play(id, {species, stage, element, rarity, pan, gain})`
  - `loop(id)` y `stopLoop(id)`
  - `cue(effectId, phase)`
  - `setSettings()`
  - `duck(bus, dB, ms)`, que baja el ambiente cuando hay una fanfarria.
- **Control de saturación:**
  - `cooldownMs` por ID;
  - un máximo de voces por bus;
  - el `ReactionDeduper` ya existente (1,5 s, en `desktop/src/lib/animation/eventMap.ts`) evita el doble sonido entre el disparo local y el del backend.
- **Desbloqueo de autoplay** en el primer gesto del usuario.
- **Silencio automático** cuando `document.hidden`. Además, la opción "silenciar cuando la app no tiene foco" está **activada por defecto en desktop**: es una mascota que vive en el escritorio todo el día.
- **Accesibilidad:** modo "audio reducido", que deja solo UI y avisos importantes. Se añade a `shared/game-data/accessibility.json`.

### 1.5 Variación programática de los sonidos genéricos del Pockai (`pitchProfile`)
Se genera **un único set genérico de "criatura"** y se altera en tiempo real con nodos de WebAudio:

| Factor | Técnica | Valores orientativos |
|---|---|---|
| Etapa | `playbackRate` | baby ×1.30 · juvenile ×1.12 · adult ×1.00 · final ×0.85 |
| Especie | `detune` fijo a partir de un hash del id | entre −300 y +300 cents, estable por especie |
| Elemento | cadena de filtros | fuego: saturación suave (WaveShaper) · agua: lowpass 3 kHz + chorus · planta: bandpass cálido · eléctrico: ring-mod sutil o bitcrush leve · sombra: −2 st + reverb oscura · luz: highshelf +4 dB + shimmer (delay agudo) |
| Rareza | cola de reverb | legendaria y mítica: reverb más larga; shiny: capa de destello extra |
| Humor | ajuste de pitch y tempo | triste −1 st y más lento · feliz +1 st |
| Cada reproducción | jitter aleatorio | ±40 cents, ±1,5 dB y una variante al azar |

Una sola tabla, `pitchProfiles` en `@pockai/audio`, define los perfiles `creature`, `creature-voice`, `footstep`, `none` y `element`.

Limitación de Android: `SoundPool` nativo solo admite rate de 0.5 a 2.0 y no tiene filtros. Los sonidos del Pockai **siempre salen de la escena web**, que ya pinta la mascota. SoundPool queda solo para la UI nativa de Compose.

### 1.6 Ajustes de usuario
- **Desktop:** volumen general, sliders por bus, "silenciar sin foco", "ambiente en el escritorio" (apagado por defecto) y "sonidos del Pockai en el escritorio" (bajos por defecto). Van en `desktop/src/components/DesktopSettingsPanel.svelte`.
- **Android:** los mismos ajustes en la pantalla de configuración. Se pasan al WebView con `window.pockaiScene.receive({type:'audio:settings', ...})`, ampliando `shared/scene/src/protocol.ts`, y también al WebView de minijuegos.
- Se guardan en local por dispositivo. Sincronizarlos con el backend es opcional y no hace falta en esta primera versión.

---

## 2. Catálogo de sonidos (desglose por zona)
Abreviaturas de plataforma: **E** = escena web compartida (desktop + Android + iOS), **D** = solo desktop, **A** = UI nativa de Android (SoundPool).

### 2.1 Interfaz compartida (`ui.*`), unos 22 sonidos
| ID | Dónde se engancha |
|---|---|
| `ui.tap`, `ui.tap_soft` | `desktop/src/components/ui/Button.svelte`, `TileButton.svelte`; Android en un `Modifier.clickSound()` común |
| `ui.tab` | pestañas y subpestañas de `ControlPanel.svelte`; navegación de `AppRoot.kt` |
| `ui.toggle_on/off` | `ui/Switch.svelte`, `Segmented.svelte` |
| `ui.modal_open/close` | `ui/Modal.svelte`, `ConfirmDialog.svelte` |
| `ui.confirm`, `ui.cancel` | botones de confirmar y cancelar en los diálogos |
| `ui.notice_ok`, `ui.error` | `showPanelNotice('ok'/'error')`, `desktop/src/lib/ui/errors.ts`; snackbars de `vm.messages` |
| `ui.notification` | `desktop/src/lib/notifications.ts` (`notifyNow`) y la bandeja de entrada |
| `ui.coin_gain`, `ui.gem_gain`, `ui.xp_tick` | `CurrencyPill.svelte` al subir el saldo; pantallas de resultado |
| `ui.purchase`, `ui.purchase_fail` | `views/ShopView.svelte` (`buy`), `ShopScreen.kt`, `WardrobeTab`, `HabitatTab`, `SeasonsTab` |
| `ui.equip`, `ui.unequip` | `WardrobeTab.svelte` |
| `ui.file_drop` (D) | `FileDropModal` |
| `ui.slider_tick` | los sliders de volumen (sirve de previsualización) |
| `ui.hover` (D, opcional y apagado por defecto) | botones de desktop |

### 2.2 Pockai: cuerpo y voz genéricos (`pet.*`, con `pitchProfile`), unos 38 sonidos
Se enganchan sobre todo en la tabla compartida `clipsForPetAction` (`shared/scene/src/effects/clips.ts`). Se añade `soundForPetAction` junto a ella. En desktop se enganchan también en `PetView.svelte` (`react()`, `triggerAnim`) y en los comandos del desk-brain.

| Grupo | IDs | Disparador |
|---|---|---|
| Comer | `pet.eat.crunch`×3, `pet.eat.slurp`, `pet.eat.gulp`, `pet.eat.burp` (raro, más probable con personalidad traviesa) | `fed`, clip `eat`, mueble `food_bowl`, visita `share_food` |
| Dormir | `pet.sleep.yawn`, `pet.sleep.snore` (loop suave), `pet.sleep.mumble`, `pet.wake.stretch` | `slept`, `woke`, estado base `sleep`, mood `yawn`/`stretch`, desk-brain `nap` |
| Ánimo | `pet.happy.chirp`×3, `pet.love.purr`, `pet.laugh`, `pet.sad.whimper`, `pet.cry`, `pet.surprised`, `pet.tired.sigh`, `pet.hungry.growl` (estómago) | clips `happy`, `love`, `sad`, `cry`, `surprised`, `tired`, `hungry`; `bonding_up/down`; `welcome_back` (4 niveles: offended, sad, emotional, happy) |
| Salud | `pet.sick.cough`, `pet.sick.sneeze`, `pet.heal.relief` | `sick`, `vitals_critical`, `healed` |
| Higiene | `pet.clean.scrub`, `pet.clean.bubbles`, `pet.clean.shake` (sacudida de agua) | `cleaned`, muebles bathe |
| Hablar | `pet.talk.babble` (6 granos cortos que se encadenan al azar, al estilo "animalese") | clip `talk`, burbujas de `lib/barks.ts` y `speech-queue.ts`, chat |
| Cantar y bailar | `pet.sing.hum` (melodía tarareada; se puede transponer), `pet.dance.steps` | mood_moment `sing`/`dance` |
| Movimiento | `pet.step`×4 (patitas), `pet.land`, `pet.fall.whoosh`, `pet.climb.scrabble`, `pet.drag.lift`, `pet.bounce` | `walk` (sincronizado con los frames), `land`, `fall`, `climb`, `drag`; rebotes de `lib/physics/petPhysics.ts` según `bounceCount` |
| Interacción | `pet.pet.rustle` (caricia), `pet.squash.boing`, `pet.highfive.slap`, `pet.zoomies` | `handleClick`/`squash` en PetView, `behaviorEngine` `petting`/`zoomies`/`high_five` |
| Combate | `pet.attack.grunt`, `pet.hit.hurt`, `pet.victory.cheer`, `pet.defeat.groan` | clips `attack`, `hit`, `victory`, `defeat` |

### 2.3 Elementos y habilidades (`elem.*`, `skill.*`), unos 26 sonidos
- `elem.<fire|water|plant|electric|shadow|light>.accent`: 6 sonidos. Son la firma del elemento y se usan en invocación, bonus de afinidad en minijuegos y `summon`.
- Habilidades de `skills.json` agrupadas por fuerza: `skill.<elemento>.light|medium|heavy` = 18 (ember, flame_burst e inferno, y así con el resto).
- Neutrales: `skill.neutral.strike`, `skill.neutral.slam`, `skill.guard`, `skill.heal` = 4.

### 2.4 Progresión y recompensas (`reward.*`), unos 24 sonidos
| ID | Disparador |
|---|---|
| `reward.level_up` | `level_up` + efecto `chispa-despertar` |
| `reward.evolve.charge` (loop), `reward.evolve.burst` | `evolved` + `capullo-telar` (carga durante la fase `hold` y estallido al final) |
| `egg.shake`, `egg.crack`×2, `egg.hatch` | `HatchView.svelte` / `EggSprite.svelte` / `hatchEgg` en PetView + `huevo-grietas` |
| `reveal.<normal|rare|super_rare|legendary|mythic>`, `reveal.shiny` | revelación de rareza tras eclosionar + `revelacion-densidad` |
| `achievement.<common|rare|epic|legendary>` | `AchievementToast.svelte` + `sello-logro` |
| `chest.shake`, `chest.open.<bronze|silver|gold|diamond|mythic>` | `ChestsTab.svelte` + `cofre-tier` |
| `reward.mission`, `reward.daily_gift` | `mission_completed` (+ `confeti-codices`), regalo diario |
| `reward.gift` | `gift_received` / `care_received` + `paquete-hebra` |
| `reward.ritual.ok`, `reward.ritual.miss` | `ritual_completed` (+ `destello-ritual`), `ritual_missed` |

### 2.5 Efectos especiales del escritorio (`fx.*`), unos 20 sonidos
Se sincronizan con `EffectPlayer` (`shared/scene/src/effects/timeline.ts`) y sus fases: el motor llama a `audio.cue(effectId, phase)` en `enter/hold/exit`.
- **Portales y viajes:** `portal-nexo` (abrir, zumbido en loop, cerrar), `proyeccion-astral`, `velo-eter`, `altar-santuario`, `hebra-invocacion`. Se usan en `departThroughPortal`, `returnThroughPortal`, `enterAltar`, `emergeFromAltar`, `visitTravel.ts` y en la llegada de visitantes.
- **Ánimo y estado:** `glitch-animo` (estática digital), `polvo-estatico` (chisporroteo), `desfragmentacion` (zumbido de "apagado" para dormir), `descarga-calida`, `resonancia`.
- **Brillos:** `destello-prisma`, `estela-flujo`, `chispa-despertar`, `trenza-juramento`, `manitas-espirituales`, `polvo-impacto`.
- **Clima:** `clima`, que reutiliza los loops del apartado 2.8.
- **Combate y grandes momentos:** `triunfo-raid` (fanfarria), `confeti-codices`, `cofre-tier`, `sello-logro` (estos últimos ya están en 2.4).

### 2.6 Minijuegos (`mg.*`), unos 40 sonidos
Comunes: `mg.countdown.tick`, `mg.countdown.go` (la cuenta 3‑2‑1 de `MinigamesTab.svelte`), `mg.score_tick`, `mg.result.good`, `mg.result.great`, `mg.new_record`, `mg.pause`, `mg.timer_warning` (los últimos 5 s; hay que añadir la señal en `host.ts`) y `mg.item_drop` (objeto obtenido).

Por juego. Se enganchan en el campo `last` del estado de cada juego dentro de `shared/minigames/src/views/*View.ts`, y el bundle importa `@pockai/audio` directamente:
| Juego | Sonidos |
|---|---|
| `catch_food` (Cosecha del Éter) | fruto recogido, fruto de la marea (más brillante), polvo estático (chasquido), cambio de marea; la racha sube por la escala (`mg.combo.step`) |
| `memory_match` (Cristal de Recuerdos) | destello inicial, girar faceta, pareja (ding), fallo (thunk), tablero completo (fanfarria corta) |
| `reflex` (Pesca de Códices) | algo aflora, Códice pescado, pescado rápido (agudo), se hunde, señuelo (el sedal se enreda) |
| `pulso_voltaico` | perfect, good, miss, combo up (pitch que sube con el combo, por programa), combo roto, metrónomo y beat (o sintetizado en WebAudio para que vaya exacto al BPM) |
| `corriente_datos` | cambio de carril, paquete recogido (pitch sube con el combo), golpe corrupto y aturdimiento |
| `raiz_fractal` | rotar pieza, el camino se ilumina, florece (bloom), siguiente tablero |
| `cifrado` | mostrar glifo (6 tonos de una escala, que forman una melodía), entrada correcta (mismo tono), error, ronda superada |
| `faro_claridad` | haz en loop, progreso de purificación (subida), celda purificada, la corrupción se expande, derrota |
| `forja_termica` | fuelle, zumbido del fuego en loop (sube con la temperatura), zona dorada, pieza templada (clang), quemado (siseo) |

### 2.7 Cocina (`cook.*`), unos 12 sonidos (solo desktop hoy, en `CookingTab.svelte`)
- `cook.ambient` (loop de cocina: fuego, burbujeo suave).
- `cook.memorize.show`, que suena con un tono creciente por cada ingrediente que se muestra.
- `cook.ingredient.tap` y `cook.ingredient.place`.
- `cook.undo`, `cook.serve` y `cook.timer_warning`.
- Resultados: `cook.result.perfect`, `cook.result.good` y `cook.result.fail` ("Tiempo agotado").
- Toques especiales para ingredientes con temática (lightning, sun_nectar, ink, phoenix, star_dust): reutilizan `elem.*.accent`.
- Reacción del Pockai: `cooked` → `pet.eat.*` + `pet.happy`.

### 2.8 Aventuras (`adv.*`), unos 30 sonidos
En `AdventureTab.svelte`, `StorySceneView.svelte` y `AdventureScreen.kt`, siguiendo las fases `enter/await/react/exit`.
- **Interfaz de la historia:** `adv.page` (cambio de escena), `adv.choice.hover/select`, `adv.narration.blip` (opcional, tipo máquina de escribir).
- **Stingers por tipo de evento:** `adv.event.encounter`, `obstacle`, `discovery`, `plea` y `omen` (5).
- **Por enfoque elegido:** `adv.approach.brave`, `careful`, `kind`, `curious` y `cunning` (5).
- **Consecuencia:** `adv.react.good`, `adv.react.bad`.
- **Final:** `adv.end.win`, `adv.end.partial`, `adv.end.lose`, `adv.memory` (recuerdo obtenido).
- **Loops de ambiente por localización** (11):
  - rotura-del-nexo: vacío y polvo estelar
  - claro-de-las-hebras: bosque con luciérnagas
  - corriente-de-datos: agua digital
  - orilla-del-telar: viento con telar
  - paramo-de-ascuas: brasas
  - campo-de-nodos: zumbido eléctrico
  - santuario-a-la-deriva
  - ciudadela-del-nexo
  - coliseo-de-resonancia: multitud lejana
  - despensa-del-santuario
  - sala-de-sincronia
- Hora del día (dawn/day/dusk/night) y clima: el ambiente nocturno se consigue con un filtro y la capa de clima del apartado 2.9.

### 2.9 Hábitats y clima (`hab.*`, `wx.*`), unos 28 sonidos
- **Ambiente por sala** (loop, suena solo con la pestaña o pantalla del hábitat abierta):
  - `hab.sala` (interior acogedor, tic de reloj lejano)
  - `hab.jardin.day` (pájaros) y `hab.jardin.night` (grillos)
  - `hab.santuario` (dron místico)
  - `hab.citafinal`
- **Clima** (desde `shared/scene/src/ambience/`, que usa códigos WMO):
  - loops: `wx.rain`, `wx.rain_indoor` (lluvia en la ventana, para salas interiores), `wx.snow_wind`, `wx.fog_drone`, `wx.storm`
  - one-shots: `wx.thunder`×3, con retardo aleatorio respecto al relámpago visual
- **Muebles interactivos:**
  - con sonido posicional según su pan en `IsoRoom.ts`: `fountain_water`, `garden_pond` y `star_fountain` (loops de agua)
  - `garden_swing` (crujido), `toy_ball` (bote), `food_bowl` (cuenco), `soft_bed` (mullido)
  - `zen_cushion`, `garden_bench` y `final_throne` (sentarse)
  - decorativos con loop sutil: `wall_clock` (tic) y `crystal_lamp` (zumbido)
- **Modo edición:** `hab.place`, `hab.rotate`, `hab.remove`, `hab.buy`. Se enganchan en `HabitatTab.svelte`, `IsoRoomView.svelte` y `HabitatScreen.kt`.
- **Acciones autónomas del Pockai** (`petWander.ts`): stroll, cheer, eat, bathe, play y sit, que reutilizan `pet.*` y los sonidos de los muebles.
- **Visitas** (`lib/visitors.ts`): greet, play_tag, share_food, nap_together, squabble y make_up, con `pet.*` del visitante usando **su** pitchProfile, así se distinguen las dos voces.

### 2.10 Combate: arena, raid, torneo y entrenamiento (`battle.*`), unos 12 sonidos
- `battle.round_start`, `battle.crit`, `battle.guard_block`, `battle.miss`.
- Resultados: `battle.win`, `battle.lose`, `battle.draw`.
- Raid: `battle.raid.boss_roar` y `battle.raid.boss_hit`.
- Torneo: `battle.tournament.crowd`.
- Entrenamiento: `battle.training.rep`.
- Se combinan con `skill.*` y `pet.attack/hit`. Ficheros: `ArenaTab`, `RaidTab`, `TournamentTab`, `TrainingTab` y `PlayScreen.kt`.

### 2.11 Exclusivos del escritorio (D), unos 8 sonidos
- `desk.toy_ball.bounce` (`DesktopBall.svelte` / `toyPhysics.ts`)
- `desk.pomodoro.start`, `desk.pomodoro.end`, `desk.pomodoro.break` (`PomodoroWidget`)
- `desk.drop_to_habitat` (soltar el Pockai sobre el panel, `petai:move_to_habitat`)
- `desk.peek`, que acompaña los estados `peeking` y `stalking` de `behaviorEngine.ts`
- `desk.visitor.arrive` y `desk.visitor.leave` (`VisitorPet.svelte`)
- Notificación de necesidades (`notifyPetNeeds`): sonido propio más suave que la notificación del sistema.

### Totales aproximados
| Zona | IDs | Con variantes |
|---|---|---|
| Interfaz | 22 | 24 |
| Pockai | 38 | 50 |
| Elementos y habilidades | 26 | 26 |
| Recompensas | 24 | 26 |
| Efectos especiales | 20 | 20 |
| Minijuegos | 40 | 44 |
| Cocina | 12 | 12 |
| Aventuras | 30 | 30 |
| Hábitats y clima | 28 | 32 |
| Combate | 12 | 12 |
| Escritorio | 8 | 8 |
| **Total** | **≈260** | **≈285 ficheros** |

Con unos 4 candidatos por sonido salen **≈1.100 generaciones** con ElevenLabs. Los loops de ambiente (unos 25, de 15 a 30 s) son lo que más créditos consume por segundo. Con la tarifa vigente es fácil calcular el coste exacto. Para abaratar, se puede bajar a 2 candidatos en la interfaz y regenerar solo lo que no convenza.

**Lo que conviene sintetizar en WebAudio en vez de generarlo:** el metrónomo de `pulso_voltaico`, los tonos de escala de `cifrado` y los que suben con el combo, y `ui.slider_tick`. Así van exactos al tempo y no gastan créditos.

---

## 2b. Estado de F0 (hecho) y cambios respecto al plan

**Cómo generar sonidos:**
1. Pon `ELEVENLABS_API_KEY=...` en el `.env` de la raíz (está en `.gitignore`).
2. `pnpm sfx:generate --dry-run --only ui` muestra cuántas llamadas y segundos costaría; quita `--dry-run` para generar. `--candidates 2` ahorra créditos.
3. `pnpm sfx:review` abre `http://127.0.0.1:5199`: escuchas las tomas (los sonidos del Pockai, también como baby, juvenile, adult o final), eliges y guardas.
4. `pnpm sfx:import` las recorta, normaliza y convierte a `.m4a` en `shared/assets/audio/<bus>/<id>_<n>.m4a` (necesita ffmpeg).
5. `pnpm validate:sounds` comprueba manifiesto y ficheros (también va dentro de `validate:all`).

Un id sin fichero no suena ni falla, así que en F1 y siguientes se puede cablear `sfx('…')` antes de tener el sonido.

**Qué hay:**
- `shared/audio` (`@pockai/audio`): manifiesto, ajustes, perfiles de voz, control de saturación, sintetizados y motor WebAudio. Tiene tests.
- `shared/game-data/sounds.json`: 267 sonidos (261 de ElevenLabs y 6 sintetizados).
- `scripts/sfx/` con generate, review e import. El lock va en `scripts/sfx/sounds.lock.json` y las tomas candidatas en `scripts/sfx/.candidates/` (ignorada por git).
- Escritorio: `desktop/src/lib/audio.ts` (motor y ajustes) y Ajustes › Escritorio › Sonido, con el control nuevo `ui/Slider.svelte`.
- Escena embed (Android/iOS): mensaje `setAudio` en el protocolo de la escena y motor propio en `shared/scene/src/embed/audio.ts`.
- Android: `AudioPrefsStore` (DataStore), tarjeta Cuenta › Sonido y envío de `setAudio` desde `PockaiSceneView`.

**Cambios respecto al plan:**
- *Silenciar sin foco* deja de estar activado por defecto. El escritorio es una sola ventana, así que sin foco se silenciaría también la mascota. Ahora el anfitrión decide la «superficie»:
  - `app`: panel abierto y con foco; suena todo.
  - `desktop`: el resto del tiempo; suenan solo la mascota y sus efectos, y el ambiente si el usuario lo activa.
  - «Silencio total al usar otras apps» es opcional.
- Sin `.ogg` de respaldo: `.m4a` funciona en WebView2, en el WebView de Android y en WKWebView.
- El mensaje es `setAudio`, no `audio:settings`, siguiendo el estilo del protocolo. No sube la versión del protocolo.
- Los minijuegos reciben los ajustes con su propio `setAudio` (hecho en F3; ver §3).

## 3. Fases de implementación
1. **F0, infraestructura (hecho):**
   - el paquete `shared/audio` (motor, buses, cooldowns, pitchProfiles);
   - el manifiesto `sounds.json`;
   - los scripts `scripts/sfx/` (generate, review, postprocess);
   - los ajustes en desktop y su paso al WebView de Android.
2. **F1, interfaz y Pockai básico (hecho):**
   - `ui.*` en desktop y en Android (SoundPool en `UiSounds.kt`);
   - `pet.*` de cuidado (comer, dormir, limpiar, curar, ánimo, caricias, pasos);
   - el enganche en `clips.ts` (`soundForPetAction`) y en PetView.

   Cómo quedó:
   - **Tabla compartida** `shared/scene/src/effects/sounds.ts`. Hay sonido por clip (`soundForClip`) en vez de por aviso: así suena igual venga del backend o de un gesto local. Los extras van por aviso (burbujas al limpiar, tos, bostezo). La voz sale de `voiceForPet`, con especie, etapa, elemento y rareza del catálogo, y el humor del estado base.
   - **Interfaz del escritorio:**
     - un solo oyente de clics (`desktop/src/lib/uiSounds.ts`): pestañas, interruptores, botones y botones suaves; `data-sound` lo cambia o lo calla;
     - `Modal` suena al abrirse y al cerrarse;
     - `CurrencyPill sound` (el saldo de la cabecera) suena al subir;
     - los avisos del panel llevan `ui.notice_ok` / `ui.error`, las compras `ui.purchase`, y dar de comer y limpiar no llevan «ding» porque ya suena el Pockai;
     - cuando la mascota anuncia algo suena `ui.notification`, y en las necesidades `desk.needs`.
   - **Pockai en el escritorio** (`PetView`):
     - el sonido de cada clip, pasos en el paseo, rebote según la fuerza, levantarlo al arrastrar, boing al tocarlo, choca esos cinco;
     - ronquido en bucle mientras duerme, con el panorama según su posición en la pantalla.
   - **Escena incrustada** (`embed/petSounds.ts`): `petAction`, `playClip`, ronquido con `setActivity: sleep` y boing con `petTapped`.
   - **Android nativo:** `UiSounds` (SoundPool, lee `audio/ui` de shared/assets) en los botones del tema, chips, subpestañas, barra de navegación y compras.
   - **Depuración:** en desarrollo, `window.__pockaiSfx` guarda los últimos sonidos pedidos (suenen o no) para comprobar el cableado sin ficheros.
   - **Pendiente para otras fases:** la voz al hablar (babble en las burbujas) y la voz del amigo de visita.
3. **F2, recompensas y efectos:** subir de nivel, evolución, huevos, rarezas, logros, cofres, y las fases de `EffectPlayer`.
4. **F3, minijuegos y cocina (hecho):** las señales `last`, `timer_warning` en `host.ts`, y los sintetizados.

   Cómo quedaron los minijuegos:
   - **El paquete no lleva motor propio.** `shared/minigames/src/sound.ts` define lo que necesita (`MinigameSound`: `play`, `loop`, `stopLoop`) y el anfitrión se lo pasa a `mountMinigame({ sound })`. El escritorio pasa el motor de la ventana (`sfx`, `sfxLoop`, `sfxStopLoop`), con los ajustes del usuario; el embed crea el suyo (`embed/audio.ts`, solo con los `mg.*`). Sin motor, el juego es mudo y funciona igual.
   - **Las vistas disparan con `ctx.sfx` al cambiar el estado** (el campo `last` de cada juego y poco más), nunca al pulsar. Los ids están en `MG` (`sound.ts`); un test del paquete exige que todos existan en `sounds.json` y que no quede ninguno de juego sin usar.
   - **Anfitrión:** `mg.timer_warning` en cada uno de los últimos 5 s y `mg.pause`. Corta los bucles al pausar y al terminar.
   - **Sintetizados:** el metrónomo de Pulso Voltaico va exacto al tempo; los sellos de Cifrado cantan una nota cada uno, igual al mostrarse que al acertarlos; las rachas de Cosecha, Pulso y Corriente suben por la escala con `mg.combo.step`.
   - **Bucles:** el haz del Faro mientras apunta y el fuego de la Forja toda la partida.
   - **Escritorio** (`MinigamesTab.svelte`): cuenta atrás (`mg.countdown.tick` / `go`), resultado (`mg.result.great` con el 80 % de las monedas máximas o más, si no `good`), `mg.item_drop` si la partida suelta un objeto y `elem.<flujo>.accent` si hubo afinidad.
   - **Android:** `MinigameView.kt` reenvía los ajustes de la app al WebView con `setAudio` (mensaje opcional, no sube el protocolo), al anunciar `ready` y cada vez que cambian.
   - **Catálogo:** `sounds.json` sigue a las reglas nuevas (marea, polvo estático, destello, señuelos); se quitaron los sonidos de la cesta, la piedra y la aparición de objetos.
   - **Depuración:** en desarrollo, la página de demo guarda los sonidos pedidos en `window.__pockaiSfx`, como el escritorio.
   - **Pendiente:** generar los ficheros (`pnpm sfx:generate --only mg`); hasta entonces solo suenan los sintetizados. En Android, la cuenta atrás y el resultado son pantallas nativas y aún no suenan. `mg.score_tick` y `mg.new_record` están en el catálogo sin enganchar (no hay récord personal todavía). Vibración.
   Cómo quedó la cocina (`CookingTab.svelte`, solo escritorio):
   - `cook.ambient` en bucle mientras se cocina; se corta al servir y al salir de la pestaña.
   - `cook.memorize.show` por cada ingrediente que dicta el Pockai, cada uno un poco más agudo (`rate`).
   - `cook.ingredient.place` al echar un ingrediente a la olla, más `elem.<flujo>.accent` (bajo) si es el fruto de un Flujo. Los botones de la encimera llevan `data-sound="none"` para que no suene además el clic de interfaz.
   - `cook.undo`, `cook.serve`, `cook.timer_warning` en cada uno de los últimos 5 s, y `cook.result.perfect` / `good` / `fail` con el 100 %, el 50 % o menos.
   - `cook.ingredient.tap` queda en el catálogo sin enganchar: no hay gesto de «coger» separado del de echar.

5. **F4, aventuras y combate:** stingers, enfoques, finales, ambientes de localización, habilidades.
6. **F5, hábitats y clima:** loops por sala, muebles posicionales, clima, visitas, ducking.
7. **F6, pulido:** mezcla final de niveles, modo audio reducido y comprobación de que no hay spam en el escritorio tras 8 h de uso. Opcional: hápticos en Android junto a los sonidos clave.

## 4. Ficheros clave
- Nuevos:
  - `shared/audio/` (package.json, `src/engine.ts`, `profiles.ts`, `settings.ts`)
  - `shared/game-data/sounds.json` + `scripts/sfx/sounds.lock.json`
  - `scripts/sfx/*`
  - `shared/assets/audio/**`
  - `mobile/android/.../audio/UiSounds.kt`
- A modificar:
  - `shared/scene/src/effects/clips.ts`, `reactions.ts`, `timeline.ts`, `protocol.ts`
  - `shared/minigames/src/host.ts`, `protocol.ts`, `views/*View.ts`
  - `desktop/src/components/PetView.svelte`, `ui/*.svelte`, `CookingTab.svelte`, `AdventureTab.svelte`, `HabitatTab.svelte`, `DesktopSettingsPanel.svelte`
  - `desktop/src/lib/animation/eventMap.ts`
  - `mobile/android/.../ui/scene/PockaiSceneView.kt`, `AppRoot.kt`
  - `shared/game-data/accessibility.json`
- Se puede limpiar a la vez: `voice-config.json` usa ids de especies antiguos (eso afecta al TTS, no a los efectos).

## 5. Verificación
- Un test unitario de `@pockai/audio` comprueba que todos los IDs que referencian `clips.ts`, los minijuegos y `sounds.json` tienen fichero, y que cada `pitchProfile` produce un rate dentro de [0.5, 2].
- Un script de validación, al estilo de la validación de game-data que ya existe, comprueba que el manifiesto cumple el esquema y que cada asset existe.
- Página `scripts/sfx/review.html`: escuchar cada sonido con las 15 especies × 3 etapas para comprobar que la variación resulta creíble.
- Desktop (`npm run tauri dev`): recorrer cuidado, minijuegos, cocina, aventura y hábitat, y comprobar el silencio sin foco y que la mascota no hace spam.
- Android: emulador, escena y minijuegos en el WebView reciben los ajustes; la UI nativa suena con SoundPool.
