# El Pockai dentro del juego

La mascota del jugador es la protagonista de cada minijuego. La vista no la dibuja: la recibe lista en `ctx.pet`.

## De dónde viene

- El anfitrión manda la mascota en el mensaje `start` (`src/protocol.ts`, campo `pet`): especie, etapa, paleta, patrón y semilla visual. En el escritorio lo pasa `MinigameHost.svelte`; en Android, `MinigameView.kt`.
- `src/pet.ts` hornea su hoja con el mismo algoritmo que el resto de la app (`@pockai/scene/bake`) y la anima en un `<canvas>`. Es la mascota **de verdad**: su color, su patrón y su etapa.
- Si el anfitrión no manda mascota (un cliente antiguo, la página de demo), sale la especie por defecto. La vista no tiene que comprobar nada.
- La mascota **no entra en la lógica**. Su especie no cambia las reglas ni la puntuación: si lo hiciera, el servidor no podría repetir la partida.

## Cómo se usa en una vista

```ts
mount(root, ctx) {
  const pet = ctx.pet;                 // PetActor
  pet.el.classList.add('pmg-pet');     // un <canvas>; lo colocas tú
  arena.append(pet.el);
  pet.play('idle');
}
render(s) {
  ctx.pet.el.style.left = pct(s.petX, W);
  ctx.pet.face(s.dir);                 // -1 mira a la izquierda, 1 a la derecha, 0 no cambia
  if (s.lastDelta && s.lastDelta.tick !== seen) {
    seen = s.lastDelta.tick;
    ctx.pet.play(s.lastDelta.delta > 0 ? 'happy' : 'hit', { once: true });
  }
}
```

| Miembro | Qué hace |
|---|---|
| `el` | El `<canvas>`. Mide un frame (128×128 px de archivo, 64 nativos). Su tamaño en pantalla lo pone el CSS de la vista |
| `play(clip, { once? })` | Cambia de clip. Con `once`, al acabar vuelve al clip de fondo. Pedir el clip que ya suena no lo reinicia |
| `face(dir)` | Espejo horizontal. Las hojas miran abajo a la derecha |
| `ready` | Promesa que se cumple cuando la hoja está horneada. Hasta entonces el canvas está vacío: no bloquees el juego esperándola |

El anfitrión avanza la animación y la destruye; la vista no llama a nada más.

## Clips

Los nombres son los de `anim.json` de cada especie; un clip que falta cae a su alias y luego a `idle` (`resolveClip`). Los que sirven en un juego:

| Momento | Clip |
|---|---|
| Esperando | `idle` |
| Moviéndose | `walk` (o `run` si existe) |
| Acierto | `happy` |
| Fallo, aturdido | `hit` |
| Esfuerzo (avivar, tirar del sedal) | `attack` |
| Comiendo lo que recoge | `eat` |
| Fin de partida | `happy` |

Comprueba qué clips tiene de verdad una hoja en `shared/assets/species/<id>/anim.json` antes de contar con uno.

## Reglas

- **Hace algo.** Si en tu vista la mascota solo está de pie en una esquina, el juego no está terminado. Es la cesta, el nadador, el pescador, quien aviva el fuelle.
- **Reacciona al estado**, no a los clics: el clip cambia cuando cambia algo del estado (`lastDelta`, `stunned`, `streak`). Así en una repetición se vería lo mismo.
- **Misma densidad de píxel que las piezas** (`pixel-minigame-brief.md`). En una arena de 340 px lógicos, la mascota mide 64 px: `width: calc(64 / 340 * 100%)`.
- **Las cuatro etapas valen.** Una cría mide 28 px de alto y una forma final 54 dentro del mismo frame: ancla la mascota por los pies (fila 60 de 64), no por el centro, y no ajustes la zona de acierto al dibujo: la zona es de la lógica y es igual para todos.
- **No la tapes.** Las piezas pasan por delante solo en el instante de recogerlas.
- **Movimiento reducido:** la mascota sigue cambiando de clip (es información), pero la vista no la sacude ni la hace saltar.
- No le pongas filtros, sombras de CSS con desenfoque ni giros. La sombra de suelo, si hace falta, es una elipse 2:1 plana debajo.
