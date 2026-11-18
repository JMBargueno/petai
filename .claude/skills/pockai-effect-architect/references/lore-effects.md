# Lore para efectos

Fuente: `docs/LORE.md` (espejo en `web/src/app/lore/content.ts`). Cita la sección en el `lore` del EffectDef.

## Lugares y fenómenos que se pueden pintar

| Lore | Dónde | Cómo se ve |
|---|---|---|
| **Hebras del Nexo**: cada Custodio pone una hebra y los clanes las trenzan. «Las visitas entre Santuarios viajan por las hebras del Nexo.» | §8 | Hilos de luz trenzados; nudos; una hebra que sube y se pierde. |
| **El Telar** (de Mulberry): donde se cristalizan los huevos; «la Promesa del Telar», «el Hilo del Destino». | §2 | Urdimbre y trama; algo que se teje o se desteje. |
| **El Éter Digital** («La Red Viva»): por donde se mueve el Pockai cuando no está. | §9-10 | Vacío oscuro con remolino y nodos lejanos que titilan. |
| **Santuario de Bolsillo / Altar de Escritorio**: la casa del Pockai en tu pantalla. | §10 | Lo propio del escritorio: suelo, sombra y charco de luz. |
| **Rayo Cósmico** (shiny): bit-flip solar al cristalizarse. | §3 | Destello que atraviesa en diagonal y paleta invertida un instante. |
| **Patrones del Éter** (Escamas, Cristal, Galaxia, Aurora). | §3 | Texturas para el interior de un efecto: placas, facetas, estrellas, ondas. |

## Los Seis Flujos del Éter (§4) → rampa del efecto

La rampa sale de `desktop/src/lib/effects/palettes.ts`, con 5 tonos (`outline`, `deep`, `mid`, `light`, `glow`) más el vacío (`void0`, `void1`). El tono medio es el color de UI del elemento (GUIA §3.6).

| Elemento | Flujo | Tono medio | Carácter para animar |
|---|---|---|---|
| fire | Termo-Impulso | `#fb4903` | Chisporrotea, sube, parpadea rápido. |
| water | Flujo de Datos | `#4da2ff` | Ondula, rodea, se derrama. |
| plant | Bio-Red / Raíz Fractal | `#55db9c` | Crece en ramas, despacio. |
| electric | Pulso Voltaico | `#ffd731` | Saltos secos, zigzag, nunca quieto. |
| shadow | Cifrado / Deep Éter | `#5c4ade` | Se cierra, se esconde, aparece por bordes. |
| light | Fibra Óptica / Claridad | `#e6dcf5` | Rayos rectos, destello, revela. |
| neutral | (hebras del Nexo) | `#e9ccff` | Rampa por defecto para elementos desconocidos. |

Un mismo efecto sirve para todos los Flujos cambiando la rampa. Si un Flujo pide otro movimiento, ramifica el dibujo con `frame.palette === FLOW_PALETTES.x`, o mejor con un parámetro del efecto, pero mantén la misma silueta.

## Efectos hechos

| id | Evento | Lore |
|---|---|---|
| `portal-nexo` | Ir de visita y volver (`visitTravel`) | §8: la clave del Nexo baja tres hebras, se trenzan en un arco, la trama se teje y se abre al Éter, y al terminar se deshilacha. |

## Ideas pendientes (propón desde aquí)

| Evento (código) | Idea |
|---|---|
| Entrar en el hábitat (`PetView` `isEnteringHome`, hoy un `enterHome` CSS) | Puerta del Santuario: el panel se abre como un altar y la mascota cruza. |
| Salir del hábitat (`habitatExitDrag.ts`) | El mismo altar, al revés. |
| Invocación rápida (`petai:summon`) | Hebra que cae del Nexo y deja a la mascota en el cursor. |
| Evolución (`eventMap` `evolved`) | Capullo de trama del Telar que se teje alrededor y se rompe en hebras. |
| Amigo de visita llega (`habitat:visitor_joined`) | El portal del amigo con **su** Flujo junto a tu mascota, y sale su Pockai (`VisitorPet`). |
| Shiny (al nacer) | Rayo Cósmico en diagonal. |
| Eclosión (`HatchView`) | Grietas del huevo con luz del Flujo. |
