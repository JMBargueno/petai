# Pendientes de PetAI

> Actualizado: 15/11/2026 — después de cerrar Pasos 1-4 del informe de mejoras.
> 18/11/2026: añadida la §8 (pixel art, accesorios y rareza por especie).
> 19/11/2026: añadida la §9 (cerebro del Pockai, spec 41).
> 20/11/2026: añadida la §10 (reloj de Apple Watch y el icono de marca, spec 44).
> Base: `main` tip `db3ff00`.

## 1. Commits/PRs sin mergear

| Item | Dónde | Descripción |
|---|---|---|
| R-07 (load test multi-user) | commit `94d5214` en `feat/r01-bullmq-webhooks` (fuera de main) | `loadtest.sh` ahora soporta `USERS=N` (multi-user write concurrente). Hay que merguear a main (nuevo PR o cherry-pick). |

## 2. Configuración de producción (no es código)

| Item | Qué hacer | Dónde |
|---|---|---|
| **Transporte de email real** | Definir `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` en el `.env` del servidor (mailcow, buzón de sistema `noreply@pockai.world`, pendiente de crear). El código ya está (`modules/mail`); sin estas variables los correos solo van al log. | `.env` del servidor |
| **`REALTIME_REDIS=true`** | En prod, activar el adaptador `socket.io-redis` (R-02). Sin ella, el WS no escala a >1 réplica. | `docker-compose.yml` / `.env.production` |
| **`CORS_ORIGINS`** | Añadir los orígenes reales de producción. | `.env.production` |
| **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`** | Generar secrets 64+ chars aleatorios. | `.env.production` |
| **`TRUST_PROXY`** | Si hay balanceador (Cloudflare, ALB…), nº de saltos. | `.env.production` |

## 3. Paso 5 — Features oleadas 2/3 (de una en una)

### 3a. Cobertura unit (red de seguridad)
Módulos sin `*.spec.ts` unit (el e2e ya existe):

habitat, breeding, training, genes, adventure, ai-router, spectator, reengagement, buddies, rituals, mood-theater, accessibility, gifting

> No es urgente: el e2e cubre el happy-path. Unit es red de seguridad (edge cases, race conditions).

### 3b. UI en clientes (escritorio + Android)
Features sin UI (solo backend + API):

| Feature | Backend | Escritorio | Android |
|---|---|---|---|
| Raid (Jefe Comunal) | ✅ | ❌ | ❌ |
| Torneo (Ladder) | ✅ | ❌ | ❌ |
| Breeding (Gene Pool) | ✅ | ❌ | ❌ |
| Genes (Herencia) | ✅ | ❌ | ❌ |
| Training (Ejercicio) | ✅ | ❌ | ❌ |
| Hábitat (Salas) | ✅ | ❌ | ❌ |
| Aventura diaria (Crónica del Éter) | ✅ | ✅ | ✅ |
| Reengagement (Regreso) | ✅ | ❌ | ❌ |
| Rituals (Ceremonias) | ✅ | ❌ | ❌ |
| Mood Theater | ✅ | ❌ | ❌ |
| Accessibility | ✅ | ❌ | ❌ |
| Spectator (Ver partidas) | ✅ | ❌ | ❌ |


## 4. Ajustes menores señalados en el informe

| Ref | Descripción |
|---|---|
| F-08 | `GET /v1/seasons/progress` no verifica que la temporada sea la actual |
| F-14 | Hot-reload de `balance.json` no valida rango de `xpPerTier` (0 o negativo) |
| HAB-BUFFS | **Hecho** (2026-11-17): el catálogo completo suma exactamente cada tope y `check_habitats.mjs` lo exige; reparto en `.claude/skills/pockai-habitat-architect/references/balance.md`. Problema original: **Rebalancear los buffs del hábitat** (`shared/game-data/habitats.json`). Hoy el catálogo completo suma más que los topes: felicidad 0,55 / 0,30, higiene 0,50 / 0,40 y combate 0,15 / 0,10 (energía 0,35 / 0,40 sí cabe). `getActiveBuffs` recorta al tope, así que el jugador que compra de más paga muebles que no aportan, y `final_throne` da él solo todo el tope de combate. Decidir entre subir topes, bajar buffs por mueble o limitar la suma por sala. `node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs` muestra las sumas y las reglas están en `.claude/skills/pockai-habitat-architect/references/balance.md`. Ajustar el e2e de topes (`backend/test/habitat.e2e-spec.ts`, test e) si cambian. |

## 5. Rendimiento / CI

| Item | Detalle |
|---|---|
| **R-07 — Ejecutar load test** | Script listo (`backend/scripts/loadtest.sh`). Ejecutar contra env prod-like (`USERS=5 CONNECTIONS=50 DURATION=30`) y documentar p95/RPS/errores. Repetir antes de cada release. |
| **R-04 — Más cachés** | Solo se cacheó el leaderboard. Candidatos: `GET /v1/seasons/:id` (historial), `GET /v1/pets/:id` (per-user, TTL 5s). Prioridad baja. |
| **Flakiness e2e** | Suite (~46 specs, 5+ min) a veces falla en CI (handles abiertos). Mejorar: `--testTimeout`, identificar handles, o `retry: 1` en el job. |

## 6. Infraestructura / DevOps

| Item | Detalle |
|---|---|
| **Observabilidad** | `prom-client` presente. Faltan: dashboard Grafana, alertas (p95 > 500ms, error > 1%), traces en prod. |
| **CI: Load test job manual** | GitHub Actions job (dispatch manual) que corra `loadtest.sh` contra staging. |
| **DEPLOY.md** | Actualizar con env vars nuevas (`REALTIME_REDIS`, `EMAIL_SENDER`, BullMQ queue). |

## 7. Nice-to-have / low priority

| Item | Detalle |
|---|---|
| `socket.io-redis` deprecated | Reemplazo: `@socket.io/redis-adapter` (API pub/sub). Migrar en upgrade mayor. |
| BullMQ: más colas | Futuras: `notifications` (push), `seasons:expire`, `gifts:expire`. |
| iOS client | ➖ Hecho: `apps/ios` sobre `@pockai/mobile`, probada en el simulador con un backend local (la spec 43 sustituyó el plan de Swift + OpenAPI). Quedan `BGAppRefreshTask`, la Live Activity y el `.ipa` firmado. |
| ISO-IOS | ➖ Ya no aplica: `apps/ios` es la misma app de Tauri que Android y usa `@pockai/scene` directamente dentro del webview, sin `WKWebView` incrustado a mano ni puente propio. |
| Web (Angular) | Existe con CI build, sin features oleadas. |

---

## 8. Pixel art, accesorios y rareza por especie

> Apuntado el 18/11/2026, tras los PR 117 (accesorios en backend), 118 (pixel art y render de prendas) y 120 (rareza por especie).
> Referencias: `docs/specs/spec-38-accesorios-pockai.md`, `docs/GUIA_ARTISTICA.md` §7.5 y §7.6, `docs/GAME_DESIGN.md` §1.

### 8a. Sin comprobar (hecho, pero no verificado)

| Item | Qué falta comprobar |
|---|---|
| **Migraciones** | Ninguna se ha ejecutado contra una base de datos: `20261121100000_pet_accessories`, `20261121110000_achievement_item_ascii_id` y `20261122100000_rarity_by_species`. |
| **Seed de prendas** | `backend/prisma/seed.ts` crea un `Item` por prenda; sin ejecutar. Sin seed las prendas se listan, pero no se pueden comprar. |
| **Tests e2e** | No se han ejecutado para accesorios, inventario ni eclosión. |
| **Escritorio en marcha** | El armario (Mascota › Armario) y la mascota flotante con prendas compilan y pasan sus tests, pero no se han visto funcionando contra un backend. |
| **Demo de eclosión de la web** | Pasa sus tests, pero no se ha visto en el navegador (la web local necesita backend). |
| **PR 118 y PR 120 juntos** | El de rareza salió de `main` antes de fusionar el de pixel art; no se han probado combinados. |
| **Tests de buffs del hábitat** | `habitat-buffs.spec.ts` y `pets.habitat-buffs.spec.ts` fallan en local (5 tests) por valores de muebles. Parecen desfasados respecto al rebalanceo de buffs (§4); no se ha comprobado en `main` limpio. |
| **`messages.es.json`** | `extract-i18n` cambió 35 entradas, no solo las diez reescritas; el resto no se revisó una a una. |

### 8b. Accesorios (spec 38)

| Item | Estado |
|---|---|
| Armario y tienda en web | En el móvil ya están (`@pockai/mobile`, las dos apps); en la web, no. |
| iOS: enviar `accessories` en `setPet` | ➖ Ya no aplica por separado: el hábitat del móvil es el mismo código en las dos apps (`@pockai/mobile`). |
| `GET /v1/shop` sin filtro | Sigue listando las prendas junto a la comida, también las de logro a precio 0 (no se pueden comprar, pero se ven). |
| Premios de logro sin convertir en prenda | Quedan 20 `ach_item_*` que se entregan como cosmético genérico (`check_accessories.mjs` los lista). |
| Reparto del catálogo | La ranura de cara tiene una sola prenda y solo 3 de 9 se compran con monedas. |
| Briefs de arte | Faltan los 9 de `docs/accesorios/<id>.md`. |
| Precios | Provisionales (200–300 monedas, 8–30 gemas); la spec preveía llevarlos a `balance.json`. |
| Accesorios de festival | Siguen siendo emoji (`festivals.json`); la spec propone prendas temporales en la ranura de cabeza. |
| Gorro detrás del rasgo icónico | Hoy se pinta por delante. Hacerlo bien exige que el generador exporte una capa `front.png`. |
| Prenda del mismo color que el cuerpo | Casi no se ve (gafas rojas sobre Ignisaurio). La tienda debería proponer primero colores que contrasten. |

### 8c. Pixel art (GUIA_ARTISTICA §7.5)

| Item | Estado |
|---|---|
| Validar el estilo | Es arte procedural, más sencillo que las referencias de partida. Revisar las hojas de contactos (`npx tsx scripts/sprites/pixel/contact.ts`) antes de darlo por bueno. |
| Escalado en Android, iOS y web | Solo la escena de PixiJS y el escritorio escalan por enteros y sin suavizado. |
| Escala de la sala | La sala se ajusta a la pantalla, así que ahí el pixel art no va a escala entera. |
| Movimiento de la mascota | El aplastado al tocar y el flotar siguen siendo transformaciones continuas; la guía pide frames (`land`, `hit`) y pasos de 1 px. |
| **El arte importado ignora casi toda la pose** | Las 16 especies usan arte importado, y `drawImported` (`scripts/sprites/pixel/species.ts`) elige una lámina clave por pose y solo le aplica `dx`/`dy`: el achatado (`sy`/`sx`), la cola, los brazos, la rotación y los ojos de `poses.ts` no llegan al dibujo. Así, `idle` y `sad` salían como **el mismo dibujo repetido** en las cuatro etapas, y la mascota estaba quieta en reposo en el escritorio, el móvil y el reloj; se arregló dándoles un balanceo de 1 px por `dy`, que es el único canal que sí llega. El resto de la expresividad de `poses.ts` sigue sin usarse: o se amplía `drawImported` (una lámina por frame, o deformaciones sobre los píxeles importados) o esas propiedades son letra muerta. `pnpm generate:watch-assets` avisa si alguna pose vuelve a quedarse plana. |
| Muebles y salas | Siguen en SVG isométrico; conviven con Pockais en píxeles. |
| Variante shiny | Tiene efecto propio (barrido irisado y destellos). La paleta sigue siendo una fija y dorada para todas las especies, puesta en la eclosión; `shared/assets/palettes.json` trae paletas shiny por elemento que no se usan. |
| Patrones de piel | Doce patrones en dos familias, horneados como tono del color, con efecto animado en los de la Textura del Éter y brillo en los shiny. Queda: verlos en movimiento dentro de las apps (solo se han revisado en hojas de fotogramas); el patrón va anclado al frame y no al cuerpo, así que se desliza un píxel cuando la pose se desplaza; en etapas con poco primario (Magmadillo, Leviatín, Primpulso e Yggdrito finales) apenas tiene sitio; las miniaturas (`PetMiniAvatar`) no animan los efectos; la familia y el efecto no están en la tabla `Pattern` de la base, solo en `patterns.json`. |
| **Ocho especies por debajo del objetivo** | El usuario rehízo con una IA de imagen las hojas de Livolt, Inktopus, Solarejo, Fénixel, Kirisol, Leviatín, Yggdrito y Primpulso, y ese es el nivel que quiere (`.claude/skills/pockai-architect/references/examples/`). Falta redibujarlas con el generador aplicando `design-lessons.md`. Lo más urgente: los tentáculos rectos del Inktopus (parece una araña), la proporción de muñeco de Solarejo y Kirisol, y la cara de cría en las etapas finales. Dos hojas objetivo cambian el concepto y hay que decidirlo antes: el Livolt sale como abeja (es una polilla) y el Kirisol final gana alas. |
| Redibujo con el generador v2 | Las 15 especies usan ya el tercer color, las tramas, el plano lejano o el trazo interior. A fondo solo se han rehecho Livolt, Inktopus y Solarejo; el resto recibe mejoras sobre el dibujo que tenía. Las crías y casi todas las segundas etapas no cambian. |
| Acento en iOS y web | El escritorio y Android pasan el `accent` de la paleta al horneado; iOS y la web no se han revisado. Sin él, el acento sale como el primario oscurecido. |
| Límites del generador v2 | Las tramas van en rejilla recta (las escamas no giran con un cuello curvo), todas las sombras tiran al mismo violeta y el trazo interior hay que darlo a mano. |
| **Arte final por hoja objetivo** | Las 15 especies tienen ya arte final importado (`scripts/sprites/pixel/imported/`). El flujo está en `scripts/sprites/concept/` y en la skill (`target-sheet-pipeline.md`). Las anclas de accesorio del reposo están anotadas a mano por especie y etapa (`imported/anchors.json`), con talla propia donde la cabeza es pequeña, y siguen a la cabeza en el resto de poses. Queda: verlo dentro de las apps; al dormir, en Primpulso y Leviatín finales las prendas caen sobre el lomo y no sobre la cabeza; las estrellas de impacto pegadas en la pose de golpe de Livolt adulto, Yggdrito y Magmadillo final; las manchas pardas de la cría de Primpulso; el reposo no parpadea (no hay pose con los ojos cerrados); y ejecutar el seed. |
| Paletas por defecto cambiadas | Las ocho especies con arte importado tienen ahora la paleta de su hoja objetivo. Las mascotas ya eclosionadas conservan la suya; hay que ejecutar el seed. El Livolt y el Solarejo comparten casi el mismo primario crema. |
| Arte importado: animación | Cada animación mueve una de 10 poses en píxeles enteros, sin frames intermedios. No se han revisado en movimiento. |
| Arte importado: accesorios | Las anclas se estiman desde la silueta; no se ha comprobado cómo caen las prendas sobre el Leviatín. |
| Leviatín: salto de estilo | La etapa final se generó en una ronda anterior y tiene más detalle que las otras tres. |
| Boceto del Ignisaurio | El arte final es un dinosaurio cuadrúpedo de gorguera; su `PixelSpecies` de formas sigue siendo el bípedo anterior (solo sirve de boceto y para colocar efectos). Las 15 especies tienen ya su ficha en `docs/pockais/`. |
| Sistema de diseño publicado | No refleja los últimos cambios (tamaños de prenda, colores del huevo, rareza por especie). |

### 8d. Rareza por especie (GAME_DESIGN §1)

| Item | Estado |
|---|---|
| Especies de otras rarezas | Todas son `normal`: todas las eclosiones dan una especie normal y la garantía de eclosión (pity) queda pendiente. |
| Logros de rareza | Los de «consigue un legendario» no se pueden cumplir hasta que exista una especie de esa rareza. No se han tocado. |
| Mascotas ya nacidas con rareza alta | La migración les pone la de su especie, pero conservan sus estadísticas: serán más fuertes que las nuevas de su misma especie. Decidir si se deja así. |
| Rareza del patrón en el juego | El patrón tiene rareza propia, pero las apps no la muestran ni cuenta para logros o estadísticas. |
| Términos de lore | «Linaje» y «Huella del Éter» son nuevos en `docs/LORE.md`: validarlos o cambiarlos. |

---

## 9. Cerebro del Pockai (spec 41)

> Apuntado el 19/11/2026, tras los PR 198, 201, 203, 204 y 208 (fases A a F de la spec 41).
> Referencia: `docs/specs/spec-41-pockai-con-iniciativa.md`. Las seis fases están escritas; esto es lo que no se ha comprobado y lo que quedó fuera.

### 9a. Sin comprobar (hecho, pero no verificado)

| Item | Qué falta comprobar |
|---|---|
| **Evaluación con modelo real** | `pnpm run eval:mind` (en `backend`) no se ha lanzado nunca: no hay nota de referencia. Necesita `EVAL_API_KEY`, `EVAL_BASE_URL` y `EVAL_MODEL`. El prompt que monta la evaluación usa las funciones del chat, pero no se ha comparado línea a línea con `chat.service.ts`. |
| **Tests e2e** | No se han ejecutado desde la fase B (iniciativa, aprendizaje, consolidación de memoria, rutinas). `mind.e2e` (concurrencia) falla en local y pasa en la CI; sin investigar. |
| **Base de datos real** | La consolidación de memoria y las rutinas solo están probadas con tablas en memoria. |
| **Android** | La tarjeta de iniciativa (`ui/pet/InitiativeCard.kt`) no se ha compilado en local ni probado en un dispositivo. |
| **App de Tauri** | El bocadillo de iniciativa y el aprendizaje por gestos solo se han visto en la demo del navegador y en tests. El bocadillo no llegó a verse en pantalla ni en la demo. |
| **Números de las rutinas** | `balance.json → personality.autonomy.routine` es una primera estimación, sin ajustar viendo a un Pockai real durante días. Cambia el comportamiento de todas las mascotas. |
| **Números del aprendizaje** | Apartar al Pockai arrastrándolo cuenta en contra aunque sea para jugar a lanzarlo (`personality.learning.signals.pickup`, la mitad que una caricia). |
| **Panel y alertas de la mente** | `infra/observability/grafana/dashboards/mind.json` y el grupo `petai-mind` no se han visto con datos de verdad ni pasado por `promtool`. |

### 9b. Lo que quedó fuera

| Item | Por qué | Qué haría falta |
|---|---|---|
| **Desde cuándo duerme, está enfermo o está en su hábitat** | La vida autónoma aplica esos tres estados tal como están ahora a todas las horas simuladas. | Guardar cuándo cambió cada uno (migración en `Pet`) y usarlo en `autonomy.service.ts`. |
| **Resumir lo nacido del chat** | La consolidación pliega encuentros, visitas, hallazgos y aventuras sin modelo; lo del chat se olvida como antes, porque resumirlo exige leerlo. | Un paso con modelo al desalojar episodios de `kind: summary` / `event` del entrenador. |
| **Búsqueda por significado** | La relevancia de un recuerdo sigue siendo por palabras compartidas con el mensaje. | Embeddings (pgvector o similar) y su coste. |
| **Notificaciones con la app cerrada** | El backend no tiene envío push: el canal `mobile` de la iniciativa y su tope diario solo sirven con la app abierta. | Infraestructura push (FCM/APNs) y permiso en las apps. |
| **Idioma por cuenta** | No hay preferencia de idioma: frases, recuerdos y resúmenes salen siempre en castellano (el inglés está escrito en `strings` y `phrases.json`). | Campo de idioma en la cuenta y pasarlo a `text(...)` y `renderPhrase`. |
| **El ánimo no mueve las conductas** | El ánimo de corto plazo se nota en el chat y en las frases, pero no en los pesos de las conductas del escritorio ni de la vida autónoma. | Un factor por ánimo en `deskBrain` y en `autonomy.engine`. |
| **Lo aprendido no llega al chat** | Las preferencias aprendidas de los gestos solo inclinan las conductas del escritorio. | Una línea en el prompt y señales para `phrases.json`. |
| **Aprendizaje sin red** | El escritorio no guarda lo aprendido en disco: sin red dura lo que la sesión. | Persistirlo como ya se hace con las dimensiones (`personalityStore`). |
| **Escrituras simultáneas** | `LearningService.reinforce` y la consolidación leen y luego escriben con `patchStored`: dos a la vez pueden pisarse y perder una cuenta. Dos dispositivos que pregunten a la vez por la iniciativa pueden hablar los dos. | Hacer la lectura dentro de la transacción con bloqueo, como `applyExperience`. |
| **Rutina igual para todos** | La personalidad solo entra por los pesos de siempre; no hay madrugadores ni trasnochadores. | Desplazar `phaseStarts` por dimensión. |
| **Clientes sin lo nuevo** | Android no envía gestos (no tiene conductas de escritorio) y ningún cliente muestra la rutina ni marca los resúmenes de memoria con icono propio. iOS no tiene nada de la spec 41. | UI en cada cliente; el servidor ya lo sirve. |

## 10. Reloj de Apple Watch e icono de marca (spec 44)

> Apuntado el 20/11/2026, al traer el arte del juego a la muñeca.
> Referencia: [`docs/specs/spec-44-reloj-apple-watch.md`](specs/spec-44-reloj-apple-watch.md) §9.
> El reloj compila en la CI y las cuatro páginas se han visto en el simulador con un resumen puesto
> a mano; lo que falta es tocarlo y verlo en sitios donde no llega ni la CI ni `simctl`.

### 10a. Sin comprobar (hecho, pero no verificado)

| Item | Qué falta comprobar |
|---|---|
| **Pulsar los botones en el reloj** | El camino de la acción está probado de punta a punta contra el backend real (`el_reloj_da_de_comer_de_verdad`), pero el toque en sí no: dirigir el simulador de watchOS desde la terminal no se puede sin dar permisos de accesibilidad. Afecta a los cinco botones, y sobre todo a **curar** y **evolucionar**, que son nuevos. |
| **La complicación en una esfera** | Las cuatro familias compilan y leen el resumen del App Group, pero ninguna se ha puesto en una esfera. Ahora además enseñan el sprite del Pockai, que a tamaño de complicación no se ha visto. |
| **Un atajo de Siri** | Los cinco `AppIntent` compilan y el `Metadata.appintents` se genera, pero no se ha dicho ninguna frase. Lo delicado no es la disponibilidad sino el arranque en frío: el sistema puede lanzar el intent con la app sin arrancar, y la espera a `activationDidCompleteWith` solo se prueba de verdad diciéndolo. |
| **El doble pinch** | `.handGestureShortcut(.primaryAction)` solo existe en hardware con Doble Toque (Series 9 / Ultra 2 en adelante): el simulador no lo tiene. Tampoco se ha comprobado que un solo `.primaryAction` en una `TabView` de cuatro páginas se comporte como se espera. |
| **Hardware** | `isReachable`, el comportamiento de `transferUserInfo` y el presupuesto de complicaciones (50 al día) solo se comprueban en un iPhone y un Apple Watch reales. Hace falta un Team ID (`APPLE_DEVELOPMENT_TEAM`). |
| **El icono en iOS y Android** | El huevo de marca se ha regenerado para las cuatro apps y se ha visto el `AppIcon` de watchOS dentro del `Assets.car`, pero **no se ha instalado en un simulador de iPhone ni en un emulador de Android**. En Android, además, el icono adaptativo y su capa monocroma (los iconos temáticos de Android 13) no se han visto en una pantalla de inicio. |
| **El sprite de las 16 especies** | De las 321 láminas horneadas solo se ha mirado el Ignisaurio joven en la muñeca. El recorte es común por etapa (para que todas salgan a la misma escala) y centrado por especie, pero no se ha revisado una hoja de contactos de las 64 combinaciones de especie y etapa. |
| **Los avisos cuando algo no se puede** | Los motivos en gris («Sin medicinas en la mochila», «Hace falta nivel 50») tienen test en Rust, pero no se ha visto ninguno en pantalla: el resumen de prueba traía la mascota en un estado solo. |

### 10b. Lo que quedó fuera

| Item | Por qué | Qué haría falta |
|---|---|---|
| **El sprite del jugador, no el de la especie** | Las láminas se hornean con la `defaultPalette` de `species.json`: sin shiny, sin accesorios y sin el `visualSeed` de la mascota. Empaquetarlas es lo que permite que el reloj funcione con el iPhone cerrado. | Hornear en el iPhone (que sí tiene webview y `@pockai/scene`) y mandar la lámina dentro del resumen, con lo que eso engorda el payload de WatchConnectivity. |
| **Las demás cuentas atrás** | `surfaces()` solo publica el huevo incubando; la visita, el sueño y la aventura no llevan hora de fin en el `AppState`, y una cuenta atrás que no cuenta nada es peor que ninguna. | Que el estado lleve la hora de fin de esas tres (ya anotado en el paso 5.1 de la migración). |
| **La recompensa diaria** | Las misiones no están en el `AppState`, así que ofrecerla obligaría a consultar al servidor para decidir si pintar un botón, y el resumen dejaría de ser una función pura del estado. | Que el estado del núcleo lleve las misiones. |
| **Dar un mimo** | El backend no tiene ruta de caricia: el vínculo sube como *efecto* de las demás interacciones. | Un endpoint nuevo, y el backend no cambia en esta spec. |
| **Traducir el reloj** | Los literales de las pantallas («Nada en marcha», «Cuidar», «Al día») y las etiquetas que manda Rust (`WristAction::label`) están en castellano. Meter un `.xcstrings` solo en el reloj lo dejaría a medio camino del resto de la app. | Decidir el idioma por cuenta (es el mismo pendiente que la §9b) y pasarlo al resumen. |
| **La curva de nivel, duplicada** | `xp_needed` replica `round(100 · nivel^1.5)` de `backend/src/modules/pets/pets.service.ts`, que **no está en `balance.json`**. Es el mismo trato que `CLEAN_MAX_HYGIENE`, pero si la curva cambia hay que cambiarla en dos sitios. | Mover la curva a `balance.json` y que el núcleo la lea, o aceptar la duplicación con su test. |
| **`coin` y `gem` solo en el reloj** | Entraron al set propio porque watchOS no tiene Lucide. Web, escritorio y móvil las siguen pintando con Lucide (`GUIA_ARTISTICA` §6). | Unificarlas es cambiar un icono que ya se ve en producción: decisión aparte. |
| **El `Pockai.app` que busca el empaquetado** | `scripts/build-watch-app.sh` coge el `Pockai.app` más reciente de `gen/apple/build`. Con builds de simulador y de dispositivo a la vez, manda la fecha. | Un argumento para elegir cuál, si llega a molestar. |

## Resumen por prioridad

**Ahora (bloquea prod):**
- [ ] Merguear R-07 (commit `94d5214`)
- [ ] Configurar `EMAIL_SENDER` real
- [ ] Configurar `REALTIME_REDIS=true` en prod
- [ ] Secrets + CORS + TRUST_PROXY
- [ ] Actualizar DEPLOY.md
- [ ] Ejecutar las tres migraciones y el seed de prendas en un entorno con base de datos (§8a)

**Próximo sprint:**
- [x] Rebalancear los buffs del hábitat (HAB-BUFFS, §4) — hecho: el catálogo completo suma cada tope
- [ ] Ejecutar load test + documentar resultados
- [ ] Corregir flakiness e2e en CI
- [ ] Paso 5: 1-2 features oleadas con UI (ej. Raid, Training)
- [ ] Probar el armario y la mascota con prendas contra un backend real (§8a)
- [ ] Compilar y probar Android con prendas (§8a)
- [ ] Arreglar o actualizar los tests de buffs del hábitat (§8a)
- [ ] Validar el estilo del pixel art procedural (§8c)
- [ ] Crear especies de otras rarezas, para que la eclosión y el pity tengan sentido (§8d)
- [ ] Lanzar la evaluación del chat con un modelo real y guardar la nota de referencia (§9a)
- [ ] Ejecutar los e2e de la mente y probar consolidación y rutinas contra una base de datos (§9a)
- [ ] Compilar y probar en Android la tarjeta de iniciativa (§9a)
- [ ] Ver el bocadillo de iniciativa y el aprendizaje en la app de Tauri (§9a)
- [ ] Ajustar los números de las rutinas y del aprendizaje con uso real (§9a)
- [ ] Instalar el icono de marca en un simulador de iPhone y un emulador de Android (§10a)
- [ ] Pulsar los cinco botones del reloj y ver la complicación en una esfera (§10a)
- [ ] Decir un atajo de Siri y probar el doble pinch en hardware con Doble Toque (§10a)
- [ ] Revisar una hoja de contactos de las 64 combinaciones de especie y etapa del reloj (§10a)

**Medio plazo:**
- [ ] Unit specs de 13 módulos
- [ ] Armario y tienda de prendas en Android, iOS y web (§8b)
- [ ] Convertir premios de logro en prendas y equilibrar el catálogo (§8b)
- [ ] Escalado de pixel art en Android, iOS y web, y escala entera en la sala (§8c)
- [ ] Mostrar la rareza del patrón en las apps y revisar los logros de rareza (§8d)
- [ ] Guardar desde cuándo duerme, está enfermo o está en su hábitat (migración, §9b)
- [ ] Bloqueo en las escrituras de aprendizaje, consolidación e iniciativa (§9b)
- [ ] Preferencia de idioma por cuenta (§9b)
- [ ] Notificaciones push para que el Pockai hable con la app cerrada (§9b)
- [ ] Que el ánimo mueva las conductas y que lo aprendido llegue al chat (§9b)
- [ ] Resumir con un modelo lo nacido del chat antes de olvidarlo (§9b)
- [ ] UI de features oleadas 2/3
- [ ] Dashboard observabilidad
- [ ] CI: load test manual
- [ ] Migrar `socket.io-redis` → `@socket.io/redis-adapter`

**Nice-to-have:**
- [ ] iOS client
- [ ] Accesorios de festival como prendas temporales (§8b)
- [ ] Capa `front.png` para pintar el gorro detrás del rasgo icónico (§8b)
- [ ] Toque, flotar y daño de la mascota por frames (§8c)
- [ ] Muebles y salas en pixel art (§8c)
- [ ] Búsqueda de recuerdos por significado (§9b)
- [ ] Rutina distinta según la personalidad y verla en los clientes (§9b)
- [ ] Sala isométrica en iOS (ISO-IOS, §7)
- [ ] Web Angular — features oleadas
- [ ] Más colas BullMQ
- [ ] Más endpoints cacheados