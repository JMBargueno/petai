# Spec 41 — Pockai con iniciativa

Continuación de la spec 37 (cerebro del Pockai). Allí el Pockai aprendió a decidir bien cuando se
le habla; aquí se trata de que **tome la iniciativa**, tenga un ánimo propio y hable de su
entrenador con datos concretos, en el escritorio y en las apps.

## 1. Reglas

- **Librería compartida.** La lógica nueva va en `shared/mind` (`@pockai/mind`): funciones puras,
  sin reloj, red ni azar no sembrado. Los números y los textos van en `shared/game-data`.
- **Decide el servidor.** El servidor ejecuta la librería y manda a las apps qué dice o hace el
  Pockai; Android e iOS solo lo muestran. El escritorio puede usar la librería directamente para
  lo que es solo suyo (cursor, ventanas).
- **Sin LLM para los bocadillos.** Lo que el Pockai dice por su cuenta son plantillas con
  variables. El modelo solo interviene en el chat.
- **Privacidad.** Los datos del entrenador y sus frases son solo para él: nunca ante un visitante
  ni ante otro Pockai.

## 2. Fases

| Fase | Qué | Estado |
|---|---|---|
| A | Frases con variables, datos del entrenador y ánimo de corto plazo | Hecha |
| B | Iniciativa fuera del chat (bocadillos y notificaciones, con tres niveles de insistencia) | Pendiente |
| C | Evaluación con un modelo real (manual, con la clave del desarrollador) | Pendiente |
| D | El escritorio aprende de lo que su entrenador premia | Pendiente |
| E | Memoria que consolida | Pendiente |
| F | Rutinas con continuidad en la vida autónoma | Pendiente |

## 3. Fase A

### 3.1 Frases con variables

- **Datos:** `shared/game-data/phrases.json`. Cada frase tiene `id`, `kind`, texto por idioma,
  peso (`base`, `weights` por dimensión), condiciones (`when`: `all`, `any`, `none` sobre una lista
  cerrada de señales) y `cooldownMinutes`.
- **Variables:** entre llaves dobles y con puntos: `{{nombre.custodio}}`,
  `{{tipo.mascota.real}}`, `{{nombre.mascota.real}}`… El catálogo está en `variables`, con el
  origen de cada una (`owner`, `pet`, `fact`, `relation`, `trick`).
- **Librería:** `shared/mind/src/phrases.ts`: `variablesOf`, `renderPhrase` (devuelve `null` si
  falta alguna variable: nunca sale un hueco vacío), `eligiblePhrases` y `pickPhrase` (mismo
  selector por utilidad que las conductas: personalidad, contexto, enfriamiento y repetición).
- **Validación:** `scripts/lib/validate-phrases.js`, en `pnpm validate:data`: variables no
  declaradas o mal escritas, llaves sueltas, idiomas con variables distintas, señales o tipos
  desconocidos, y que siempre quede una frase que no dependa de datos aprendidos.

### 3.2 Datos del entrenador

Para decir «¿Has dado de comer hoy a tu perro Toby, Jose?» hacen falta datos concretos, no
recuerdos en texto libre.

- **Lista cerrada** en `phrases.json → facts`: `owner.nickname`, `real_pet.type`, `real_pet.name`,
  `owner.job`, `owner.hobby`, `owner.favorite_food`. Lo que no esté en la lista no se guarda como
  dato.
- **Se aprenden del chat (decidido).** La extracción de memoria que ya existía devuelve además
  `slots: { clave: valor }`; `parseSlots` (`ai/memory.ts`) acepta solo claves de la lista y
  valores cortos, de una línea y sin nada sensible. `null` olvida el dato. Sin coste extra de IA.
- **Dónde viven:** recuerdos semánticos con clave `slot:<id>` y sujeto `owner`, con el texto
  «etiqueta: valor». El entrenador los ve y los borra como cualquier otro recuerdo.

### 3.3 Ánimo de corto plazo

- **Librería:** `shared/mind/src/feeling.ts`. Dos números: `valence` (de dolido a contento) y
  `arousal` (de adormilado a alterado). Los acontecimientos los empujan
  (`balance.json → personality.feeling.events`, con los mismos nombres que la deriva de
  personalidad) y vuelven solos a su punto de reposo con una vida media (90 min). El reposo
  depende del carácter y de los vitales.
- **Servidor:** `MindService.applyExperience` lo actualiza en la misma escritura que la deriva
  (`Pet.personality.feeling`). `GET /pets/:id/mind` devuelve `feeling { label, valence, arousal }`
  ya asentado. El chat añade una línea al prompt cuando el ánimo no es neutro.
- **Etiquetas:** `excited`, `content`, `upset`, `down`, `restless`, `sleepy`, `neutral`. Cada una
  (salvo la neutra) es una señal para las frases (`feeling_<etiqueta>`).

### 3.4 Sin hacer en esta fase

- Nadie elige ni muestra todavía las frases: es la fase B.
- El ánimo aún no cambia el peso de las reacciones del chat ni las conductas del escritorio.
- No hay pantalla para ver o corregir los datos del entrenador más allá de la lista de recuerdos.
- Las frases salen en castellano o inglés, pero no existe una preferencia de idioma por cuenta.
