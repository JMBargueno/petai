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
| `portal-nexo` a ×1 | Un amigo llega a tu hábitat o se va (`habitat:visitor_joined/left` → `VisitorPet`, `visitorsShown.ts`) | §8: el mismo portal en el Flujo **del amigo** (`speciesElement`), a la medida de su mascota de 64 px. |
| `capullo-telar` | Evolución (`evolved` → `eventMap` `effect`) | §1, §6: seis hebras en espiral tejen un capullo que tapa a la mascota **mientras se re-hornea su nueva etapa**, se agrieta de luz y estalla en jirones. La forma final lleva corona. |
| `resonancia` | Subida de nivel (`level_up` → `eventMap` `effect`) | §1: ondas a ras de suelo, pulsos a los lados y un Códice que sube por detrás y se parte en destellos. Cede ante la evolución si llegan juntas. |
| `hebra-invocacion` | Invocación rápida (`petai:summon`) | §8: tu hebra baja hasta el cursor, se enrosca en un ovillo y de él brota la mascota (keyframe `sprout`); ya no se teletransporta. |

## Ideas pendientes (propón desde aquí)

| Evento (código) | Idea |
|---|---|
| Entrar en el hábitat: arrastre (`PetView` `isEnteringHome`) **y** el botón del panel (`ControlPanel.svelte` «A casa», que desmonta sin animar) | Altar del Santuario (§10): un altar o una puerta de piedra y madera con runas del Flujo que se abre en el borde del panel. Debe unificar los dos caminos. |
| Salir del hábitat (`habitatExitDrag.ts` → `spawnAt`) | El mismo altar, al revés. |
| Shiny al nacer (`hatched {shiny}`, ignorado por `eventMap`) | Rayo Cósmico (§3): rayo diagonal y bit-flip de paleta; variante periódica para sustituir la franja shiny. **Antes:** `hatched` se reproduce en la mascota activa anterior (`App.svelte` filtra por `petId`). |
| Rareza al nacer (`hatched {rarity}`) | Revelación de densidad (§2): columna de luz con un anillo por densidad; la Singularidad mítica, con el «Primer Latido». |
| Garantía de la Promesa del Telar | Hebras que vibran antes de la revelación (§2). Necesita que el backend exponga `pityTriggered` (`hatching.service.ts`). |
| Bienvenida (`welcome_back {tier}`) | Escarcha que se derrite con una «descarga de luz cálida» (§6), más intensa cuanto más larga fue la ausencia. La spec 28 lo pide. |
| Logro (`achievement {tier}`, rango ignorado) | Pergamino o sello (§7) que crece por rango. |
| Arena (`battle_won/lost/defended`) | Proyección astral (§7): la Sombra Guardiana vuelve y se funde, con glitch si pierde. |
| Juramento de clan cumplido (`clan:goal_completed`) | Trenza de hebras de colores que se tensa (§8). |
| Acción del agente (`AiTab` `open_url`, portapapeles) | Manitas espirituales (§5): mini portal web o pergamino. |
| Enfermo, crítico (`sick`) | Glitch de ánimo (§7): scanlines y desplazamiento de 1 px, sin parpadeos. |
| Baño, dormir | Polvo estático y desfragmentación (§6). |
