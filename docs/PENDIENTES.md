# Pendientes de PetAI

> Actualizado: 15/11/2026 — después de cerrar Pasos 1-4 del informe de mejoras.
> 18/11/2026: añadida la §8 (pixel art, accesorios y rareza por especie).
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
| Aventura (Expediciones) | ✅ | ❌ | ❌ |
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
| iOS client | No existe. Proyecto nuevo (Swift + OpenAPI). |
| ISO-IOS | **Sala isométrica en iOS** (fase 7 de `docs/ROADMAP_ISOMETRICO.md`). Incrustar `@pockai/scene` en un `WKWebView` con el puente `pockai`, igual que Android (`mobile/android/.../ui/scene/`). Depende del cliente iOS. |
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
| **Android** | `Pet.accessories` y `SceneMessages.setPet` se cambiaron en Kotlin sin compilar ni probar en un dispositivo. |
| **Demo de eclosión de la web** | Pasa sus tests, pero no se ha visto en el navegador (la web local necesita backend). |
| **PR 118 y PR 120 juntos** | El de rareza salió de `main` antes de fusionar el de pixel art; no se han probado combinados. |
| **Tests de buffs del hábitat** | `habitat-buffs.spec.ts` y `pets.habitat-buffs.spec.ts` fallan en local (5 tests) por valores de muebles. Parecen desfasados respecto al rebalanceo de buffs (§4); no se ha comprobado en `main` limpio. |
| **`messages.es.json`** | `extract-i18n` cambió 35 entradas, no solo las diez reescritas; el resto no se revisó una a una. |

### 8b. Accesorios (spec 38)

| Item | Estado |
|---|---|
| Armario y tienda en Android, iOS y web | Solo existen en el escritorio. |
| iOS: enviar `accessories` en `setPet` | El hábitat de iOS no las envía a la escena. |
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
| Muebles y salas | Siguen en SVG isométrico; conviven con Pockais en píxeles. |
| Variante shiny | Sin rampa propia: usa una paleta fija en la eclosión. |
| **Ocho especies por debajo del objetivo** | El usuario rehízo con una IA de imagen las hojas de Livolt, Inktopus, Solarejo, Fénixel, Kirisol, Leviatín, Yggdrito y Primpulso, y ese es el nivel que quiere (`.claude/skills/pockai-architect/references/examples/`). Falta redibujarlas con el generador aplicando `design-lessons.md`. Lo más urgente: los tentáculos rectos del Inktopus (parece una araña), la proporción de muñeco de Solarejo y Kirisol, y la cara de cría en las etapas finales. Dos hojas objetivo cambian el concepto y hay que decidirlo antes: el Livolt sale como abeja (es una polilla) y el Kirisol final gana alas. |
| Hojas objetivo sin par | Faltan hojas objetivo de Ignisaurio, Axolunar, Florabrote, Magmadillo, Nubeballena, Cactuerno y Cerbito. |
| Tercer color en los sprites | La hoja solo distingue primario y secundario; el `accent` de la paleta no llega al sprite. Hace falta un papel de color nuevo en `raster.ts`, en la máscara y en `bakePixels.ts`, y por tanto en los tres clientes. |
| Rampas con giro de tono | El color sale de multiplicar un gris por la paleta: la sombra es el mismo color más oscuro. El objetivo usa cuatro o cinco tonos con la sombra hacia el frío y la luz hacia el claro. |
| Tramas de relleno, plano lejano y contorno interior | No hay rellenos de escamas, corteza u hojas, ni una forma de mandar una pieza «al fondo» oscureciéndola, ni líneas oscuras dentro de una pieza para separar mechones o plumas: se pinta pieza a pieza. |
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

**Medio plazo:**
- [ ] Unit specs de 13 módulos
- [ ] Armario y tienda de prendas en Android, iOS y web (§8b)
- [ ] Convertir premios de logro en prendas y equilibrar el catálogo (§8b)
- [ ] Escalado de pixel art en Android, iOS y web, y escala entera en la sala (§8c)
- [ ] Mostrar la rareza del patrón en las apps y revisar los logros de rareza (§8d)
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
- [ ] Sala isométrica en iOS (ISO-IOS, §7)
- [ ] Web Angular — features oleadas
- [ ] Más colas BullMQ
- [ ] Más endpoints cacheados