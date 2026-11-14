# PetAI — Diseño de Juego y Mecánicas

Este documento contiene las reglas, fórmulas matemáticas y parámetros de diseño del juego PetAI.

---

## 1. Eclosión y Probabilidades

### 1.1 Distribución de Rareza
Las tiradas de eclosión se resuelven en el servidor de forma autoritativa utilizando `crypto.randomInt`:

| Rareza | Probabilidad | Multiplicador de Stats Base | Especies Iniciales |
|---|---|---|---|
| **Normal** | 60.0 % | $\times 1.00$ | Ignisaurio (Fuego), Axolunar (Agua), Cloropulpo (Planta) |
| **Raro** | 25.0 % | $\times 1.15$ | Especies intermedias |
| **Super-raro** | 10.0 % | $\times 1.30$ | Especies avanzadas |
| **Legendario** | 4.0 % | $\times 1.50$ | Criaturas raras |
| **Mítico** | 1.0 % | $\times 1.75$ | Criatura mítica especial |

### 1.2 Sistema de Pity (Protección contra mala suerte)
- **Super-raro garantizado**: Si tras 29 huevos no ha salido ningún huevo Super-raro o superior, el huevo 30 tiene una probabilidad del 100% de ser al menos Super-raro.
- **Legendario garantizado**: Si tras 119 huevos no ha salido ningún Legendario o Mítico, el huevo 120 garantiza al menos un Legendario.
- Ambos contadores (`sinceSuperRare`, `sinceLegendary`) se reinician al obtener una rareza igual o superior a la requerida.

### 1.3 Patrones y Rasgos Visuales (Pipeline de Composición Determinista)
- Patrones: `liso` (predeterminado), `manchas`, `rayas`, `degradado`, `escamas`, `cristal`, `galaxia`, `aurora`.
- Los patrones avanzados (`escamas`, `cristal`, `galaxia`, `aurora`) solo son accesibles en rarezas Super-raro, Legendario y Mítico.
- Cada criatura recibe una `visualSeed` (entero de 32 bits autoritativo) y una tupla de paleta (`primaryColor`, `secondaryColor`, `accentColor`) proveniente de `palettes.json`.
- Existe un 2% de probabilidad independiente de variante **Shiny** (paleta alternativa y efecto de brillo especular diagonal animado cada 4 s + destellos).
- **Algoritmo Mulberry32**: Todos los clientes (Tauri, Android, iOS) ejecutan el mismo PRNG con `visualSeed` para derivar:
  - Desplazamiento del patrón (`offsetX`, `offsetY`) de 0 a 255 px.
  - Escala y rotación del patrón (0.85x a 1.15x, $\pm 0.15$ rad).
  - Variación sutil de matiz (`hueShift` de $\pm 8^\circ$) para que dos criaturas de la misma especie y color tengan matices únicos.
- **Pipeline de Composición por Capas**:
  1. Base de Color: Canales R (primario) y G (secundario) de `mask.png`.
  2. Proyección de Patrón: `patterns/{patternId}.png` recortado estrictamente por el canal B de `mask.png`.
  3. Sombreado y Líneas: `base.png` superpuesto en modo `Multiply` (sombras grises) y `Normal` (lineart y reflejos de ojos).
  4. Pase Shiny (si `shiny == true`): Franja brillante animada + partículas.
- **Catálogo de Animaciones (14 estados)**:
  - Críticas obligatorias (22 frames base): `idle` (4), `walk` (4), `eat` (4), `happy` (4), `sleep` (2), `attack` (4).
  - Recomendadas ampliadas: `idle_alt` (4), `sit` (2), `clean` (4), `sad` (2), `sick` (2), `cast` (4), `hurt` (2), `faint` (3), `talk` (3).
  - Sistema de fallbacks automáticos en runtime y transformaciones procedurales (squash & stretch, retroceso). Ver especificación técnica completa en [docs/ART_PIPELINE.md](ART_PIPELINE.md).

---

## 2. Vitalidad y Cuidado (Deterioro Perezoso)

### 2.1 Estadísticas Vitales (0 a 100)
- **Hambre** ($H$): Se reduce 5 puntos por hora en vigilia; 1.5 puntos por hora en sueño.
- **Felicidad** ($F$): Se reduce 4 puntos por hora si el hambre $> 30$; se reduce más rápido si tiene hambre extrema.
- **Energía** ($E$): Se reduce 3 puntos por hora activo; se recupera a 20 puntos por hora mientras duerme.
- **Higiene** ($G$): Se reduce 2.5 puntos por hora.
- **Salud** ($S$): Se calcula en función del tiempo prolongado con $H < 15$ o $G < 15$. Si $S < 20$, la mascota entra en estado `sick = true`.

### 2.2 Cálculo de Tick Perezoso (Lazy Tick)
En lugar de ejecutar tareas en segundo plano por cada mascota en la base de datos, el estado se actualiza en el momento de la consulta:

$$\Delta t = \text{now}() - \text{lastTickAt}$$

1. Se descomponen las horas transcurridas en tiempo diurno y tiempo nocturno (según la zona horaria del usuario).
2. Se aplica el decaimiento por hora correspondiente a cada periodo.
3. Se actualiza `lastTickAt = now()`.

---

## 3. Curva de Experiencia y Progresión

### 3.1 Fórmula de Nivel
La experiencia requerida para alcanzar el nivel $n$ viene dada por:

$$\text{XP}(n) = \text{round}\left(100 \cdot n^{1.5}\right)$$

| Nivel | XP Acumulada Requerida | Hito Desbloqueado |
|---|---|---|
| 1 | 0 | Eclosión (Bebé) |
| 10 | 3 162 | Evolución a Joven / Nueva habilidad de combate |
| 25 | 12 500 | Evolución a Adulto / Desbloqueo de Arena competitiva |
| 50 | 35 355 | Evolución Forma Final (requiere objeto especial) |
| 100 | 100 000 | Nivel Máximo |

---

## 4. Combate Asíncrono y Elementos

### 4.1 Estadísticas de Combate
- **HP**: Puntos de vida.
- **ATK**: Daño físico.
- **DEF**: Reducción de daño físico.
- **VEL**: Determina el orden de los turnos e iniciativa.
- **ESP**: Poder y resistencia a habilidades elementales especiales.

$$\text{Stat} = \text{round}\left((\text{BaseSpecies} \cdot \text{RarityMultiplier} \cdot (1 + 0.05 \cdot \text{Level})) + \text{AllocatedPoints}\right)$$

### 4.1b Reglas del motor (valores en `balance.json → combats`)
- **Vida en combate** = HP · 4. Por ronda cada bando elige una habilidad con una IA de reglas según su estrategia (agresiva, equilibrada o defensiva) y actúan por prioridad, luego VEL (empate: azar de la semilla). Máximo 30 rondas; si nadie cae gana quien conserve más % de vida.
- **Daño** = potencia · ATK/(ATK+DEF) · 1.5 · (1 + 0.05·nivel del atacante) · afinidad · variación 0.9–1.1 · crítico ×1.5 (6.25 %). Las habilidades elementales usan ESP contra ESP; las neutras, ATK contra DEF.
- **Ánimo y salud**: felicidad y salud multiplican ATK/DEF/ESP/VEL entre ×1.0 y ×0.8, y estar enfermo resta otro 10 %. Cuidar a la mascota mejora su rendimiento.
- **Habilidades** (`skills.json`): 5 neutras y 3 por elemento (nivel 1, 10 y 25), con enfriamientos. Las elementales pueden infligir estados: quemadura (6 % de la vida por ronda), ralentización (−30 % VEL) y savia (−25 % DEF).
- **ELO**: K = 32, suma cero entre jugadores reales, suelo en 0. **Ligas**: Bronce < 1100 ≤ Plata < 1300 ≤ Oro < 1500 ≤ Platino < 1700 ≤ Diamante < 1900 ≤ Mítica.
- **Recompensas**: victoria 40 XP y 25 monedas, empate 25/12, derrota 15/5; los bots dan la mitad. Cada pelea cuesta 15 de energía y hay 10 peleas por 24 h.

### 4.2 Tabla de Afinidades Elementales
- **Fuego**: Fuerte contra Planta ($\times 1.5$), Débil contra Agua ($\times 0.67$).
- **Agua**: Fuerte contra Fuego ($\times 1.5$), Débil contra Planta ($\times 0.67$).
- **Planta**: Fuerte contra Agua ($\times 1.5$), Débil contra Fuego ($\times 0.67$).
- **Eléctrico**: Fuerte contra Agua ($\times 1.5$), Débil contra Tierra/Planta ($\times 0.67$).
- **Sombra / Luz**: Ventaja mutua ($\times 1.5$ entre ellos), neutros frente a elementos naturales.

---

## 5. Misiones y Cofres

### 5.1 Misiones Diarias y Semanales
- **Generación**: cada día se genera un set de 3-5 misiones diarias (mezcla de categorías: cuidar, jugar, pelear, chatear) y un set semanal de 7 misiones.
- **Reset**: a medianoche (zona horaria del usuario) se resetean las diarias. Los domingos se resetean las semanales.
- **Recompensas**: XP + monedas + a veces gemas. Bonus por completar todo el set del día (+50% XP).
- **Cofre diario**: completar todas las misiones diarias desbloquea un cofre de bronce gratis.

### 5.2 Cofres y Sistema de Drops
- **Tipos**: bronce (50 monedas), plata (200 monedas), oro (5 gemas), épico (25 gemas).
- **Drop table**: cada cofre tiene una tabla ponderada en `balance.json → chests`.
- **Pity per-cofre**: garantiza un item raro+ cada 10 aperturas de bronce, legendario+ cada 50 de oro.
- **Evento**: `chest:opened` emitido por WebSocket con items obtenidos.

---

## 6. Hábitat y Decoración

### 6.1 Estructura
- **Habitaciones**: 5 habitaciones (jardín, interior, laboratorio, playa, montaña). Se desbloquean por nivel de cuenta.
- **Muebles**: cada mueble tiene un `type` (decorativo, funcional) y un `bonus` (p. ej. camita: energía decay -10%).
- **Colocación**: grid 8×8 por habitación. Máximo 12 muebles por habitación.
- **Bonificaciones pasivas**: los muebles activos modifican el `lazy tick` de la mascota.

---

## 7. Temporadas

- **Duración**: 8-12 semanas (configurable en `balance.json → seasons`).
- **Tema**: cada temporada tiene un tema (elemento, evento). Afecta a skins, huevos, bosses, minijuegos.
- **Pase**: gratuito y premium (gemas: skins, huevos, muebles).
- **Recompensas de fin**: según liga y posición en clasificación.

---

## 8. Breeding (Cruzamiento)

- **Requisitos**: dos pets del mismo elemento, nivel 20+, ticket de cría (10 gemas).
- **Incubación**: 2 horas (acelerable con gemas).
- **Genética**: descendencia hereda elemento (70/30), patrón (tirada del pool unido), rareza (media de padres ±1 tier), genes (50% de cada padre).
- **Mutación**: 5% de probabilidad de un gen mutante nuevo.
- **Límite**: 1 cría por pet cada 24h.

---

## 9. Raid Boss y Torneo

### 9.1 Raid Boss
- **Ciclo**: un boss semanal (domingo 00:00 UTC). Stats ×3 del boss elemental.
- **Mecánica**: cada jugador ataca hasta 5 veces/día (10 energía/ataque). Progreso global de HP.
- **Recompensas**: según daño infligido + item épico garantizado al vencer.

### 9.2 Torneo Knockout
- **Frecuencia**: semanal (jueves). 64 jugadores de liga Diamond+.
- **Bracket**: eliminación directa, 2 combates por ronda (best-of-3).
- **Cuota**: 10 gemas (refund 5 si pierdes en 1ª ronda).
- **Recompensas**: campeón (item mítico + título), runner-up (legendario), top 8 (raro + gemas).

---

## 10. Cocina y Entrenamiento Elemental

### 10.1 Cocina
- **Mecánica**: minijuego de combinar ingredientes del inventario a una receta.
- **Recetas**: 30 iniciales (10 por elemento). Se desbloquean por nivel.
- **Buff**: el plato da un buff de combate de 24h (p. ej. Sopa de Fuego: ATK +10%).
- **Validación**: el servidor valida la receta y duración del minijuego.

### 10.2 Entrenamiento Elemental
- **Mecánica**: minijuego de timing con el elemento del pet.
- **Buff**: +5% al stat correspondiente por 24h. Bonus +10% si el elemento tiene ventaja sobre el rival siguiente.

---

## 11. Genes y Temperamento

### 11.1 Genes Ocultos
- Cada pet tiene **3 genes** al nacer (ocultos hasta nivel 30).
- **Pool**: Veloz (+10% VEL), Férreo (+10% DEF), Sagaz (crítico +3%), Devorador (+15% comida), Espectral (−15% daño elemental), Resiliente (−20% estados), Afortunado (+5% drop), Intenso (+15% crítico).

### 11.2 Temperamento
- **Tipos**: Valiente (ATA+10%), Tímido (DEF+10%), Arribista (crítico+5%), Estable (variance−30%).
- **Efecto**: modifica la IA de reglas del combate y el tono del chat.

---

## 12. Aventura Narrativa IA

- **Frecuencia**: una aventura nueva cada 24h.
- **Formato**: 3-5 escenas generadas por la IA. Cada escena tiene 2-3 opciones.
- **Decisiones**: el jugador elige. El servidor valida y genera la siguiente escena.
- **Recuerdos**: se guardan en `PetMemory`, la mascota las menciona en el chat.
- **Recompensas**: XP + monedas. Gemas por decisiones correctas.
- **Premium**: aventuras largas/reintentables por 2 gemas.

---

## 13. Bonding y Comunidad

### 13.1 Bonding Meter (0-100)
- **Ganancia**: comer (+1), minijuego (+2), pelear (+2), chatear 10 msgs (+1), completar misión (+3).
- **Decay**: -1 por cada 48h sin interactuar.
- **Niveles**: Extraño (0-20), Amigo (21-40), Buen amigo (41-60), Mejor amigo (61-80), Alma gemela (81-100).
- **Efecto**: bono pasivo por nivel (p. ej. Nivel 3: +5% XP minijuegos).

### 13.2 Pet Buddies
- **Requisito**: dos pets de amigos, ambos nivel 15+.
- **Interacciones**: se persiguen, duermen juntos, pelean (mini-riña), comen juntos.
- **Frecuencia**: 2 interacciones/día. +1 bonding a ambos.

### 13.3 Rituals
- **Detección**: el sistema detecta hábitos del jugador (horarios de comer, jugar, pelear).
- **Streak**: 7 días seguidos → "gift ritual" (monedas/XP/item).
- **Ruptura**: no castiga, pero el pet lo menciona en el chat.

### 13.4 Gifting y Care Packages
- **Gifting**: enviar item del inventario a un amigo. Máx. 3/día.
- **Care Package**: bundle automático [comida + medicina + toy] al pet enfermo de un amigo.
- **Group Feeding**: 3-5 jugadores cocinan juntos un item raro. Se reparte proporcionalmente.

### 13.5 Welcome Back
- **Re-engagement**: al volver tras >24h, el pet muestra un "diario visual" de lo que hizo.
- **Forgiveness ritual**: 48h-7d el pet está "ofendido", >7d está "triste" (secuencia de cuidados).
- **>30d**: "¡Te eché de menos!" con regalo sorpresa.
