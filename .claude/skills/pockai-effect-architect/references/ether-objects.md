# Objetos del Éter

Los objetos del Éter son cosas interactivas que el Pockai **saca del Éter**, maneja con su hebra y **devuelve**. Se ven en el escritorio y se pueden arrastrar. El primero es el reloj del pomodoro. Cualquier objeto nuevo (una lista, un temporizador, una nota…) reutiliza el mismo patrón y los mismos tres efectos.

## Lore

En el Éter el Pockai guarda lo que no está usando (§2, §9). Para sacar algo, abre una rendija. Para manejarlo a distancia, tiende su hebra de Custodio, la de §8. Si le piden las cosas más rápido de lo que puede ir, el Éter se traga o escupe el objeto en un parpadeo.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Director | `desktop/src/lib/etherObjects/director.ts` | Pieza pura, con spec. Compara lo que se pide (`desired`) con lo que se ve (`displayed`) y lanza un recado: `summon`, `tap` o `banish`. Si lo pedido cambia mientras hay un recado en curso, lo aborta y salta de golpe al estado nuevo (`rush`). Durante 900 ms, cualquier cambio más también salta de golpe. Los recados nunca se encolan. |
| Store y coreografía | `desktop/src/lib/etherObjects/store.ts` | Guarda la posición de cada objeto (persistida por tipo), su `look` (`hidden`, `emerging`, `present`, `sinking` o `vanishing`) y los efectos ligados al objeto. Define `riftOut`, `riftIn`, `castThread` y `touchObject`. También el recado **sin Pockai** (`runSolo`) y el salto rápido. |
| Tipos | `desktop/src/lib/etherObjects/kinds.ts` | Por tipo de objeto: componente, tamaño, skill que habilita al Pockai y frase que dice al terminar. |
| Capa | `desktop/src/components/EtherObjectLayer.svelte` | Pinta los objetos (`.ether-object`, que está en el click-through) y sus efectos. Permite arrastrarlos con `body.dataset.dragging` y da de alta los adaptadores. |
| Pockai | `runPetErrand` en `PetView.svelte` | Si puede, va a hacer el recado y devuelve una promesa. Si no puede, devuelve `null` y el objeto lo hace solo. Mientras dura el recado, `errandBusy` para el cerebro pero no la locomoción. |

## Reglas

1. **Manda el estado.** El objeto sigue a un store de lo que debe verse (`'running'`, `'paused'`… o `null`). La lógica de verdad, como el contador del pomodoro, cambia **al instante**. La animación solo decide cuándo se *ve* el cambio. No retrases nunca la acción del usuario por la animación.
2. **El Pockai camina, no se teletransporta.** Usa `loco` con velocidad `walk`, o `run` y estela si el objeto está a más de 320 px. Se re-objetiva cada 250 ms por si arrastran el objeto. Si el objeto está a menos de 200 px en horizontal, o si el Pockai está trepando o posado, lanza la hebra desde donde está.
3. **Sin Pockai, el objeto actúa solo.** Esto pasa si el Pockai está fuera, durmiendo, en casa, arrastrado, o si falta su skill. En ese caso el objeto abre o cierra su propia grieta.
4. **Abortar es instantáneo.** `clearObjectFx` retira los efectos del objeto y despierta a quien los esperaba. Quien ejecuta el recado mira `errand.aborted` después de cada `await`.

## Efectos

- `grieta-objeto`: en su `hold`, el objeto emerge (`dir: 'out'`) o se hunde (`'in'`). Va anclada al centro del objeto.
- `hebra-toque`: va de la patita al objeto. Es un efecto `space: 'screen'`: `EffectLayer` le da un lienzo del tamaño del viewport. Los params son celdas nativas; la capa recalcula la punta en cada frame.
- `parpadeo-eter`: el salto rápido, de 240 ms como mucho.

## Añadir un objeto

1. Crea el componente en `desktop/src/components/ether/<Nombre>.svelte`. Recibe `object: EtherObjectView`; el marco en pixel art va teñido con `$etherPalette`. Si lleva controles, deben quedar **dentro** de su caja, porque el click-through solo ve la caja.
2. Añade una entrada en `ETHER_KINDS` con `component`, `w`, `h`, `skill?` y `line(kind, to)`.
3. Crea un adaptador: un store derivado de la lógica real que diga qué modo debe verse. Dalo de alta en `EtherObjectLayer` con `registerEtherObject(id, kind, size, deseo$)`.
4. Prueba los casos rápidos: sacar y guardar al momento, cambiar de modo varias veces seguidas, y repetirlo con el Pockai no disponible. El spec del director cubre la lógica; en la demo, comprueba que no queda nada pintado.
