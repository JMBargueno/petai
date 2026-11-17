# Pendientes de PetAI

> Actualizado: 15/11/2026 — después de cerrar Pasos 1-4 del informe de mejoras.
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
| HAB-BUFFS | **Rebalancear los buffs del hábitat** (`shared/game-data/habitats.json`). Hoy el catálogo completo suma más que los topes: felicidad 0,55 / 0,30, higiene 0,50 / 0,40 y combate 0,15 / 0,10 (energía 0,35 / 0,40 sí cabe). `getActiveBuffs` recorta al tope, así que el jugador que compra de más paga muebles que no aportan, y `final_throne` da él solo todo el tope de combate. Decidir entre subir topes, bajar buffs por mueble o limitar la suma por sala. `node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs` muestra las sumas y las reglas están en `.claude/skills/pockai-habitat-architect/references/balance.md`. Ajustar el e2e de topes (`backend/test/habitat.e2e-spec.ts`, test e) si cambian. |

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

## Resumen por prioridad

**Ahora (bloquea prod):**
- [ ] Merguear R-07 (commit `94d5214`)
- [ ] Configurar `EMAIL_SENDER` real
- [ ] Configurar `REALTIME_REDIS=true` en prod
- [ ] Secrets + CORS + TRUST_PROXY
- [ ] Actualizar DEPLOY.md

**Próximo sprint:**
- [ ] Rebalancear los buffs del hábitat (HAB-BUFFS, §4)
- [ ] Ejecutar load test + documentar resultados
- [ ] Corregir flakiness e2e en CI
- [ ] Paso 5: 1-2 features oleadas con UI (ej. Raid, Training)

**Medio plazo:**
- [ ] Unit specs de 13 módulos
- [ ] UI de features oleadas 2/3
- [ ] Dashboard observabilidad
- [ ] CI: load test manual
- [ ] Migrar `socket.io-redis` → `@socket.io/redis-adapter`

**Nice-to-have:**
- [ ] iOS client
- [ ] Sala isométrica en iOS (ISO-IOS, §7)
- [ ] Web Angular — features oleadas
- [ ] Más colas BullMQ
- [ ] Más endpoints cacheados