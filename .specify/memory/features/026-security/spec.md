# Feature Specification: Security — Zero-Trust + E2E Encryption

**Feature Branch**: `026-security`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "Hardening de seguridad: token rotation (access 15min + refresh 7d), device fingerprinting anti-farming, E2E encryption para chat IA, y rate limiting multi-dimensional (IP + device + user)."

## User Scenarios & Testing

### User Story 1 - Token Rotation (Priority: P1)

Como usuario, quiero que cada refresh rote el token para detectar robo.

**Why this priority**: Es la base de la seguridad de sesión.

**Independent Test**: `POST /v1/security/rotate-token` con un refresh válido genera un nuevo refresh y invalida el anterior.

**Acceptance Scenarios**:
1. **Given** un refresh válido, **When** lo uso, **Then** obtengo un nuevo refresh y el anterior queda rotado.
2. **Given** un refresh ya rotado, **When** lo reutilizo, **Then** se revocan TODOS los refresh del usuario (reuse detection) y recibo 401.

---

### User Story 2 - Device Fingerprinting (Priority: P2)

Como admin, quiero detectar cuentas bot/farming por fingerprint.

**Independent Test**: `POST /v1/security/verify` con features devuelve un fingerprint + score; 3+ cuentas mismo FP → flag.

**Acceptance Scenarios**:
1. **Given** un fingerprint nuevo, **When** lo verifico, **Then** se registra y devuelve score 0.
2. **Given** 3 cuentas con el mismo FP, **When** se verifica la 3ra, **Then** se marca `flagged=true` con score elevado.

---

### User Story 3 - Device Status + E2E (Priority: P2)

Como usuario, quiero ver el estado de mis dispositivos y gestionar mi public key E2E.

**Independent Test**: `GET /v1/security/device-status` devuelve el score/flag del fingerprint del usuario.

**Acceptance Scenarios**:
1. **Given** un usuario con fingerprint registrado, **When** consulta device-status, **Then** ve score y flag.
2. **Given** un fingerprint con score > 80, **When** consulta, **Then** aparece como flag para revisión (no ban automático).

### Edge Cases

- Reuse de refresh rotado → revocación total + 401.
- Fingerprint con false positive (mismo ISP) → score gradual, no ban automático.
- Public key E2E inválida (no P-256) → 400.
- 5 fallos de dispatch → no aplica aquí (es 025).

## Requirements

### Functional Requirements

- **FR-001**: `POST /v1/security/rotate-token` DEBE rotar el refresh (invalida el anterior) con reuse detection.
- **FR-002**: Reuse de un refresh rotado DEBE revocar todos los refresh del usuario.
- **FR-003**: `POST /v1/security/verify` DEBE computar fingerprint SHA-256 (UA+screen+tz+fonts) y score.
- **FR-004**: 3+ cuentas con el mismo fingerprint DEBE flag (score > 80 → revisión, no ban).
- **FR-005**: `GET /v1/security/device-status` DEBE devolver el estado (score, flag) del fingerprint del user.
- **FR-006**: E2E: `E2eKeyPair` guarda la public key P-256 (PEM); el backend solo enruta cifrado.
- **FR-007**: Audit log: login, rotation, ip_change, key_created, key_revoked, account_deleted (inmutable, retention 1 año).
- **FR-008**: Rate limiting multi-dimensional (IP, device, user) con el más restrictivo aplicable.

### Key Entities

- **AuditLog**: id, userId, event, ip, userAgent, fingerprint, metadata Json?, createdAt. Inmutable.
- **E2eKeyPair**: id, userId, publicKey (PEM P-256), createdAt, revokedAt?.
- **RefreshToken** (existing): se añade uso de `rotatedAt`/`revokedAt` para rotation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% de los refresh reutilizados disparan revocación total.
- **SC-002**: Fingerprint de 3+ cuentas produce flag en <50ms (Redis O(1)).
- **SC-003**: El audit log es append-only: no existe API de borrado; retention 1 año.
- **SC-004**: El backend E2E nunca lee el prompt (solo enruta cifrado).

## Assumptions

- `AuthModule` gestiona el emision de JWT (access 15min).
- El fingerprint se computa con SHA-256 de las features provistas por el cliente.
- Los refresh se reutilizan vía `RefreshToken` existente (hash, expiresAt, revokedAt).
