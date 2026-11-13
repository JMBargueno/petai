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

### 1.3 Patrones y Rasgos Visuales
- Patrones: `liso` (predeterminado), `manchas`, `rayas`, `degradado`, `escamas`, `cristal`, `galaxia`, `aurora`.
- Los patrones avanzados (`escamas`, `cristal`, `galaxia`, `aurora`) solo son accesibles en rarezas Super-raro, Legendario y Mítico.
- Cada criatura recibe una `visualSeed` (entero de 32 bits) y una tupla de paleta (`primaryColor`, `secondaryColor`, `accentColor`) para garantizar un renderizado determinista en todas las plataformas.
- Existe un 2% de probabilidad independiente de variante **Shiny** (paleta invertida o brillante especial).

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

### 4.2 Tabla de Afinidades Elementales
- **Fuego**: Fuerte contra Planta ($\times 1.5$), Débil contra Agua ($\times 0.67$).
- **Agua**: Fuerte contra Fuego ($\times 1.5$), Débil contra Planta ($\times 0.67$).
- **Planta**: Fuerte contra Agua ($\times 1.5$), Débil contra Fuego ($\times 0.67$).
- **Eléctrico**: Fuerte contra Agua ($\times 1.5$), Débil contra Tierra/Planta ($\times 0.67$).
- **Sombra / Luz**: Ventaja mutua ($\times 1.5$ entre ellos), neutros frente a elementos naturales.
