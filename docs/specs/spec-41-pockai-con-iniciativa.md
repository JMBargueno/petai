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
| B | Iniciativa fuera del chat (bocadillos, con tres niveles de insistencia) | Hecha en librería, servidor, escritorio y Android (Android sin compilar en local) |
| C | Evaluación con un modelo real (manual, con la clave del desarrollador) | Hecha: `pnpm run eval:mind` en `backend` (ver `backend/scripts/eval-mind.ts`); sin ejecutar aún contra un modelo real |
| D | El escritorio aprende de lo que su entrenador premia | Hecha en librería, servidor y escritorio |
| E | Memoria que consolida | Hecha en librería y servidor (sin modelo; lo nacido del chat no se resume) |
| F | Rutinas con continuidad en la vida autónoma | Hecha en librería y servidor |

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

## 4. Fase B

### 4.1 Cuánto puede interrumpir

- **Tres niveles (decidido), elegibles por mascota:** `quiet` (solo al volver su entrenador),
  `normal` (discreto) y `chatty` (hablador). Están en
  `balance.json → personality.initiative.levels`.
- **El carácter modula la frecuencia (decidido):** `talkFactor` parte de 1 y suma peso por
  sociabilidad y temperamento, acotado entre 0,6 y 1,6. Divide la espera del escritorio y
  multiplica el tope diario del móvil.
- **Nunca habla** dormido, con su entrenador concentrado (Pomodoro), ni en las horas de
  silencio (23 a 8, en la zona horaria del entrenador).

### 4.2 Qué dice

Por prioridad de tipos de frase (`priority`): bienvenida si acaba de volver; saludo o
necesidad; cómo se siente; lo que le apetece; cosas de su entrenador o suyas; y charla sin más.
Dentro de cada grupo elige `pickPhrase` (personalidad, enfriamiento, repetición).

### 4.3 Reparto

- **Librería:** `shared/mind/src/initiative.ts` (`maySpeak`, `takeInitiative`,
  `shouldGreetReturn`, `talkFactor`).
- **Servidor:** `mind/initiative.service.ts`. `POST /pets/:id/initiative` con
  `{ channel, back?, focus? }` devuelve la frase ya escrita (o ninguna), el motivo si calla y
  `retryInMs`. `GET` y `PUT /pets/:id/initiative/settings` leen y eligen el nivel; los
  minutos y topes que devuelve ya llevan el carácter de ese Pockai. El estado (nivel,
  enfriamientos, lo último dicho) vive en `Pet.personality.initiative`.
- **Escritorio:** `lib/initiative.ts` es el reloj de las preguntas; el bocadillo usa la cola
  de voz de siempre. La bienvenida al volver (que detecta `presence_sense`) pasa por el
  servidor y cae a la frase local si no contesta. El ajuste está en la pestaña Mente.

### 4.4 Sin hacer

- **No hay notificaciones con la app cerrada:** el backend no tiene envío de notificaciones
  push. El canal `mobile` y su tope diario existen, pero solo servirán con la app abierta
  hasta que haya ese envío.
- Las frases salen siempre en castellano (no hay preferencia de idioma por cuenta).
- Dos dispositivos que pregunten a la vez pueden hablar los dos.

## 5. Fase C

Evaluación del chat con un modelo real: `pnpm run eval:mind` en `backend`
(`backend/scripts/eval-mind.ts`, casos en `backend/src/modules/mind/eval/cases.json`). Se lanza a
mano con la clave de quien lo ejecuta; no corre en la CI. Aún no se ha ejecutado contra un modelo.

## 6. Fase D

El Pockai aprende qué le gusta a su entrenador verle hacer en el escritorio.

### 6.1 Cómo aprende

- **Gestos** (`balance.json → personality.learning.signals`): acariciarlo y chocar los cinco
  premian; pulsarlo premia un poco; apartarlo arrastrándolo cuenta en contra.
- **A qué se atribuye:** a la conducta en curso o a la que terminó hace menos de
  `creditWindowMs`. Pasado ese margen el gesto no va por nada.
- **Qué cambia:** una preferencia por conducta en [-1, 1], que multiplica su peso en el selector
  por utilidad entre `factor.min` y `factor.max` (0,6 y 1,5). No cambia la personalidad ni salta
  requisitos: lo premiado sigue sin ofrecerse cuando no toca.

### 6.2 Límites

- Nada desaparece ni lo acapara todo (los dos extremos del factor los valida `validate:data`).
- Se olvida solo: vida media de `halfLifeDays` días.
- Tope de `dailyCap` gestos al día por mascota; pasado el tope el servidor responde
  `applied: false`, nunca error.

### 6.3 Dónde vive

- **Librería:** `shared/mind/src/learning.ts` (`reinforce`, `settleLearned`, `learnedFactor`,
  `creditTarget`, `strongestPrefs`).
- **Servidor:** `mind/learning.service.ts`; `POST /v1/pets/:id/mind/reinforce` con
  `{ behavior, signal }` y `learned` en `GET /v1/pets/:id/mind`. Se guarda en
  `Pet.personality.learned`, así viaja con la mascota entre equipos.
- **Escritorio:** `lib/brain/learningStore.ts`. El gesto se aplica al momento con la misma
  librería y se envía al servidor, cuya respuesta manda. La pestaña Mente cuenta lo aprendido.

### 6.4 Sin hacer

- Android e iOS no tienen conductas de escritorio: no envían gestos. Pueden leer `learned`.
- Lo aprendido no influye todavía en el chat ni en las frases de iniciativa.
- El escritorio no guarda lo aprendido en disco: sin red, dura lo que la sesión.

## 7. Fase E

Consolidación de la memoria: lo que se va a olvidar se pliega antes en un resumen.

### 7.1 Qué hace

- Al llenarse la capa de episodios, los de menor retención se borraban sin más. Ahora, antes de
  borrarse, se **pliegan** en el resumen de su grupo: alguien (`sum:pet:<id>`, `sum:user:<id>`)
  o un tipo de vivencia (`sum:find`, `sum:adventure`).
- De cada grupo se guardan solo un contador, la media de cómo fueron y las fechas, en
  `Pet.personality.digests`. Nunca texto de los episodios.
- El resumen es un recuerdo más de la capa semántica (`kind: digest`, vida media de 60 días):
  «He quedado muchísimas veces con Brasa (Pockai de Ana): nos conocemos de sobra. Casi siempre lo
  pasamos genial.». El texto sale de `strings` (`DIGEST_<GRUPO>_<SOME|MANY>` y
  `DIGEST_<GRUPO>_TONE_<GOOD|MIXED|BAD>`), sin modelo.
- En el prompt va marcado «(de hace tiempo)».

### 7.2 Límites

- Solo se pliegan los tipos de `balance.json → personality.memory.consolidation.kinds`
  (encuentros, visitas, hallazgos y aventuras). **Lo nacido del chat se olvida como antes:**
  resumirlo bien exige leerlo, y eso es cosa de un modelo.
- Hasta `minCount` episodios plegados no se escribe resumen; a partir de `manyFrom` son «muchas».
- Como mucho `maxDigests` grupos por mascota: se sueltan aquellos de los que hace más que no
  pasa nada.
- Sin relación guardada con alguien no se escribe su resumen (no hay cómo llamarlo), pero se cuenta.
- Privacidad: el resumen vive en la capa semántica, que nunca se enseña a visitantes ni a otros
  Pockais. Si el entrenador lo borra, se borra también su contador y no reaparece.

### 7.3 Dónde vive

- **Librería:** `shared/mind/src/consolidate.ts` (`groupOf`, `foldEpisodes`, `digestView`).
- **Servidor:** `MindMemoryService.enforceCapacity` → `consolidate`; `forgetDigests`.
- **Clientes:** nada que cambiar; ya listan y dejan olvidar cualquier recuerdo.

### 7.4 Sin hacer

- Resumir lo nacido del chat con un modelo.
- Búsqueda por significado: la relevancia sigue siendo por palabras compartidas.
- Los resúmenes salen en castellano (no hay preferencia de idioma por cuenta); el inglés está escrito.

## 8. Fase F

Rutinas con continuidad en la vida autónoma.

### 8.1 Qué cambia

La vida autónoma simula qué hace el Pockai cada hora que su entrenador no está. Cada hora era una
tirada suelta. Ahora, sobre los mismos pesos por personalidad:

- **Momento del día**, en la hora local de su entrenador (`User.timezone`): mañana, tarde,
  anochecer y noche. De noche descansa casi siempre; por la mañana explora más; al anochecer
  espera a que vuelva.
- **Hilo:** lo que está haciendo tiende a seguir (`momentum.stay`) hasta llevar
  `momentum.maxStreak` horas, y entonces se cansa (`momentum.tired`). De descansar y de esperar
  no se cansa. Al dejar una actividad, otras apetecen más (`after`: descansar tras explorar).
- **Recuerdos:** una racha de `longFrom` horas se cuenta una vez («Me pasé horas explorando…»,
  `AUTO_LONG_<ACTIVIDAD>_1`) en lugar de repetir el mismo recuerdo cada hora.
- **Entre lecturas:** en qué andaba se guarda en `Pet.personality.routine` y se retoma si la
  siguiente hora simulada es la inmediata; con un hueco de por medio, se empieza de nuevo.

### 8.2 Arreglo: cada hora en su día

Los topes diarios (felicidad, energía, objetos, encuentros) se cargaban todos al día de la
lectura: tras una ausencia que cruzaba la medianoche, lo de ayer gastaba el cupo de hoy. Ahora
cada hora cuenta en su día (UTC, el mismo criterio del barrido social), y una hora de un día ya
cerrado no gasta ni borra los contadores de un día posterior.

### 8.3 Dónde vive

- **Librería:** `shared/mind/src/routine.ts` (`phaseOf`, `routineFactor`, `advanceRoutine`,
  `isLongStretch`).
- **Datos:** `balance.json → personality.autonomy.routine`. Los factores inclinan, no prohíben
  (entre 0,05 y 10): lo valida `validate:data`.
- **Servidor:** `mind/autonomy.engine.ts` (`simulate` con `clock` y `routine`) y
  `mind/autonomy.service.ts`. Sin `clock` el motor se comporta exactamente como antes.

### 8.4 Sin hacer

- Sigue sin saberse desde cuándo duerme, está enfermo o está en su hábitat: esos tres estados se
  aplican tal como están ahora a todas las horas simuladas. Haría falta guardar cuándo cambiaron.
- La rutina es la misma para todos; la personalidad solo entra por los pesos de siempre.
- Los clientes no muestran la rutina (qué suele hacer a cada hora).
