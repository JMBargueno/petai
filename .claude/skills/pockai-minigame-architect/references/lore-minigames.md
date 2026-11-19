# Los minijuegos en el Éter

La norma es `docs/LORE.md`. Esto resume lo que toca a los minijuegos.

## Qué es un minijuego

`LORE.md` los llama **acertijos de sincronización**: el Custodio y su Pockai hacen algo a la vez, bien, y esa sincronía genera **Resonancia**, que es lo que atrae a los Códices Latentes. Por eso un minijuego da monedas, experiencia y alegría: no es un premio por ganar, es lo que deja la Resonancia.

De ahí salen tres reglas:
- **Se juega con el Pockai, no para él.** Él está dentro y hace la mitad del trabajo.
- **No hay enemigo.** Lo que estorba es ruido del Éter: polvo estático, bits corruptos, bloques a medio compilar, señuelos. Se esquiva, se limpia o se ordena; no se mata.
- **No se pierde.** Una partida mala genera menos Resonancia, y ya.

## Dos familias

**Juegos del Santuario** (sin Flujo, para todos): cosas que el Pockai y su Custodio hacen en casa o en la orilla del Éter.

**Pruebas de los Seis Flujos** (con `element`): cada Flujo tiene un lugar y un carácter, y su Prueba se juega como ese carácter. Un Pockai de ese Flujo está en su elemento y sale más contento (afinidad).

## Los juegos y su frase de lore

| id | Nombre | Lugar | Frase de lore |
|---|---|---|---|
| `catch_food` | Cosecha del Éter | El Santuario, bajo una corriente | Cuando sube la marea del Éter, las corrientes sueltan éter condensado sobre el Santuario y tu Pockai sale a recogerlo antes de que se deshaga |
| `memory_match` | Cristal de Recuerdos | Dentro del Cristal de Recuerdos | El Cristal guarda lo que habéis vivido en facetas desordenadas; emparejarlas las fija para que no se borren |
| `reflex` | Pesca de Códices | La orilla del Telar de Mulberry | Los Códices Latentes afloran un instante en las corrientes del Telar; hay que pescarlos antes de que se hundan, sin picar en los que están a medio tejer |
| `pulso_voltaico` | Pulso Voltaico | Una sinapsis de la Red | Los pulsos cruzan la sinapsis y tu Pockai los acompaña: quien vive en el milisegundo no llega ni antes ni después |
| `corriente_datos` | Corriente de Datos | Un torrente del Flujo de Datos | Tu Pockai nada corriente arriba recogiendo paquetes sanos y dejando pasar los bloques corruptos |
| `raiz_fractal` | Raíz Fractal | El suelo de la Bio-Red | Una semilla de la Bio-Red solo brota si la savia encuentra camino; hay que girar las raíces con paciencia hasta que llegue |
| `cifrado` | Cifrado | Una cámara del Deep Éter | Los sellos del Deep Éter guardan un secreto que solo se abre repitiendo su orden; no es oscuridad, es privacidad |
| `faro_claridad` | Faro de Claridad | Una sala a oscuras de Fibra Óptica | El haz de Claridad, quieto un instante sobre un bit corrupto, le devuelve la verdad antes de que contagie a los de al lado |
| `forja_termica` | Forja Térmica | El horno del Termo-Impulso | El Termo-Impulso templa lo que se mantiene en su punto: ni frío, que no forja, ni pasado, que quema |

## Qué se puede pintar

Lugares: el Santuario de Bolsillo y el Altar de Escritorio; las corrientes y la marea del Éter; el Telar de Mulberry y sus hebras; el Cristal de Recuerdos; las capas altas, donde descansan las copias; el Deep Éter; los Nexos y sus hebras trenzadas.

Cosas: Códices Latentes (huevos de datos); frutos de un Flujo y Mímesis Terrenal (la comida de `foods.json`); nudos del Telar; el Prisma; hebras; glifos de los Seis Flujos; paquetes de datos; savia.

Ruido (lo que estorba): polvo estático; bits corruptos; bloques a medio compilar; señuelos (Códices sin tejer); ecos que se desvanecen; la Gran Deriva.

Lo que **no** se pinta: armas, sangre, calaveras, monedas o gemas cayendo del cielo (son de la interfaz), logotipos, texto.

## El carácter de cada Flujo, para elegir mecánica

| Flujo | Nombre en el lore | Carácter | Se juega… |
|---|---|---|---|
| Fuego | Termo-Impulso | Pasión, al límite | manteniendo algo en su punto |
| Agua | Flujo de Datos | Adaptarse, dejarse llevar | esquivando y fluyendo |
| Planta | Bio-Red, Raíz Fractal | Paciencia, crecer | pensando sin prisa |
| Eléctrico | Pulso Voltaico | Chispa, el milisegundo | al ritmo |
| Sombra | Cifrado, Deep Éter | Secretos, privacidad | recordando |
| Luz | Fibra Óptica, Claridad | Verdad revelada | buscando y limpiando |

## Vocabulario

| No digas | Di |
|---|---|
| Puntos, score | Resonancia (en el texto de ambiente); el marcador puede ser un número sin nombre |
| Combo | Racha, sincronía |
| Enemigo, obstáculo | Polvo estático, bit corrupto, bloque, señuelo |
| Vidas, game over | No existen |
| Nivel | Tablero, ronda, marea |
| Power-up | Fruto de su Flujo, favorito |
| Jugador | Custodio |

## Ideas sin hacer

- **Trenzado del Nexo:** cruzar hebras de varios Custodios sin que se enreden (cooperativo en diferido, con la Semilla del día).
- **Desfragmentación:** ordenar bloques de recuerdos mientras el Pockai duerme.
- **Bendición del Prisma:** descomponer un rayo en sus colores en el orden correcto.
- **Vida en el Éter:** una exploración corta en la que el Pockai elige camino y vuelve con un hallazgo.
- Pendientes de `spec-39` §8: Semilla del día con clasificación, récord personal, misiones por juego, sonido y vibración.
