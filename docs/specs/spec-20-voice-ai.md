# Spec: Voice AI — Conversación por Voz

## ID
20 — Oleada 2 "Meta + IA" (NUEVAS_FUNCIONALIDADES §20)

## Resumen
Pipeline de audio bidireccional (STT→LLM→TTS) con VAD para endpointing, barge-in para interrupción natural, y prosodia emocional por especie. Latencia <800ms. Soporta cloud (ElevenLabs, Whisper) y local (whisper.cpp, piper-tts).

## Contexto
La interacción actual es puramente textual (`ChatService` → SSE). Para ser "companion real", el pet debe hablar y escuchar. Esto transforma "chatear con un bot" en "conversar con un ser vivo". Debe funcionar en Tauri, Android, y próximamente iOS (#27).

Conecta con: `ChatService`, `AiModelRouter` (#19), `PersonalityService`, `RealtimeGateway`, Tauri audio plugins, Android Compose.

## Objetivos
- Latencia p95 < 800ms (fin de habla → primer audio TTS).
- Prosodia emocional: 5 moods con pitch/speed distintos por especie.
- Funcionar en cloud (baja latencia) y local (offline, privacidad).
- Barge-in: cortar TTS en <100ms al detectar voz del usuario.
- VAD: hands-free natural sin botón "hablar".

## User Stories
- Como jugador, quiero hablarle a mi pet sin escribir, para que se sienta natural.
- Como jugador, quiero interrumpir al pet cuando habla, para sentir una conversación real.
- Como jugador, quiero que el pet suene diferente según su mood, para inmersión.
- Como jugador, quiero que funcione offline, para no perder la interacción.
- Como dev, quiero configurar voz por especie (JSON), para que cada especie sea reconocible.

## Criterios de aceptación
- [ ] AC1: STT >90% WER (es/EN) para frases <10s.
- [ ] AC2: VAD detecta inicio/fin con <500ms latencia.
- [ ] AC3: Pipeline STT→LLM→TTS <800ms p95 (cloud).
- [ ] AC4: Barge-in: corte TTS <100ms al detectar voz.
- [ ] AC5: 5 moods (happy, sad, excited, sleepy, angry) con parámetros distintos.
- [ ] AC6: Modo local (whisper.cpp + piper-tts) sin internet.
- [ ] AC7: Funciona en Tauri, Android, iOS (v2).
- [ ] AC8: `voice-config.json` por especie (pitch, speed, timbre, accent).
- [ ] AC9: Transcripción STT se pasa a `ChatService` como texto normal.
- [ ] AC10: UI indicators: escuchando / pensando / hablando.

## Diseño técnico

### Arquitectura
```
Client: MIC → VAD(Silero) → STT(Whisper) → ChatService(LLM) → EmotionMapper → TTS(Piper/ElevenLabs) → SPEAKER
                                                                        ↕
Backend: VoiceGateway (WS ns 'voice') + VoiceService + STT/TTS dispatch
```

Pipeline: 1) MIC 16kHz mono Opus 2) Silero-VAD (speech/silence) 3) STT stream 4) LLM (reutiliza ChatService) 5) TTS chunks 200ms

### Backend
Nuevo módulo `backend/src/modules/voice/`:
- `voice.gateway.ts` — WS namespace `voice` (JWT auth, room `voice:{sessionId}`)
- `voice.service.ts` — orquestación pipeline
- `stt.service.ts` — cloud dispatch (Whisper/Deepgram)
- `tts.service.ts` — cloud dispatch (ElevenLabs/OpenAI TTS)
- `emotion.mapper.ts` — mood → voice params
- `voice-config.service.ts` — carga config por especie

WS Events (client→server): `voice:start`, `voice:chunk` (Opus 50ms), `voice:stop`, `voice:barge-in`, `voice:cancel`.
WS Events (server→client): `stt:partial`, `stt:final`, `llm:thinking`, `tts:chunk` (Opus 200ms), `tts:done`, `voice:error`.

Redis: `petai:voice:session:{id}` (metadata TTL 300s), `petai:voice:tts-cache:{speciesId}:{emotion}:{hash}` (audio TTL 3600s).
BullMQ: `tts-cache-warm` (pre-synthesize frases comunes).

### Frontend
**Tauri:** `tauri-plugin-audio` custom (capture + playback), Silero-VAD WASM, barge-in logic.
**Android:** AudioRecord, ONNX VAD, whisper.cpp native (ARM NEON), ExoPlayer + barge-in, ForegroundService.
**Común:** `VoiceState: IDLE|LISTENING|THINKING|SPEAKING`, indicators visuales.

### Infraestructura
- CDN: `voice-config.json` (static asset por especie).
- Audio: WebSocket binary frames (Opus ~4kbps).
- Cloud: backend proxy (cliente nunca ve API key de TTS/STT).
## Interfaz de API

**WS `voice` namespace** (JWT handshake, room `voice:{sessionId}`):
- C→S: `voice:start {sessionId, petId, mode, language}`, `voice:chunk {sessionId, audio: ArrayBuffer}`, `voice:stop`, `voice:barge-in`
- S→C: `stt:partial {text, confidence}`, `stt:final {text, latencyMs}`, `llm:thinking`, `tts:chunk {audio, emotion, isLast}`, `tts:done {totalMs}`, `voice:error {code, message}`

**`GET /voice/config?petId={id}`** → `{ species: { voice: {basePitch, baseSpeed, timbre}, emotions: {...} }, mode, localAvailable }`

**`POST /voice/test`** → stream audio/opus (TTS de texto de prueba)

**`GET /voice/status`** → `{ activeSession, cloudStt: {provider, latencyMs}, localStt: {available, model} }`

## Modelo de datos

**`VoiceSession`** (nuevo):
```prisma
model VoiceSession {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  petId        String
  pet          Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  mode         String   @default("cloud")
  language     String   @default("es")
  status       String   @default("active")
  sttLatencyMs Int?
  llmTokens    Int?
  ttsTotalMs   Int?
  createdAt    DateTime @default(now())
  endedAt      DateTime?
  @@index([userId, status])
}
```

**`VoiceConfig`** (nuevo): `id`, `speciesId @unique`, `basePitch Float`, `baseSpeed Float`, `timbre String`, `cloudVoiceId String?`, `emotions Json`, `updatedAt`.

## Protocolos y comunicación
- WS binary frames: Opus audio chunks (~800 bytes/50ms).
- Barge-in: VAD detecta >200ms speech → client emite `voice:barge-in` → server cancela TTS → corte <100ms.
- Streaming TTS: chunks de 200ms, ring buffer client (800ms pre-buffer).
- Timeout: sin chunks en 10s → cierra session.
- Heartbeat: ping/pong 10s.

## Security
- Audio nunca se almacena en disco (solo memoria).
- API keys TTS/STT: backend proxy, cifradas con `KeyCryptoService`.
- Rate limit: 30 sessions/min/user, 10 chunks/sec.
- Session isolated: room `voice:{sessionId}` solo owner.
- Local mode: sin datos que salen del dispositivo.
- Consent prompt first-time (Tauri/Android permission API).
- GDPR: solo se almacena transcripción (texto) en `ChatMessage`.

## Dependencias
- `ChatService` (existing), `AiModelRouter` (#19), `PersonalityService`.
- `RealtimeGateway` (base), `RedisService`.
- ElevenLabs API, Whisper API / Deepgram.
- `tauri-plugin-audio` (custom), Silero-VAD, whisper.cpp, piper-tts.
- OpenTelemetry (#3).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | VoiceGateway + session management | 2 días |
| 2 | STT cloud (Whisper) + streaming | 2 días |
| 3 | TTS cloud (ElevenLabs) + chunks | 2 días |
| 4 | Pipeline completo: STT→ChatService→TTS | 2 días |
| 5 | VAD + barge-in | 2 días |
| 6 | EmotionMapper + voice-config | 1.5 días |
| 7 | Tauri: plugin audio (capture+playback) | 3 días |
| 8 | Tauri: VAD WASM + barge-in | 2 días |
| 9 | Android: AudioRecord + ONNX + ExoPlayer | 3 días |
| 10 | Local: whisper.cpp + piper-tts | 3 días |
| 11 | UI: VoiceState, indicators | 2 días |
| 12 | Redis cache + BullMQ warm | 1.5 días |
| 13 | Tests + docs | 3 días |

**Total: ~28.5 días (~5-6 semanas, paralelizables)**

## Performance y escalabilidad
- p95 < 800ms total: VAD 50ms + STT 300ms + LLM 300ms + TTS 200ms.
- 100 concurrent sessions/servidor.
- Memory: Silero 2MB, whisper-tiny 25MB, piper 50MB per session.
- Audio: Opus 16kHz ≈ 20KB/s/session. 100 sessions = 2MB/s.
- Stateless → horizontally scalable.

## Tests
- Unit: EmotionMapper, SttService, TtsService, BargeIn timing.
- Integration: Pipeline completo (mocks), barge-in, session timeout.
- E2E: Tauri voice session completo + barge-in.
- Load: 50 concurrent, p95 < 800ms, no memory leak.
- Edge: ruido ambiente, barge-in <100ms, TTS >5s, LLM tool_call, Redis down.

## Riesgos y notas
- Latencia cloud depende de ElevenLabs/Whisper. Mitigar con cache.
- whisper.cpp WASM ~2x más lento que native → usar Rust native en Tauri.
- Costo: ElevenLabs $0.10/1M chars, Whisper $0.006/min.
- VAD false positives en ambientes ruidosos → threshold configurable.
- Android foreground service → battery drain consideration.
- Local: WER ~8-12% (whisper-tiny) vs 4% cloud.

## Preguntas abiertas
1. ElevenLabs vs OpenAI TTS? → ElevenLabs (más prosodia, streaming nativo).
2. VAD client o server? → Client (latencia, offline).
3. Local STT por defecto en desktop? → Sí si i5+, no si bajo gama.
4. Idiomas v1? → es + en. v2: fr, pt, de, ja.
5. ¿Voz en notificaciones? → No v1, solo chat explícito.