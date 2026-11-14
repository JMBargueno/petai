# Feature Specification: Voice AI — Conversación por Voz

**Feature Branch**: `[020-voice-ai]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: Pipeline de audio bidireccional (STT→LLM→TTS) con prosodia emocional por especie, barge-in para interrupción natural. Latencia <800ms.

## User Scenarios & Testing

### User Story 1 - STT: Transcripción de voz (Priority: P1)

Como jugador, quiero hablarle a mi pet sin escribir, para que la interacción se sienta natural.

**Why this priority**: STT es la puerta de entrada al pipeline de voz. Sin transcripción no hay conversación.

**Independent Test**: Enviar un chunk de audio a `POST /v1/voice/transcribe` y verificar que retorna texto transcripido.

**Acceptance Scenarios**:
1. **Given** un chunk de audio en base64 (frase en español <10s), **When** se envía a `/v1/voice/transcribe`, **Then** se retorna texto transcripido con >90% WER.
2. **Given** audio vacío o corrupto, **When** se envía, **Then** se retorna 400 con mensaje de error claro.

---

### User Story 2 - TTS: Síntesis de voz con prosodia (Priority: P2)

Como jugador, quiero que el pet suene diferente según su mood, para inmersión.

**Why this priority**: TTS con emoción convierte "bot de texto" en "ser vivo".

**Independent Test**: Enviar texto + speciesId + mood a `POST /v1/voice/speak` y recibir chunks de audio Opus.

**Acceptance Scenarios**:
1. **Given** texto "Hola amiguito" + speciesId + mood "happy", **When** se llama a `/v1/voice/speak`, **Then** se retorna audio con pitch/speed distintos al mood "sad".
2. **Given** 5 moods (happy, sad, excited, sleepy, angry), **When** se genera voz para cada uno, **Then** cada mood tiene parámetros (pitch, speed, intensity) distintos.

---

### User Story 3 - Config por especie (Priority: P3)

Como dev, quiero configurar voz por especie (JSON), para que cada especie sea reconocible.

**Why this priority**: Data-driven permite añadir especies sin código.

**Independent Test**: Crear entry en voice-config.json para una especie. Llamar a `GET /v1/voice/config/:speciesId`. Verificar que retorna parámetros.

**Acceptance Scenarios**:
1. **Given** speciesId "flamefox" en voice-config.json, **When** se llama `GET /v1/voice/config/flamefox`, **Then** se retorna basePitch, baseSpeed, timbre, emotions.
2. **Given** speciesId inexistente, **When** se llama al endpoint, **Then** se retorna 404.

---

### Edge Cases

- Audio muy largo (>30s) → chunking automático.
- TTS >5s → se envía en chunks de 200ms.
- Specie sin voice-config → parámetros default.
- Redis down → cache TTS in-memory fallback.
- LLM en tool_call → no genera TTS.

## Requirements

### Functional Requirements

- **FR-001**: System MUST transcribir audio a texto con >90% WER (es/EN, frases <10s)
- **FR-002**: System MUST sintetizar texto a audio con prosodia emocional (5 moods)
- **FR-003**: System MUST aplicar parámetros de voz específicos por especie
- **FR-004**: System MUST exponer `POST /v1/voice/transcribe` para STT
- **FR-005**: System MUST exponer `POST /v1/voice/speak` para TTS
- **FR-006**: System MUST exponer `GET /v1/voice/config/:speciesId` para parámetros de voz
- **FR-007**: System MUST cargar voice-config.json data-driven por especie
- **FR-008**: System MUST cachear TTS en Redis (TTL 3600s) para frases recurrentes
- **FR-009**: System MUST registrar sesiones de voz en base de datos

### Key Entities

- **VoiceSession** (nuevo): tracking de sesiones de voz con latencias
- **VoiceConfig** (nuevo): parámetros de voz por especie (basePitch, baseSpeed, timbre, emotions)
- **voice-config.json** (game-data): definición data-driven de voces por especie

## Success Criteria

### Measurable Outcomes

- **SC-001**: Latencia p95 < 800ms (fin de habla → primer audio TTS)
- **SC-002**: STT >90% WER para español e inglés
- **SC-003**: 5 moods con parámetros distinguibles audiblemente
- **SC-004**: TTS cache hit >30% para frases recurrentes

## Assumptions

- Cloud STT (Whisper) y TTS (ElevenLabs) como providers primarios
- Local mode (whisper.cpp + piper-tts) es v2 (frontend side)
- El backend solo gestiona dispatch a servicios cloud
- Audio en Opus 16kHz mono
- Redis disponible para TTS cache
