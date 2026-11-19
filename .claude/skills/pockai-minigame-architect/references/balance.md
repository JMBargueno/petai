# Balance de un minijuego

Los números viven en `shared/game-data/balance.json` → `minigames`. El servidor (`backend/src/modules/minigames/minigames.service.ts`) los aplica; el cliente solo los muestra.

## Lo que vale para todos

| Clave | Valor | Qué hace |
|---|---|---|
| `energyCost` / `minEnergy` | 10 / 10 | Cada partida cuesta energía; sin ella no se empieza |
| `dailyRewardedSessions` | 20 | Partidas con premio cada 24 h |
| `cooldownSeconds` | 15 | Espera entre partidas |
| `sessionTtlSeconds` | 300 | La sesión caduca; por eso la pausa máxima es de 2 minutos |
| `graceSeconds` | 5 | Margen al comprobar el techo |
| `elementAffinityBonus` | 0,25 | +25 % de felicidad si el Pockai es del Flujo del juego. **Nunca puntos ni monedas** |

No toques estos valores para un juego concreto.

## La entrada de un juego

```json
"mi_juego": {
  "name": "Nombre Visible",
  "element": "fire",
  "durationSeconds": 45,
  "minDurationSeconds": 20,
  "maxScorePerSecond": 2,
  "coinsPerPoint": 0.6,
  "maxCoins": 40,
  "xpPerPoint": 1,
  "maxXp": 60,
  "happiness": 14,
  "itemDrop": { "itemId": "spicy_berry", "minScore": 40, "chance": 0.5 }
}
```

`element` solo en las Pruebas (y obliga a la repetición en el servidor). `itemDrop` es opcional.

## Bandas

| Campo | Banda | Notas |
|---|---|---|
| `durationSeconds` | 30–90 | Acción: 30–45. Pensar o recordar: 60–90 |
| `minDurationSeconds` | ⅓–½ de la duración | En un juego que acaba al completar, lo que tarda un bot perfecto |
| `maxScorePerSecond` | 1,5–4 | La cuenta del techo, redondeada hacia arriba (`minigame-contract.md`) |
| `maxCoins` | 36–40 | Todos los juegos pagan parecido: ninguno es «el que renta» |
| `maxXp` | 50–60 | |
| `happiness` | 12–15 | Los juegos del Santuario, 12–15; las Pruebas, 14 |

**`coinsPerPoint` y `xpPerPoint` se deducen**, no se eligen. Simula unas cientos de partidas con un bot (el de `games.spec.ts` vale) y mira la mediana y el máximo:

```
coinsPerPoint ≈ maxCoins / puntuación de una partida casi perfecta
```

- Una partida **casi perfecta** roza `maxCoins` y `maxXp`; una **normal** se lleva unos dos tercios.
- Una partida floja se lleva más de un tercio: jugar mal no puede sentirse como perder el rato.
- Ejemplo: en Cosecha del Éter la mediana son unos 70 puntos y el máximo unos 90 → `coinsPerPoint: 0.4` (28 y 36 monedas).
- Si cambias cuánto vale un acierto, recalcula los dos. Al rediseñar un juego, compara con lo que pagaba antes y di la diferencia: subirlo sin avisar cambia la economía.

## Premio en objeto

- Uno por juego como mucho. Lo decide el servidor tras validar la partida.
- `minScore` por encima de la mediana (solo las partidas buenas optan); `chance` entre 0,3 y 0,5.
- Tiene sentido de lore: la Forja suelta una Baya Ígnea; la Cosecha, lo que se cosecha. Solo objetos de `foods.json` de tipo `food`; nunca la Piedra de Evolución.
- Con 20 partidas al día y `chance` 0,5 salen hasta 10 objetos: no pongas uno que valga más de 25 monedas.
- `desktop/vite.mock.ts` y `PlayScreen.kt` llevan nombres de objetos a mano para el aviso del premio: añádelo ahí.

## Variante accesible

En `shared/game-data/accessibility.json` → `minigames.<id>`: los multiplicadores que lee la lógica y `"variant": "<id>_easy"`. `validate-game-data.js` exige que cada juego tenga la suya.

- Mismo verbo, misma duración, mismas recompensas (spec 32).
- Ayudas que funcionan: caída o corriente a la mitad, zona de acierto ×2 o ×3, objetivos que esperan, una pista visible, sin aturdimiento.
- Puntuar es más fácil con ella y se acepta. No la capes sin que el usuario lo pida (decisión abierta en `spec-39` §8).
- El techo se comprueba también en la variante fácil: una zona ×3 puede recoger más por segundo.

## Lo que no se cambia sin decirlo

- Subir `maxCoins`, `dailyRewardedSessions` o un `coinsPerPoint` cambia la economía entera.
- Añadir `element` a un clásico lo vuelve obligatorio de repetir y deja fuera a los clientes antiguos.
- Las misiones (`missions.json`, tipo `minigame`) y los logros cuentan partidas terminadas, no puntuación: no les afecta el balance.
