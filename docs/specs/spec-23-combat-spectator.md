# Spec: Combat Spectator en Tiempo Real + Highlights

## ID
23 — Oleada 2 "Meta + IA" (NUEVAS_FUNCIONALIDADES §23)

## Resumen
Modo espectación de combates en tiempo real con delay de 10s (evita cheating), sistema de highlights automáticos (críticos, remontadas, >30 rondas) con replay de 30s, y feed semanal de "mejores combates". Comentarios generados por LLM.

## Contexto
El motor de combate (`BattlesModule`) es determinista (seed-based) y ya guarda el log completo en `Battle.log` (JSON). Actualmente los combates son 1:1 y el resultado se muestra al instante. No hay forma de "ver" un combate en progreso ni de ver highlights. El log JSON ya contiene todas las acciones por round, lo que permite un replay perfecto.

Conecta con: `BattlesModule` (motor + log), `RealtimeGateway`, `AiModule` (comentarios LLM), `RedisService`.

## Objetivos
- Espectar combates en vivo con delay de 10s (sin ventaja para el defensor).
- Highlights automáticos: detectar combates "emocionantes" y guardar replay.
- Feed semanal de combates destacados (top 20 por rating).
- Comentarios automáticos del LLM (estilo "narrador de deportes").

## User Stories
- Como jugador, quiero ver el combate de un amigo en vivo, para sentir el drama.
- Como jugador, quiero ver un replay de un combate épico, para compartirlo.
- Como jugador, quiero que el combate tenga comentarios automáticos ("¡Crítico!"), para que sea más entretenido.
- Como jugador, quiero un feed de "mejores combates de la semana", para tener contenido que ver.
- Como jugador, quiero que mi combate no se vea por el defensor (delay 10s), para que no pueda anticipar.

## Criterios de aceptación
- [ ] AC1: Delay de 10s: el espectador ve el round N cuando el combatante ya está en round N+1.
- [ ] AC2: Highlights: combates con crítico >50% damage, remontada (<20% HP → gana), >30 rounds se marcan automáticamente.
- [ ] AC3: Replay de 30s: se puede ver el combate desde el punto más emocionante.
- [ ] AC4: Feed semanal: top 20 combates por "rating" (críticos + remontadas + duración + rarity de pets).
- [ ] AC5: Comentarios LLM: 1 comentario por cada 5 rounds (máx 20 chars), estilo narrador.
- [ ] AC6: UI: barras HP animadas, nombres, elementos, turnos, "¡CRÍTICO!" popup.
- [ ] AC7: El defensor NO puede ver el combate en vivo (solo el atacante).
- [ ] AC8: Si ambos jugadores aceptan, el combate es público (cualquiera puede espectar).
- [ ] AC9: El replay se guarda 7 días (luego se elimina para ahorrar espacio).
- [ ] AC10: El combate se puede compartir (URL con token expirable 24h).

## Diseño técnico

### Arquitectura
```
Combat en progreso (BattlesModule)
    │
    ├── CombatStreamer (nuevo)
    │   - Buffer de rounds en Redis (delay 10s)
    │   - Emite vía WS namespace 'spectate'
    │   - Marca highlights (críticos, remontadas)
    │
    ├── HighlightService (nuevo)
    │   - Al terminar: evalúa si es "highlight"
    │   - Guarda replay (log JSON → 30s segment)
    │   - Calcula rating
    │
    └── CommentaryService (nuevo)
        - Cada 5 rounds: llama a LLM (interaction_type: 'creative')
        - Genera 1 frase de comentario (máx 20 chars)
        - Cache: si mismo pattern → mismo comentario
```

### Backend
Nuevo módulo `backend/src/modules/spectate/`:
- `spectate.module.ts`, `spectate.service.ts`
- `combat-streamer.service.ts` — buffer + delay + WS emit
- `highlight.service.ts` — detección + storage + rating
- `commentary.service.ts` — LLM comments
- `spectate.gateway.ts` — WS namespace `spectate`
- `spectate.controller.ts` — REST (feed, replay, share)

Cambios en `BattlesModule`:
- Al iniciar combate: notificar a `CombatStreamer` (pet IDs, element types).
- Al cada round: emitir round data a `CombatStreamer`.
- Al terminar: notificar a `HighlightService`.

Redis:
- `petai:spectate:live:{battleId}` → List de rounds (buffer, max 30 rounds). TTL 60s.
- `petai:spectate:highlights` → Sorted Set (score=rating, member=battleId).
- `petai:spectate:comments:{battleId}` → Hash {round: comment}.

### Frontend
**Spectator UI (nueva vista):**
- Canvas/SVG: 2 pets con barras HP animadas (transitions 300ms).
- Round counter, element icons, turn indicator.
- "¡CRÍTICO!" popup (animation 500ms, shake).
- Comentario del LLM en banner inferior (fade in/out).
- Controls: pause, speed (1x/2x/4x), skip.

**Feed semanal:**
- Grid de highlights (thumbnail + rating + duration).
- Click → replay player.
- Share button → copia URL con token.

### Infraestructura
- CDN: Replays se almacenan en S3-compatible storage (R2/MinIO). URL con token expirable.
- No se necesita infraestructura adicional para el streaming (WS existente).
## Interfaz de API

**`GET /spectate/battles/:battleId`** (JWT, solo si autorizado)
```json
{ "id": "uuid", "status": "live|finished", "attacker": { "name", "element", "hp", "maxHp" }, "defender": {...}, "currentRound": 5, "totalRounds": null }
```

**`GET /spectate/highlights`** → top 20 combates de la semana
```json
{ "highlights": [{ "id", "attackerName", "defenderName", "rating", "duration", "rounds", "tags": ["critical", "comeback"], "thumbnail", "createdAt" }] }
```

**`GET /spectate/replay/:battleId?token={shareToken}`**
```json
{ "battleId", "seed", "log": [...], "highlight": { "startRound": 12, "endRound": 18, "reason": "comeback" }, "comments": [{ "round": 5, "text": "¡Impresionante!" }] }
```

**`POST /spectate/share/:battleId`** → `{ "url": "...", "expiresAt": "..." }` (token 24h)

**WS `spectate` namespace:**
- C→S: `spectate:join { battleId }`, `spectate:leave`, `spectate:pause`, `spectate:speed { multiplier }`
- S→C: `spectate:round { round, actions[], hp: {attacker, defender}, isCritical, isFinish }`
- S→C: `spectate:comment { round, text }`
- S→C: `spectate:highlight { type: "critical"|"comeback"|"long", round }`
- S→C: `spectate:finished { winner, rating, isHighlight }`

## Modelo de datos

**`BattleHighlight`** (nuevo):
```prisma
model BattleHighlight {
  id            String   @id @default(uuid())
  battleId      String   @unique
  battle        Battle   @relation(fields: [battleId], references: [id])
  rating        Int      @default(0)
  tags          Json     // ["critical", "comeback", "long_battle"]
  startRound    Int
  endRound      Int
  duration      Int      // ms
  replayUrl     String?
  isPublic      Boolean  @default(false)
  createdAt     DateTime @default(now())
  expiresAt     DateTime // +7d
  @@index([rating, createdAt])
  @@index([expiresAt])
}
```

**`BattleComment`** (nuevo):
```prisma
model BattleComment {
  id         String   @id @default(uuid())
  battleId   String
  round      Int
  text       String   // máx 20 chars
  createdAt  DateTime @default(now())
  @@unique([battleId, round])
}
```

**`Battle`** (modificado): + `highlights BattleHighlight?`, `comments BattleComment[]`.

## Protocolos y comunicación
- **Delay 10s:** `CombatStreamer` buffer en Redis. Emite round N solo cuando round N+1 ocurre (10s real).
- **WS namespace `spectate`:** room `battle:{battleId}` (máx 100 espectadores/battle).
- **Replay:** No es streaming real — es el log JSON que se re-playea client-side (deterministic por seed).
- **Comentarios:** `CommentaryService` llama al LLM cada 5 rounds. Si LLM falla, no se emite comentario (non-blocking).
- **Expiración:** BullMQ job `highlight-expire` cada 6h → borra replays expirados.

## Security
- Autorización: solo los combatantes (o público si ambos aceptaron) pueden ver el combate.
- Share token: expirable 24h, single-use no (pero expira).
- WS: JWT + verificación de acceso al battle.
- Rate limit: 10 spectate:join/min/user.
- Los comments del LLM se moderan (mismo `moderation.ts` existente).

## Dependencias
- `BattlesModule` (motor, log, seed), `RealtimeGateway` (infraestructura WS).
- `AiModule`/`AiModelRouter` (#19) para comentarios (interaction_type: 'creative').
- `RedisService`, `PrismaService`.
- CDN/S3 para replays (si >1MB de log).
- Moderation (existing).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | CombatStreamer (buffer Redis + delay 10s) | 2 días |
| 2 | SpectateGateway (WS) + join/leave/round emit | 2 días |
| 3 | HighlightService (detección + rating + storage) | 2 días |
| 4 | CommentaryService (LLM every 5 rounds) | 1.5 días |
| 5 | Feed semanal endpoint + query | 1 día |
| 6 | Replay endpoint + share token | 1 día |
| 7 | Frontend: Spectator UI (HP bars, animations) | 3 días |
| 8 | Frontend: Feed + Replay player + Share | 2 días |
| 9 | Tests + docs | 2 días |

**Total: ~16.5 días (~3-4 semanas)**

## Performance y escalabilidad
- Buffer Redis: 30 rounds × 200 bytes = ~6KB per battle. 1000 concurrent battles = 6MB.
- WS: 100 spectators × 50 messages/min = 5000 msg/min por battle. Soportable.
- LLM comments: 1 call / 5 rounds / battle. 1000 battles × 10 calls = 10k calls/day → usar modelo barato.
- Replays: JSON log ~50KB-200KB. 1000/day = ~100MB/day. Expiración 7d = ~700MB peak.
- Rating calculation: O(1) al terminar (críticos count + remontada bool + rounds).

## Tests
- Unit: HighlightService (detección de crítico/remontada), rating calculation, delay buffer.
- Integration: Combate → stream → spectator ve delay de 10s → termina → highlight se guarda.
- E2E: Full spectate flow: join → ver rounds → crítico → highlight → replay.
- Load: 100 concurrent spectators × 10 battles = 1000 WS connections.
- Edge: Combatante disconnecta mid-spectate, LLM timeout, 0 highlights en la semana.

## Riesgos y notas
- Costo LLM para comentarios: usar modelo barato (gpt-4o-mini / gemini-flash). 20 chars = ~10 tokens.
- Privacy: El defensor puede no querer que su combate sea público. Default: privado. Opt-in.
- "Emocionante" es subjetivo: el rating es una heurística. Puede no coincidir con percepción del usuario.
- Share URL: Si alguien comparte un combate privado (por bug), es un leak. Mitigar: verificar `isPublic` en el endpoint.
- 10s delay es fijo: Si el combate es rápido (<10s rounds), el espectador ve todo con delay constante.

## Preguntas abiertas
1. ¿Delay de 10s es configurable? → Fijo v1 (10s).
2. ¿Comentarios en español e inglés? → Español v1, English v2.
3. ¿Replay offline (download)? → No, solo streaming desde server (7d).
4. ¿Máx espectadores por combate? → 100 (WS room limit).