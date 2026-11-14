# Feature Specification: Genes y Temperamento

**Feature Branch**: `017-genes-temperamento`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "Cada pet tiene 3 genes ocultos (15% de probabilidad cada uno al eclosionar) y 1 temperamento. Genes: Veloz(+10% VEL), Férreo(+10% DEF), Sagaz(crítico +3%), Devorador(+15% comida), Aurora(shiny+1%), Crono(-10% cooldown). Temperamentos: valiente, tímido, arribista, curioso. Genes modifican Fighter determinista. Se revelan con análisis genético (item de gemas)."

## User Scenarios & Testing

### User Story 1 - Ver Genes del Pet (Priority: P1)

Como jugador, quiero ver los genes de mi pet (revelados y ocultos) para conocer sus ventajas.

**Why this priority**: Es el endpoint base para toda la feature. Sin ver los genes, no hay experiencia.

**Independent Test**: GET /v1/pets/:id/genes devuelve genes revelados (con efecto) y ocultos (sin efecto).

**Acceptance Scenarios**:
1. **Given** un pet con 3 genes (2 revelados, 1 oculto), **When** llama a GET /v1/pets/:id/genes, **Then** devuelve la lista con los revelados mostrando nombre+efecto y el oculto como "???".
2. **Given** un pet sin genes, **When** llama al endpoint, **Then** devuelve array vacío.

---

### User Story 2 - Analizar y Revelar Gen (Priority: P1)

Como jugador, quiero comprar un "análisis genético" (3 gemas) para revelar un gen oculto de mi pet.

**Why this priority**: Es la mecánica de descubrimiento que da valor de colección.

**Independent Test**: POST /v1/pets/:id/analyze consume 3 gemas y revela 1 gen oculto.

**Acceptance Scenarios**:
1. **Given** un pet con 1 gen oculto y 3 gemas, **When** llama a POST /v1/pets/:id/analyze, **Then** el gen se revela y se descuentan 3 gemas.
2. **Given** un pet con 0 genes ocultos, **When** llama al análisis, **Then** recibe 400 (nada que revelar).
3. **Given** un usuario con 0 gemas, **When** llama al análisis, **Then** recibe 400 (insuficientes gemas).

---

### User Story 3 - Genes Afectan Combate (Priority: P2)

Como jugador, quiero que los genes de mi pet se apliquen en combate para que su pet sea único.

**Why this priority**: Es la integración con el motor de combate que da valor gameplay.

**Independent Test**: Un pet con gen Veloz tiene VEL+10% en el Fighter; un pet sin genes tiene stats base.

**Acceptance Scenarios**:
1. **Given** un pet con gen "veloz", **When** se arma el Fighter para combate, **Then** el stat VEL tiene +10%.
2. **Given** un pet con gen "sagaz", **When** se arma el Fighter, **Then** critChance base es 0.0625 + 0.03 = 0.0925.

---

### User Story 4 - Temperamento en IA y Combate (Priority: P2)

Como jugador, quiero que el temperamento de mi pet afecte cómo pelea y cómo habla.

**Why this priority**: Añade personalidad y diferencia la experiencia.

**Independent Test**: Un pet con temperamento "valiente" usa estrategia "aggressive"; uno "tímido" usa "defensive".

**Acceptance Scenarios**:
1. **Given** un pet con temperamento "valiente", **When** se arma el Fighter, **Then** strategy es "aggressive".
2. **Given** un pet con temperamento "curioso", **When** se arma el Fighter, **Then** strategy es "balanced".

### Edge Cases

- Pet con 3 genes todos revelados → no más análisis disponible.
- Gen "crono" reduce cooldown a 0 mínimo (no negativo).
- Eclosión genera genes deterministas por seed.
- El temperamento se asigna en la eclosión y es permanente.

## Requirements

### Functional Requirements

- **FR-001**: Al eclosionar, el pet DEBE tener 0-3 genes (15% por gen, determinista por seed) y 1 temperamento.
- **FR-002**: Los genes DEBE modificar el Fighter determinísticamente (stats, cooldown, crítico).
- **FR-003**: El temperamento DEBE mapear a una estrategia de combate y un tono de chat.
- **FR-004**: GET /v1/pets/:id/genes DEBE devolver genes revelados (con efecto) y ocultos (sin efecto).
- **FR-005**: POST /v1/pets/:id/analyze DEBE consumir 3 gemas y revelar 1 gen oculto.
- **FR-006**: Los genes DEBE ser reutilizables por breeding (#12).
- **FR-007**: La aplicación de genes DEBE ser en el armado del Fighter, no en el motor.

### Key Entities

- **PetGene**: Gen de un pet (type, revealed, revealedAt)
- **Temperament**: valiente | timido | arribista | curioso
- **GeneType**: veloz | ferreo | sagaz | devorador | aurora | crono

## Success Criteria

### Measurable Outcomes

- **SC-001**: Distribución de genes en 10k eclosiones: P(0)≈74%, P(1)≈22%, P(2)≈3%, P(3)≈0.1%.
- **SC-002**: Un pet con 3 genes gana ~15-20% más combates vs. uno sin genes (misma rareza/nivel).
- **SC-003**: El análisis genético consume exactamente 3 gemas por gen revelado.
- **SC-004**: Determinismo: mismos genes + misma seed → mismo log de combate.

## Assumptions

- La eclosión ya tiene un seed (visualSeed) que se reutiliza para genes.
- Los genes se guardan en el campo `personality` (Json) del Pet.
- El item "gene_analysis" ya existe en el inventario (o se crea como ítem de gemas).
- El temperamento no cambia después de eclosionar.
